import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';

import { resolveConfigDirectory } from './config-directory.js';

export interface ProjectRecentAccess {
  projectId: string;
  workspaceId: string;
  lastAccessedAt: string;
}

interface ProjectRecentConfig {
  version: 1;
  entries: ProjectRecentAccess[];
}

export const PROJECT_RECENT_LIMITS = {
  perWorkspace: 20,
  total: 500,
} as const;

const MAX_ID_LENGTH = 256;

function isValidId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH
  );
}

function isEntry(value: unknown): value is ProjectRecentAccess {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const entry = value as Record<string, unknown>;
  return (
    isValidId(entry.projectId) &&
    isValidId(entry.workspaceId) &&
    typeof entry.lastAccessedAt === 'string' &&
    Number.isFinite(Date.parse(entry.lastAccessedAt))
  );
}

function applyLimits(entries: ProjectRecentAccess[]): ProjectRecentAccess[] {
  const counts = new Map<string, number>();
  const projectIds = new Set<string>();
  const limited: ProjectRecentAccess[] = [];

  for (const entry of [...entries].sort((left, right) =>
    right.lastAccessedAt.localeCompare(left.lastAccessedAt),
  )) {
    if (projectIds.has(entry.projectId)) continue;
    const workspaceCount = counts.get(entry.workspaceId) ?? 0;
    if (workspaceCount >= PROJECT_RECENT_LIMITS.perWorkspace) continue;

    projectIds.add(entry.projectId);
    counts.set(entry.workspaceId, workspaceCount + 1);
    limited.push(entry);
    if (limited.length >= PROJECT_RECENT_LIMITS.total) break;
  }

  return limited;
}

function parseConfig(contents: string): ProjectRecentAccess[] {
  const parsed: unknown = JSON.parse(contents);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    return [];
  const candidate = parsed as Record<string, unknown>;
  if (candidate.version !== 1 || !Array.isArray(candidate.entries)) return [];
  return applyLimits(candidate.entries.filter(isEntry));
}

export class ProjectRecentRepository {
  private readonly directory: string;
  private readonly file: string;
  private entries: ProjectRecentAccess[];
  private mutationQueue: Promise<void> = Promise.resolve();

  public constructor(
    directory = resolveConfigDirectory(),
    private readonly now: () => Date = () => new Date(),
  ) {
    this.directory = directory;
    this.file = path.join(directory, 'project-recents.json');
    try {
      this.entries = parseConfig(readFileSync(this.file, 'utf8'));
    } catch {
      this.entries = [];
    }
  }

  public get filePath(): string {
    return this.file;
  }

  public list(): readonly ProjectRecentAccess[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  public find(projectId: string): ProjectRecentAccess | null {
    const entry = this.entries.find((item) => item.projectId === projectId);
    return entry ? { ...entry } : null;
  }

  public async record(
    projectId: string,
    workspaceId: string,
  ): Promise<ProjectRecentAccess> {
    if (!isValidId(projectId) || !isValidId(workspaceId)) {
      throw new Error('Os identificadores do projeto recente são inválidos.');
    }

    const entry: ProjectRecentAccess = {
      projectId,
      workspaceId,
      lastAccessedAt: this.now().toISOString(),
    };

    const operation = this.mutationQueue.then(async () => {
      const next = applyLimits([
        entry,
        ...this.entries.filter((item) => item.projectId !== projectId),
      ]);

      await fsPromises.mkdir(this.directory, { recursive: true, mode: 0o700 });
      const temporaryFile = `${this.file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
      await fsPromises.writeFile(
        temporaryFile,
        `${JSON.stringify({ version: 1, entries: next } satisfies ProjectRecentConfig, null, 2)}\n`,
        { encoding: 'utf8', mode: 0o600 },
      );
      await fsPromises.rename(temporaryFile, this.file);
      this.entries = next;
    });

    this.mutationQueue = operation.catch(() => undefined);
    await operation;
    return { ...entry };
  }
}
