import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { AgentConcreteProviderId } from './contracts.js';
import { AgentTaskLockManager } from './task-lock.js';

const STORE_VERSION = 1;
const MAX_ID_CHARS = 256;

export type AgentLocalProviderId = Extract<
  AgentConcreteProviderId,
  'codex' | 'claude-code'
>;

export interface AgentProviderPreference {
  projectId: string;
  preferredProviderId: AgentLocalProviderId;
  fallbackOrder: AgentLocalProviderId[];
  updatedAt: string;
}

interface PersistedAgentProviderPreferenceState {
  version: 1;
  preferences: AgentProviderPreference[];
}

export interface AgentProviderPreferenceStoreOptions {
  stateDirectory: string;
  lockManager?: AgentTaskLockManager;
}

export type AgentProviderPreferenceStoreErrorCode =
  'AGENT_PROVIDER_PREFERENCE_INVALID' | 'AGENT_PROVIDER_PREFERENCE_CORRUPT';

export class AgentProviderPreferenceStoreError extends Error {
  public constructor(
    public readonly code: AgentProviderPreferenceStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AgentProviderPreferenceStoreError';
  }
}

function isLocalProviderId(value: unknown): value is AgentLocalProviderId {
  return value === 'codex' || value === 'claude-code';
}

function assertProjectId(projectId: string): void {
  if (
    typeof projectId !== 'string' ||
    projectId.length === 0 ||
    projectId.length > MAX_ID_CHARS ||
    projectId.includes('\0')
  ) {
    throw new AgentProviderPreferenceStoreError(
      'AGENT_PROVIDER_PREFERENCE_INVALID',
      'Agent provider preference project id is invalid.',
    );
  }
}

function isPreference(value: unknown): value is AgentProviderPreference {
  if (!value || typeof value !== 'object') return false;
  const preference = value as Partial<AgentProviderPreference>;
  return (
    typeof preference.projectId === 'string' &&
    preference.projectId.length > 0 &&
    preference.projectId.length <= MAX_ID_CHARS &&
    !preference.projectId.includes('\0') &&
    isLocalProviderId(preference.preferredProviderId) &&
    Array.isArray(preference.fallbackOrder) &&
    preference.fallbackOrder.length <= 2 &&
    preference.fallbackOrder.every(isLocalProviderId) &&
    new Set(preference.fallbackOrder).size ===
      preference.fallbackOrder.length &&
    Number.isFinite(Date.parse(preference.updatedAt ?? ''))
  );
}

function emptyState(): PersistedAgentProviderPreferenceState {
  return { version: STORE_VERSION, preferences: [] };
}

export class AgentProviderPreferenceStore {
  private readonly filePath: string;
  private readonly lockManager: AgentTaskLockManager;

  public constructor(options: AgentProviderPreferenceStoreOptions) {
    if (!options.stateDirectory) {
      throw new AgentProviderPreferenceStoreError(
        'AGENT_PROVIDER_PREFERENCE_INVALID',
        'Agent provider preference state directory is required.',
      );
    }
    this.filePath = path.join(
      options.stateDirectory,
      'provider-preferences.json',
    );
    this.lockManager =
      options.lockManager ??
      new AgentTaskLockManager({ stateDirectory: options.stateDirectory });
  }

  public async get(projectId: string): Promise<AgentProviderPreference | null> {
    assertProjectId(projectId);
    const state = await this.readState();
    const preference = state.preferences.find(
      (candidate) => candidate.projectId === projectId,
    );
    return preference ? structuredClone(preference) : null;
  }

  public async set(
    preference: AgentProviderPreference,
  ): Promise<AgentProviderPreference> {
    assertProjectId(preference.projectId);
    if (!isPreference(preference)) {
      throw new AgentProviderPreferenceStoreError(
        'AGENT_PROVIDER_PREFERENCE_INVALID',
        'Agent provider preference is invalid.',
      );
    }

    const release = await this.lockManager.acquire(
      'agent-provider-preferences-store',
      { wait: true },
    );
    try {
      const state = await this.readState();
      const index = state.preferences.findIndex(
        (candidate) => candidate.projectId === preference.projectId,
      );
      if (index >= 0) {
        state.preferences[index] = structuredClone(preference);
      } else {
        state.preferences.push(structuredClone(preference));
      }
      await this.writeState(state);
      return structuredClone(preference);
    } finally {
      await release();
    }
  }

  public async clear(projectId: string): Promise<void> {
    assertProjectId(projectId);
    const release = await this.lockManager.acquire(
      'agent-provider-preferences-store',
      { wait: true },
    );
    try {
      const state = await this.readState();
      state.preferences = state.preferences.filter(
        (candidate) => candidate.projectId !== projectId,
      );
      await this.writeState(state);
    } finally {
      await release();
    }
  }

  private async readState(): Promise<PersistedAgentProviderPreferenceState> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const value: unknown = JSON.parse(raw);
      if (
        !value ||
        typeof value !== 'object' ||
        (value as { version?: unknown }).version !== STORE_VERSION ||
        !Array.isArray((value as { preferences?: unknown }).preferences) ||
        !(value as { preferences: unknown[] }).preferences.every(isPreference)
      ) {
        throw new Error('invalid state');
      }
      return value as PersistedAgentProviderPreferenceState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return emptyState();
      }
      throw new AgentProviderPreferenceStoreError(
        'AGENT_PROVIDER_PREFERENCE_CORRUPT',
        'Agent provider preference state is corrupt.',
      );
    }
  }

  private async writeState(
    state: PersistedAgentProviderPreferenceState,
  ): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), {
      recursive: true,
      mode: 0o700,
    });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(state), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await fs.rename(tempPath, this.filePath);
  }
}
