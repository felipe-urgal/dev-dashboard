import { createHash } from 'node:crypto';

import type { Project } from '@dev-dashboard/contracts';

import { runGit } from './shared/run-git.js';

const COMMAND_TIMEOUT_MS = 5_000;
const COMMAND_MAX_BUFFER_BYTES = 512 * 1024;
const MAX_WORKTREES = 128;
const MAX_PATH_LENGTH = 4_096;
const MAX_BRANCH_LENGTH = 512;

const WORKTREE_LIST_ARGS = ['worktree', 'list', '--porcelain', '-z'] as const;

export interface GitWorktreeEntry {
  id: string;
  path: string;
  head?: string;
  branch?: string;
  main: boolean;
  detached: boolean;
  bare: boolean;
  locked: boolean;
  lockReason?: string;
  prunable: boolean;
  pruneReason?: string;
}

export interface GitWorktreeInspection {
  status: 'ready' | 'unavailable';
  observedAt: string;
  worktrees: GitWorktreeEntry[];
  truncated: boolean;
  warning?: string;
}

export type GitWorktreeCommandRunner = (
  projectPath: string,
  args: readonly string[],
) => Promise<string>;

interface ParsedRecord {
  path?: string;
  head?: string;
  branch?: string;
  detached: boolean;
  bare: boolean;
  locked: boolean;
  lockReason?: string;
  prunable: boolean;
  pruneReason?: string;
}

function bounded(value: string, maxLength: number): string | undefined {
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : undefined;
}

function stableWorktreeId(path: string): string {
  const digest = createHash('sha256').update(path).digest('hex').slice(0, 20);
  return `worktree-${digest}`;
}

function branchName(value: string): string | undefined {
  const normalized = bounded(value, MAX_BRANCH_LENGTH);
  if (!normalized) return undefined;
  return normalized.startsWith('refs/heads/')
    ? normalized.slice('refs/heads/'.length)
    : normalized;
}

function applyToken(record: ParsedRecord, token: string): void {
  const separator = token.indexOf(' ');
  const key = separator === -1 ? token : token.slice(0, separator);
  const value = separator === -1 ? '' : token.slice(separator + 1);

  switch (key) {
    case 'worktree':
      record.path = bounded(value, MAX_PATH_LENGTH);
      break;
    case 'HEAD':
      record.head = /^[0-9a-f]{40,64}$/u.test(value) ? value : undefined;
      break;
    case 'branch':
      record.branch = branchName(value);
      break;
    case 'detached':
      record.detached = true;
      break;
    case 'bare':
      record.bare = true;
      break;
    case 'locked':
      record.locked = true;
      record.lockReason = bounded(value, 512);
      break;
    case 'prunable':
      record.prunable = true;
      record.pruneReason = bounded(value, 512);
      break;
    default:
      break;
  }
}

function emptyRecord(): ParsedRecord {
  return {
    detached: false,
    bare: false,
    locked: false,
    prunable: false,
  };
}

export function parseGitWorktreeList(payload: string): {
  worktrees: GitWorktreeEntry[];
  truncated: boolean;
} {
  const records: ParsedRecord[] = [];
  let current = emptyRecord();

  const flush = () => {
    if (current.path) records.push(current);
    current = emptyRecord();
  };

  for (const token of payload.split('\0')) {
    if (token === '') {
      flush();
      if (records.length >= MAX_WORKTREES) break;
      continue;
    }
    applyToken(current, token);
  }

  if (records.length < MAX_WORKTREES && current.path) flush();

  const truncated = records.length >= MAX_WORKTREES && payload.split('\0').length > 0;
  const worktrees = records.slice(0, MAX_WORKTREES).map((record, index) => ({
    id: stableWorktreeId(record.path as string),
    path: record.path as string,
    ...(record.head ? { head: record.head } : {}),
    ...(record.branch ? { branch: record.branch } : {}),
    main: index === 0,
    detached: record.detached,
    bare: record.bare,
    locked: record.locked,
    ...(record.lockReason ? { lockReason: record.lockReason } : {}),
    prunable: record.prunable,
    ...(record.pruneReason ? { pruneReason: record.pruneReason } : {}),
  }));

  return { worktrees, truncated };
}

async function defaultRunner(
  projectPath: string,
  args: readonly string[],
): Promise<string> {
  return runGit(projectPath, args, {
    timeoutMs: COMMAND_TIMEOUT_MS,
    maxBufferBytes: COMMAND_MAX_BUFFER_BYTES,
  });
}

export class GitWorktreeService {
  public constructor(
    private readonly runCommand: GitWorktreeCommandRunner = defaultRunner,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public async inspect(project: Project): Promise<GitWorktreeInspection> {
    const observedAt = this.now().toISOString();

    let output: string;
    try {
      output = await this.runCommand(project.path, WORKTREE_LIST_ARGS);
    } catch {
      return {
        status: 'unavailable',
        observedAt,
        worktrees: [],
        truncated: false,
        warning: 'Não foi possível consultar os worktrees deste repositório.',
      };
    }

    const parsed = parseGitWorktreeList(output);
    return {
      status: 'ready',
      observedAt,
      worktrees: parsed.worktrees,
      truncated: parsed.truncated,
      ...(parsed.truncated
        ? { warning: 'A listagem de worktrees foi limitada por segurança.' }
        : {}),
    };
  }
}
