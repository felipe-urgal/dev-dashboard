import { createHash } from 'node:crypto';
import path from 'node:path';

import type { Project } from '@dev-dashboard/contracts';

import { runGit } from './shared/run-git.js';

const COMMAND_TIMEOUT_MS = 5_000;
const COMMAND_MAX_BUFFER_BYTES = 1024 * 1024;
const MAX_WORKTREES = 256;
const MAX_FIELD_LENGTH = 8 * 1024;
const SAFE_HEAD = /^[0-9a-f]{4,64}$/u;

export type GitWorktreeInspectionState =
  'ready' | 'unavailable' | 'invalid-output';

export type GitWorktreeKind = 'main' | 'linked' | 'unknown';

export interface GitWorktreeSnapshot {
  id: string;
  path: string;
  head: string;
  branch?: string;
  detached: boolean;
  bare: boolean;
  kind: GitWorktreeKind;
  locked: boolean;
  lockReason?: string;
  prunable: boolean;
  pruneReason?: string;
}

export interface GitWorktreeInspection {
  state: GitWorktreeInspectionState;
  projectId: string;
  observedAt: string;
  worktrees: GitWorktreeSnapshot[];
  diagnostic?: string;
}

export type GitWorktreeCommandRunner = (
  projectPath: string,
  args: readonly string[],
) => Promise<string>;

interface ParsedWorktree {
  path: string;
  head: string;
  branch?: string;
  detached: boolean;
  bare: boolean;
  locked: boolean;
  lockReason?: string;
  prunable: boolean;
  pruneReason?: string;
}

function defaultRunner(
  projectPath: string,
  args: readonly string[],
): Promise<string> {
  return runGit(projectPath, args, {
    timeoutMs: COMMAND_TIMEOUT_MS,
    maxBufferBytes: COMMAND_MAX_BUFFER_BYTES,
  });
}

function normalizedPath(basePath: string, value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_FIELD_LENGTH || trimmed.includes('\0')) {
    return undefined;
  }
  return path.normalize(
    path.isAbsolute(trimmed) ? trimmed : path.resolve(basePath, trimmed),
  );
}

function normalizeReason(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, 512);
}

function normalizeBranch(value: string): string | undefined {
  const normalized = value.trim();
  if (!normalized || normalized.length > 512) return undefined;
  const prefix = 'refs/heads/';
  return normalized.startsWith(prefix)
    ? normalized.slice(prefix.length)
    : normalized;
}

function splitRecords(output: string): string[][] {
  if (output.length > COMMAND_MAX_BUFFER_BYTES) return [];
  const tokens = output.split('\0');
  const records: string[][] = [];
  let current: string[] = [];

  for (const token of tokens) {
    if (token === '') {
      if (current.length > 0) {
        records.push(current);
        current = [];
      }
      continue;
    }
    if (token.length > MAX_FIELD_LENGTH) return [];
    current.push(token);
  }
  if (current.length > 0) records.push(current);
  return records;
}

export function parseGitWorktreePorcelain(
  projectPath: string,
  output: string,
): ParsedWorktree[] | null {
  const records = splitRecords(output);
  if (records.length === 0 || records.length > MAX_WORKTREES) return null;

  const parsed: ParsedWorktree[] = [];
  for (const record of records) {
    let worktreePath: string | undefined;
    let head: string | undefined;
    let branch: string | undefined;
    let detached = false;
    let bare = false;
    let locked = false;
    let lockReason: string | undefined;
    let prunable = false;
    let pruneReason: string | undefined;

    for (const field of record) {
      if (field.startsWith('worktree ')) {
        worktreePath = normalizedPath(projectPath, field.slice(9));
      } else if (field.startsWith('HEAD ')) {
        const candidate = field.slice(5).trim();
        if (SAFE_HEAD.test(candidate)) head = candidate;
      } else if (field.startsWith('branch ')) {
        branch = normalizeBranch(field.slice(7));
      } else if (field === 'detached') {
        detached = true;
      } else if (field === 'bare') {
        bare = true;
      } else if (field === 'locked' || field.startsWith('locked ')) {
        locked = true;
        lockReason = normalizeReason(field.slice(6));
      } else if (field === 'prunable' || field.startsWith('prunable ')) {
        prunable = true;
        pruneReason = normalizeReason(field.slice(8));
      }
      // Campos futuros desconhecidos são ignorados; campos essenciais não.
    }

    if (!worktreePath || !head) return null;
    if (detached) branch = undefined;
    parsed.push({
      path: worktreePath,
      head,
      ...(branch ? { branch } : {}),
      detached,
      bare,
      locked,
      ...(lockReason ? { lockReason } : {}),
      prunable,
      ...(pruneReason ? { pruneReason } : {}),
    });
  }

  return parsed;
}

function worktreeIdentity(commonDir: string, worktreePath: string): string {
  const digest = createHash('sha256')
    .update(commonDir)
    .update('\0')
    .update(worktreePath)
    .digest('hex')
    .slice(0, 20);
  return `worktree-${digest}`;
}

function mainWorktreePath(commonDir: string): string | undefined {
  if (path.basename(commonDir) !== '.git') return undefined;
  return path.dirname(commonDir);
}

export class GitWorktreeObserver {
  public constructor(
    private readonly runCommand: GitWorktreeCommandRunner = defaultRunner,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async inspect(project: Project): Promise<GitWorktreeInspection> {
    const observedAt = this.now().toISOString();
    let commonDirOutput: string;
    let listOutput: string;
    try {
      [commonDirOutput, listOutput] = await Promise.all([
        this.runCommand(project.path, [
          'rev-parse',
          '--path-format=absolute',
          '--git-common-dir',
        ]),
        this.runCommand(project.path, [
          'worktree',
          'list',
          '--porcelain',
          '-z',
        ]),
      ]);
    } catch {
      return {
        state: 'unavailable',
        projectId: project.id,
        observedAt,
        worktrees: [],
        diagnostic: 'Git worktrees não puderam ser consultados neste projeto.',
      };
    }

    const commonDir = normalizedPath(project.path, commonDirOutput);
    const parsed = parseGitWorktreePorcelain(project.path, listOutput);
    if (!commonDir || !parsed) {
      return {
        state: 'invalid-output',
        projectId: project.id,
        observedAt,
        worktrees: [],
        diagnostic: 'Git retornou dados de worktree sem estrutura confiável.',
      };
    }

    const mainPath = mainWorktreePath(commonDir);
    const worktrees = parsed
      .map<GitWorktreeSnapshot>((item) => ({
        id: worktreeIdentity(commonDir, item.path),
        path: item.path,
        head: item.head,
        ...(item.branch ? { branch: item.branch } : {}),
        detached: item.detached,
        bare: item.bare,
        kind:
          mainPath === undefined
            ? 'unknown'
            : item.path === mainPath
              ? 'main'
              : 'linked',
        locked: item.locked,
        ...(item.lockReason ? { lockReason: item.lockReason } : {}),
        prunable: item.prunable,
        ...(item.pruneReason ? { pruneReason: item.pruneReason } : {}),
      }))
      .sort((left, right) => left.path.localeCompare(right.path));

    return {
      state: 'ready',
      projectId: project.id,
      observedAt,
      worktrees,
    };
  }
}
