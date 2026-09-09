import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Project } from '@dev-dashboard/contracts';

const MAX_STATE_BYTES = 64 * 1024;
const STATE_VERSION = 1;

export interface DockerComposeOwnershipRecord {
  projectId: string;
  projectPath: string;
  composeProjectName: string;
  startedAt: string;
}

interface PersistedState {
  version: 1;
  records: DockerComposeOwnershipRecord[];
}

export interface DockerComposeOwnershipStoreOptions {
  now?: () => Date;
}

function validText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    !value.includes('\0')
  );
}

function parseRecord(value: unknown): DockerComposeOwnershipRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (
    !validText(record.projectId, 256) ||
    !validText(record.projectPath, 4096) ||
    !validText(record.composeProjectName, 256) ||
    !validText(record.startedAt, 64)
  ) {
    return undefined;
  }

  const startedAt = new Date(record.startedAt);
  if (Number.isNaN(startedAt.getTime())) return undefined;

  return {
    projectId: record.projectId,
    projectPath: path.resolve(record.projectPath),
    composeProjectName: record.composeProjectName,
    startedAt: startedAt.toISOString(),
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
  const unique = new Set(records.map((record) => record!.projectId));
  if (unique.size !== records.length) return undefined;

  return {
    version: STATE_VERSION,
    records: records as DockerComposeOwnershipRecord[],
  };
}

export class DockerComposeOwnershipStore {
  private readonly records = new Map<string, DockerComposeOwnershipRecord>();
  private readonly now: () => Date;
  private loaded = false;

  public constructor(
    private readonly statePath: string,
    options: DockerComposeOwnershipStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  public async claim(
    project: Project,
    composeProjectName: string,
  ): Promise<DockerComposeOwnershipRecord> {
    await this.ensureLoaded();
    if (!validText(composeProjectName, 256)) {
      throw new Error('Nome do projeto Compose inválido para ownership.');
    }

    const record: DockerComposeOwnershipRecord = {
      projectId: project.id,
      projectPath: path.resolve(project.path),
      composeProjectName,
      startedAt: this.now().toISOString(),
    };
    this.records.set(project.id, record);
    await this.persist();
    return record;
  }

  public async get(
    project: Project,
  ): Promise<DockerComposeOwnershipRecord | undefined> {
    await this.ensureLoaded();
    const record = this.records.get(project.id);
    if (!record) return undefined;
    return record.projectPath === path.resolve(project.path) ? record : undefined;
  }

  public async owns(
    project: Project,
    composeProjectName: string,
  ): Promise<boolean> {
    const record = await this.get(project);
    return record?.composeProjectName === composeProjectName;
  }

  public async release(project: Project): Promise<boolean> {
    await this.ensureLoaded();
    const record = this.records.get(project.id);
    if (!record || record.projectPath !== path.resolve(project.path)) return false;
    this.records.delete(project.id);
    await this.persist();
    return true;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    try {
      const info = await stat(this.statePath);
      if (!info.isFile() || info.size > MAX_STATE_BYTES) return;
      const state = parseState(await readFile(this.statePath, 'utf8'));
      if (!state) return;
      for (const record of state.records) {
        this.records.set(record.projectId, record);
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw error;
    }
  }

  private async persist(): Promise<void> {
    await mkdir(path.dirname(this.statePath), { recursive: true });
    const state: PersistedState = {
      version: STATE_VERSION,
      records: [...this.records.values()].sort((left, right) =>
        left.projectId.localeCompare(right.projectId),
      ),
    };
    const content = `${JSON.stringify(state, null, 2)}\n`;
    if (Buffer.byteLength(content, 'utf8') > MAX_STATE_BYTES) {
      throw new Error('Estado de ownership do Compose excedeu o limite seguro.');
    }

    const temporary = `${this.statePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, this.statePath);
  }
}
