import { createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { AgentTaskRecord, AgentTaskState } from './contracts.js';

const SCHEMA_VERSION = 1;
const MAX_INDEX_BYTES = 16 * 1024 * 1024;
const REVISION_PATTERN = /^[a-f0-9]{40}$/;

export interface PriorityTaskIndexEntry {
  id: string;
  version: number;
  state: AgentTaskState;
  updatedAt: string;
  archivedAt?: string;
}

export interface PriorityTaskIndex {
  schemaVersion: 1;
  projectId: string;
  revision: string;
  entries: PriorityTaskIndexEntry[];
  checksum: string;
}

function indexDirectory(repositoryDirectory: string): string {
  return path.join(repositoryDirectory + '.runtime', 'task-priority-index');
}

export function priorityIndexPath(
  repositoryDirectory: string,
  projectId: string,
): string {
  const stem = createHash('sha256').update(projectId).digest('hex');
  return path.join(indexDirectory(repositoryDirectory), stem + '.json');
}

export function indexEntry(record: AgentTaskRecord): PriorityTaskIndexEntry {
  return {
    id: record.task.id,
    version: record.version,
    state: record.task.state,
    updatedAt: record.task.updatedAt,
    ...(record.task.archivedAt ? { archivedAt: record.task.archivedAt } : {}),
  };
}

export function comparePriorityEntries(
  left: PriorityTaskIndexEntry,
  right: PriorityTaskIndexEntry,
): number {
  const terminal = (state: AgentTaskState) =>
    state === 'completed' || state === 'cancelled';
  const priority = Number(terminal(left.state)) - Number(terminal(right.state));
  if (priority) return priority;
  const recent = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  return recent || left.id.localeCompare(right.id);
}

function digest(input: Omit<PriorityTaskIndex, 'checksum'>): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function validatedIndex(
  value: unknown,
  projectId: string,
  revision: string,
): PriorityTaskIndex | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (
    item.schemaVersion !== SCHEMA_VERSION ||
    item.projectId !== projectId ||
    item.revision !== revision ||
    typeof item.checksum !== 'string' ||
    !Array.isArray(item.entries)
  )
    return null;

  const seen = new Set<string>();
  for (const raw of item.entries) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const entry = raw as Record<string, unknown>;
    if (
      typeof entry.id !== 'string' ||
      entry.id.length === 0 ||
      entry.id.length > 256 ||
      seen.has(entry.id) ||
      !Number.isSafeInteger(entry.version) ||
      (entry.version as number) < 0 ||
      ![
        'queued',
        'running',
        'checkpoint',
        'review',
        'blocked',
        'failed',
        'completed',
        'cancelled',
      ].includes(String(entry.state)) ||
      typeof entry.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(entry.updatedAt)) ||
      (entry.archivedAt !== undefined &&
        (typeof entry.archivedAt !== 'string' ||
          !Number.isFinite(Date.parse(entry.archivedAt)) ||
          (entry.state !== 'completed' && entry.state !== 'cancelled')))
    )
      return null;
    seen.add(entry.id);
  }

  const entries = item.entries as PriorityTaskIndexEntry[];
  for (let i = 1; i < entries.length; i += 1) {
    if (comparePriorityEntries(entries[i - 1]!, entries[i]!) > 0) return null;
  }
  const content = {
    schemaVersion: 1 as const,
    projectId,
    revision,
    entries,
  };
  return digest(content) === item.checksum
    ? { ...content, checksum: item.checksum }
    : null;
}

export function buildPriorityIndex(
  projectId: string,
  revision: string,
  entries: PriorityTaskIndexEntry[],
): PriorityTaskIndex {
  const sorted = [...entries].sort(comparePriorityEntries);
  const content = {
    schemaVersion: SCHEMA_VERSION as 1,
    projectId,
    revision,
    entries: sorted,
  };
  return { ...content, checksum: digest(content) };
}

async function safeIndexDirectory(
  repositoryDirectory: string,
): Promise<string | null> {
  const directory = indexDirectory(repositoryDirectory);
  try {
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('Agent task priority index directory is unsafe.');
    }
    return directory;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function readPriorityIndex(
  repositoryDirectory: string,
  projectId: string,
  revision: string,
): Promise<PriorityTaskIndex | null> {
  if (!REVISION_PATTERN.test(revision)) return null;
  if (!(await safeIndexDirectory(repositoryDirectory))) return null;
  const file = priorityIndexPath(repositoryDirectory, projectId);
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('Agent task priority index file is unsafe.');
    }
    if (stat.size > MAX_INDEX_BYTES) return null;
    const raw = await fs.readFile(file, 'utf8');
    return validatedIndex(JSON.parse(raw) as unknown, projectId, revision);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function writePriorityIndex(
  repositoryDirectory: string,
  index: PriorityTaskIndex,
): Promise<void> {
  const directory = indexDirectory(repositoryDirectory);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await safeIndexDirectory(repositoryDirectory);
  const destination = priorityIndexPath(repositoryDirectory, index.projectId);
  try {
    const stat = await fs.lstat(destination);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('Agent task priority index file is unsafe.');
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const serialized = JSON.stringify(index);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_INDEX_BYTES) return;
  const temporary =
    destination +
    '.' +
    process.pid +
    '.' +
    randomBytes(6).toString('hex') +
    '.tmp';
  try {
    await fs.writeFile(temporary, serialized, {
      mode: 0o600,
      flag: 'wx',
    });
    await fs.rename(temporary, destination);
  } finally {
    await fs.unlink(temporary).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    });
  }
}
