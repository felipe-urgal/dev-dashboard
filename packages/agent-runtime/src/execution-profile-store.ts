import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { AgentCapability, AgentProviderId } from './contracts.js';
import { AgentTaskLockManager } from './task-lock.js';

const STORE_VERSION = 1;
const MAX_PROFILES = 8;
const MAX_ID_CHARS = 64;
const MAX_LABEL_CHARS = 80;
const MIN_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30 * 60 * 1_000;

const CAPABILITIES = new Set<AgentCapability>([
  'workspace:write',
  'git:commit',
  'git:push',
  'github:pull-request',
  'github:merge',
  'deployment:run',
  'release:run',
]);

export interface AgentExecutionProfile {
  id: string;
  label: string;
  providerId: AgentProviderId;
  fallbackOrder?: Array<'codex' | 'claude-code'>;
  timeoutMs?: number;
  budget?: {
    maxTotalTokens?: number;
    maxEstimatedCostUsd?: number;
    mode?: 'soft' | 'hard';
  };
  requestedCapabilities: AgentCapability[];
}

export interface AgentExecutionProfileConfiguration {
  projectId: string;
  defaultProfileId?: string;
  profiles: AgentExecutionProfile[];
  updatedAt: string;
}

interface PersistedState {
  version: 1;
  configurations: AgentExecutionProfileConfiguration[];
}

export interface AgentExecutionProfileStoreOptions {
  stateDirectory: string;
  lockManager?: AgentTaskLockManager;
}

export class AgentExecutionProfileStoreError extends Error {
  constructor(
    readonly code:
      'AGENT_EXECUTION_PROFILE_INVALID' | 'AGENT_EXECUTION_PROFILE_CORRUPT',
    message: string,
  ) {
    super(message);
    this.name = 'AgentExecutionProfileStoreError';
  }
}

function bounded(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    !value.includes('\0')
  );
}

function provider(value: unknown): value is AgentProviderId {
  return (
    value === 'automatic' ||
    value === 'codex' ||
    value === 'claude-code' ||
    value === 'chatgpt-browser'
  );
}

function localProvider(value: unknown): value is 'codex' | 'claude-code' {
  return value === 'codex' || value === 'claude-code';
}

function validBudget(
  value: unknown,
): value is NonNullable<AgentExecutionProfile['budget']> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const budget = value as NonNullable<AgentExecutionProfile['budget']>;
  const hasLimit =
    budget.maxTotalTokens !== undefined ||
    budget.maxEstimatedCostUsd !== undefined;
  return (
    hasLimit &&
    (budget.maxTotalTokens === undefined ||
      (Number.isSafeInteger(budget.maxTotalTokens) &&
        budget.maxTotalTokens > 0)) &&
    (budget.maxEstimatedCostUsd === undefined ||
      (Number.isFinite(budget.maxEstimatedCostUsd) &&
        budget.maxEstimatedCostUsd > 0)) &&
    (budget.mode === undefined ||
      budget.mode === 'soft' ||
      budget.mode === 'hard')
  );
}

function validProfile(value: unknown): value is AgentExecutionProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const profile = value as AgentExecutionProfile;
  if (
    !bounded(profile.id, MAX_ID_CHARS) ||
    !/^[a-z0-9][a-z0-9-]*$/u.test(profile.id) ||
    !bounded(profile.label, MAX_LABEL_CHARS) ||
    !provider(profile.providerId) ||
    !Array.isArray(profile.requestedCapabilities) ||
    profile.requestedCapabilities.length > CAPABILITIES.size ||
    !profile.requestedCapabilities.every(
      (capability) =>
        typeof capability === 'string' &&
        CAPABILITIES.has(capability as AgentCapability),
    ) ||
    new Set(profile.requestedCapabilities).size !==
      profile.requestedCapabilities.length
  ) {
    return false;
  }
  if (
    profile.fallbackOrder !== undefined &&
    (!Array.isArray(profile.fallbackOrder) ||
      profile.fallbackOrder.length > 2 ||
      !profile.fallbackOrder.every(localProvider) ||
      new Set(profile.fallbackOrder).size !== profile.fallbackOrder.length ||
      profile.providerId !== 'automatic')
  ) {
    return false;
  }
  if (
    profile.timeoutMs !== undefined &&
    (!Number.isSafeInteger(profile.timeoutMs) ||
      profile.timeoutMs < MIN_TIMEOUT_MS ||
      profile.timeoutMs > MAX_TIMEOUT_MS)
  ) {
    return false;
  }
  return profile.budget === undefined || validBudget(profile.budget);
}

function validConfiguration(
  value: unknown,
): value is AgentExecutionProfileConfiguration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const config = value as AgentExecutionProfileConfiguration;
  return (
    bounded(config.projectId, 256) &&
    Array.isArray(config.profiles) &&
    config.profiles.length <= MAX_PROFILES &&
    config.profiles.every(validProfile) &&
    new Set(config.profiles.map((profile) => profile.id)).size ===
      config.profiles.length &&
    (config.defaultProfileId === undefined ||
      (bounded(config.defaultProfileId, MAX_ID_CHARS) &&
        config.profiles.some(
          (profile) => profile.id === config.defaultProfileId,
        ))) &&
    Number.isFinite(Date.parse(config.updatedAt))
  );
}

function emptyState(): PersistedState {
  return { version: STORE_VERSION, configurations: [] };
}

export class AgentExecutionProfileStore {
  private readonly filePath: string;
  private readonly lockManager: AgentTaskLockManager;

  constructor(options: AgentExecutionProfileStoreOptions) {
    if (!options.stateDirectory) {
      throw new AgentExecutionProfileStoreError(
        'AGENT_EXECUTION_PROFILE_INVALID',
        'Agent execution profile state directory is required.',
      );
    }
    this.filePath = path.join(
      options.stateDirectory,
      'execution-profiles.json',
    );
    this.lockManager =
      options.lockManager ??
      new AgentTaskLockManager({ stateDirectory: options.stateDirectory });
  }

  async get(
    projectId: string,
  ): Promise<AgentExecutionProfileConfiguration | null> {
    if (!bounded(projectId, 256)) {
      throw new AgentExecutionProfileStoreError(
        'AGENT_EXECUTION_PROFILE_INVALID',
        'Agent execution profile project id is invalid.',
      );
    }
    const state = await this.read();
    const config = state.configurations.find(
      (candidate) => candidate.projectId === projectId,
    );
    return config ? structuredClone(config) : null;
  }

  async set(
    configuration: AgentExecutionProfileConfiguration,
  ): Promise<AgentExecutionProfileConfiguration> {
    if (!validConfiguration(configuration)) {
      throw new AgentExecutionProfileStoreError(
        'AGENT_EXECUTION_PROFILE_INVALID',
        'Agent execution profile configuration is invalid.',
      );
    }

    const release = await this.lockManager.acquire(
      'agent-execution-profiles-store',
      { wait: true },
    );
    try {
      const state = await this.read();
      const index = state.configurations.findIndex(
        (candidate) => candidate.projectId === configuration.projectId,
      );
      const normalized = structuredClone(configuration);
      if (index >= 0) state.configurations[index] = normalized;
      else state.configurations.push(normalized);
      await this.write(state);
      return structuredClone(normalized);
    } finally {
      await release();
    }
  }

  private async read(): Promise<PersistedState> {
    try {
      const parsed: unknown = JSON.parse(
        await fs.readFile(this.filePath, 'utf8'),
      );
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        (parsed as PersistedState).version !== STORE_VERSION ||
        !Array.isArray((parsed as PersistedState).configurations) ||
        !(parsed as PersistedState).configurations.every(validConfiguration)
      ) {
        throw new Error('invalid execution profile state');
      }
      return parsed as PersistedState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return emptyState();
      throw new AgentExecutionProfileStoreError(
        'AGENT_EXECUTION_PROFILE_CORRUPT',
        'Agent execution profile state is corrupt.',
      );
    }
  }

  private async write(state: PersistedState): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), {
      recursive: true,
      mode: 0o700,
    });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporary, JSON.stringify(state, null, 2) + '\n', {
      encoding: 'utf8',
      mode: 0o600,
    });
    await fs.rename(temporary, this.filePath);
  }
}
