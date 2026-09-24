import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { DevContainerConfigurationSource } from './dev-container-discovery-service.js';

const STATE_VERSION = 1;
const MAX_STATE_BYTES = 128 * 1024;
const MAX_PROJECT_ID_LENGTH = 256;
const MAX_ENVIRONMENT_INSTANCE_ID_LENGTH = 512;
const MAX_PATH_LENGTH = 4096;
const CONTAINER_ID_PATTERN = /^[a-f0-9]{12,128}$/u;
const OWNERSHIP_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export type DevContainerOwnershipPhase = 'starting' | 'owned';

export interface DevContainerOwnershipRecord {
  projectId: string;
  environmentInstanceId: string;
  projectPath: string;
  configSource: DevContainerConfigurationSource;
  ownershipToken: string;
  phase: DevContainerOwnershipPhase;
  containerId?: string;
  claimedAt: string;
  updatedAt: string;
}

interface PersistedState {
  version: 1;
  records: DevContainerOwnershipRecord[];
}

export interface DevContainerOwnershipBinding {
  projectId: string;
  environmentInstanceId: string;
  projectPath: string;
}

export interface DevContainerOwnershipReservation
  extends DevContainerOwnershipBinding {
  configSource: DevContainerConfigurationSource;
}

export interface DevContainerOwnershipAttachment {
  environmentInstanceId: string;
  ownershipToken: string;
  containerId: string;
}

export interface DevContainerOwnershipRelease
  extends DevContainerOwnershipBinding {
  ownershipToken: string;
}

export type DevContainerOwnershipStoreErrorCode =
  | 'DEV_CONTAINER_OWNERSHIP_STATE_INVALID'
  | 'DEV_CONTAINER_OWNERSHIP_EXISTS'
  | 'DEV_CONTAINER_OWNERSHIP_MISMATCH';

export class DevContainerOwnershipStoreError extends Error {
  public constructor(
    public readonly code: DevContainerOwnershipStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DevContainerOwnershipStoreError';
  }
}

export interface DevContainerOwnershipStoreOptions {
  now?: () => Date;
  createOwnershipToken?: () => string;
}

function validText(
  value: unknown,
  maxLength: number,
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    !value.includes('\0')
  );
}

function validIsoTimestamp(value: unknown): value is string {
  if (!validText(value, 64)) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function parseRecord(value: unknown): DevContainerOwnershipRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (
    !validText(record.projectId, MAX_PROJECT_ID_LENGTH) ||
    !validText(
      record.environmentInstanceId,
      MAX_ENVIRONMENT_INSTANCE_ID_LENGTH,
    ) ||
    !validText(record.projectPath, MAX_PATH_LENGTH) ||
    !path.isAbsolute(record.projectPath) ||
    (record.configSource !== '.devcontainer/devcontainer.json' &&
      record.configSource !== '.devcontainer.json') ||
    typeof record.ownershipToken !== 'string' ||
    !OWNERSHIP_TOKEN_PATTERN.test(record.ownershipToken) ||
    (record.phase !== 'starting' && record.phase !== 'owned') ||
    !validIsoTimestamp(record.claimedAt) ||
    !validIsoTimestamp(record.updatedAt)
  ) {
    return undefined;
  }

  const containerId =
    typeof record.containerId === 'string' ? record.containerId : undefined;
  if (
    (record.phase === 'starting' && containerId !== undefined) ||
    (record.phase === 'owned' &&
      (!containerId || !CONTAINER_ID_PATTERN.test(containerId)))
  ) {
    return undefined;
  }

  return {
    projectId: record.projectId,
    environmentInstanceId: record.environmentInstanceId,
    projectPath: path.resolve(record.projectPath),
    configSource: record.configSource,
    ownershipToken: record.ownershipToken,
    phase: record.phase,
    ...(containerId ? { containerId } : {}),
    claimedAt: new Date(record.claimedAt).toISOString(),
    updatedAt: new Date(record.updatedAt).toISOString(),
  };
}

function parseState(content: string): PersistedState | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return undefined;
  }

  const state = parsed as { version?: unknown; records?: unknown };
  if (state.version !== STATE_VERSION || !Array.isArray(state.records)) {
    return undefined;
  }

  const records = state.records.map(parseRecord);
  if (records.some((record) => record === undefined)) return undefined;
  const validRecords = records as DevContainerOwnershipRecord[];

  const environmentIds = new Set(
    validRecords.map((record) => record.environmentInstanceId),
  );
  const ownershipTokens = new Set(
    validRecords.map((record) => record.ownershipToken),
  );
  const projectPaths = new Set(
    validRecords.map((record) => path.resolve(record.projectPath)),
  );

  if (
    environmentIds.size !== validRecords.length ||
    ownershipTokens.size !== validRecords.length ||
    projectPaths.size !== validRecords.length
  ) {
    return undefined;
  }

  return { version: STATE_VERSION, records: validRecords };
}

function normalizedBinding(
  input: DevContainerOwnershipBinding,
): DevContainerOwnershipBinding {
  if (
    !validText(input.projectId, MAX_PROJECT_ID_LENGTH) ||
    !validText(
      input.environmentInstanceId,
      MAX_ENVIRONMENT_INSTANCE_ID_LENGTH,
    ) ||
    !validText(input.projectPath, MAX_PATH_LENGTH) ||
    !path.isAbsolute(input.projectPath)
  ) {
    throw new DevContainerOwnershipStoreError(
      'DEV_CONTAINER_OWNERSHIP_MISMATCH',
      'O vínculo de ownership do Dev Container é inválido.',
    );
  }

  return {
    projectId: input.projectId,
    environmentInstanceId: input.environmentInstanceId,
    projectPath: path.resolve(input.projectPath),
  };
}

function matchesBinding(
  record: DevContainerOwnershipRecord,
  binding: DevContainerOwnershipBinding,
): boolean {
  return (
    record.projectId === binding.projectId &&
    record.environmentInstanceId === binding.environmentInstanceId &&
    record.projectPath === binding.projectPath
  );
}

export class DevContainerOwnershipStore {
  private readonly records = new Map<string, DevContainerOwnershipRecord>();
  private readonly now: () => Date;
  private readonly createOwnershipToken: () => string;
  private loaded = false;
  private loadFailed = false;

  public constructor(
    private readonly statePath: string,
    options: DevContainerOwnershipStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createOwnershipToken =
      options.createOwnershipToken ?? (() => randomUUID());
  }

  public async reserve(
    input: DevContainerOwnershipReservation,
  ): Promise<DevContainerOwnershipRecord> {
    await this.ensureLoaded();
    const binding = normalizedBinding(input);

    if (
      input.configSource !== '.devcontainer/devcontainer.json' &&
      input.configSource !== '.devcontainer.json'
    ) {
      throw new DevContainerOwnershipStoreError(
        'DEV_CONTAINER_OWNERSHIP_MISMATCH',
        'A origem da configuração Dev Container é inválida para ownership.',
      );
    }

    if (
      this.records.has(binding.environmentInstanceId) ||
      [...this.records.values()].some(
        (record) => record.projectPath === binding.projectPath,
      )
    ) {
      throw new DevContainerOwnershipStoreError(
        'DEV_CONTAINER_OWNERSHIP_EXISTS',
        'Já existe ownership de Dev Container para este ambiente.',
      );
    }

    const ownershipToken = this.createOwnershipToken();
    if (!OWNERSHIP_TOKEN_PATTERN.test(ownershipToken)) {
      throw new DevContainerOwnershipStoreError(
        'DEV_CONTAINER_OWNERSHIP_MISMATCH',
        'O token interno de ownership do Dev Container é inválido.',
      );
    }

    const now = this.now().toISOString();
    const record: DevContainerOwnershipRecord = {
      ...binding,
      configSource: input.configSource,
      ownershipToken,
      phase: 'starting',
      claimedAt: now,
      updatedAt: now,
    };

    this.records.set(record.environmentInstanceId, record);
    try {
      await this.persist();
    } catch (error) {
      this.records.delete(record.environmentInstanceId);
      throw error;
    }
    return record;
  }

  public async attach(
    input: DevContainerOwnershipAttachment,
  ): Promise<DevContainerOwnershipRecord> {
    await this.ensureLoaded();

    if (
      !validText(
        input.environmentInstanceId,
        MAX_ENVIRONMENT_INSTANCE_ID_LENGTH,
      ) ||
      !OWNERSHIP_TOKEN_PATTERN.test(input.ownershipToken) ||
      !CONTAINER_ID_PATTERN.test(input.containerId)
    ) {
      throw new DevContainerOwnershipStoreError(
        'DEV_CONTAINER_OWNERSHIP_MISMATCH',
        'A associação do runtime Dev Container é inválida.',
      );
    }

    const current = this.records.get(input.environmentInstanceId);
    if (!current || current.ownershipToken !== input.ownershipToken) {
      throw new DevContainerOwnershipStoreError(
        'DEV_CONTAINER_OWNERSHIP_MISMATCH',
        'O runtime não corresponde à reserva de ownership existente.',
      );
    }

    if (current.phase === 'owned') {
      if (current.containerId === input.containerId) return current;
      throw new DevContainerOwnershipStoreError(
        'DEV_CONTAINER_OWNERSHIP_MISMATCH',
        'A Environment Instance já possui outro runtime Dev Container.',
      );
    }

    const next: DevContainerOwnershipRecord = {
      ...current,
      phase: 'owned',
      containerId: input.containerId,
      updatedAt: this.now().toISOString(),
    };
    this.records.set(next.environmentInstanceId, next);
    try {
      await this.persist();
    } catch (error) {
      this.records.set(current.environmentInstanceId, current);
      throw error;
    }
    return next;
  }

  public async get(
    input: DevContainerOwnershipBinding,
  ): Promise<DevContainerOwnershipRecord | undefined> {
    await this.ensureLoaded();
    const binding = normalizedBinding(input);
    const record = this.records.get(binding.environmentInstanceId);
    return record && matchesBinding(record, binding) ? record : undefined;
  }

  public async release(
    input: DevContainerOwnershipRelease,
  ): Promise<boolean> {
    await this.ensureLoaded();
    const binding = normalizedBinding(input);
    const current = this.records.get(binding.environmentInstanceId);
    if (
      !current ||
      !matchesBinding(current, binding) ||
      current.ownershipToken !== input.ownershipToken
    ) {
      return false;
    }

    this.records.delete(binding.environmentInstanceId);
    try {
      await this.persist();
    } catch (error) {
      this.records.set(current.environmentInstanceId, current);
      throw error;
    }
    return true;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loadFailed) {
      throw new DevContainerOwnershipStoreError(
        'DEV_CONTAINER_OWNERSHIP_STATE_INVALID',
        'O estado persistido de ownership do Dev Container é inválido.',
      );
    }
    if (this.loaded) return;

    try {
      const info = await stat(this.statePath);
      if (!info.isFile() || info.size > MAX_STATE_BYTES) {
        this.loadFailed = true;
        throw new DevContainerOwnershipStoreError(
          'DEV_CONTAINER_OWNERSHIP_STATE_INVALID',
          'O estado persistido de ownership do Dev Container é inválido.',
        );
      }

      const state = parseState(await readFile(this.statePath, 'utf8'));
      if (!state) {
        this.loadFailed = true;
        throw new DevContainerOwnershipStoreError(
          'DEV_CONTAINER_OWNERSHIP_STATE_INVALID',
          'O estado persistido de ownership do Dev Container é inválido.',
        );
      }

      for (const record of state.records) {
        this.records.set(record.environmentInstanceId, record);
      }
      this.loaded = true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        this.loaded = true;
        return;
      }
      if (error instanceof DevContainerOwnershipStoreError) throw error;
      this.loadFailed = true;
      throw new DevContainerOwnershipStoreError(
        'DEV_CONTAINER_OWNERSHIP_STATE_INVALID',
        'O estado persistido de ownership do Dev Container não pôde ser lido.',
      );
    }
  }

  private async persist(): Promise<void> {
    await mkdir(path.dirname(this.statePath), {
      recursive: true,
      mode: 0o700,
    });
    const state: PersistedState = {
      version: STATE_VERSION,
      records: [...this.records.values()].sort((left, right) =>
        left.environmentInstanceId.localeCompare(right.environmentInstanceId),
      ),
    };
    const content = `${JSON.stringify(state, null, 2)}\n`;

    if (Buffer.byteLength(content, 'utf8') > MAX_STATE_BYTES) {
      throw new DevContainerOwnershipStoreError(
        'DEV_CONTAINER_OWNERSHIP_STATE_INVALID',
        'O estado de ownership do Dev Container excedeu o limite seguro.',
      );
    }

    const temporary = `${this.statePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, content, {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporary, this.statePath);
  }
}
