import path from 'node:path';

import type { Project } from '@dev-dashboard/contracts';

import {
  GitWorktreeObserver,
  type GitWorktreeCommandRunner,
  type GitWorktreeSnapshot,
} from './git-worktree-observer.js';
import { runGit } from './shared/run-git.js';

const COMMAND_TIMEOUT_MS = 10_000;
const COMMAND_MAX_BUFFER_BYTES = 1024 * 1024;
const MAX_BRANCH_LENGTH = 256;
const MAX_DIRECTORY_NAME_LENGTH = 160;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

export interface CreateGitWorktreeInput {
  branch: string;
  directoryName: string;
  createBranch?: boolean;
}

export type CreateGitWorktreeState =
  'created' | 'already-present' | 'blocked' | 'failed' | 'unverified';

export interface CreateGitWorktreeResult {
  state: CreateGitWorktreeState;
  path: string;
  branch: string;
  worktree?: GitWorktreeSnapshot;
  diagnostic?: string;
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

function normalizeBranch(value: string): string | undefined {
  const branch = value.trim();
  if (
    !branch ||
    branch.length > MAX_BRANCH_LENGTH ||
    branch.startsWith('-') ||
    CONTROL_CHARACTERS.test(branch)
  ) {
    return undefined;
  }
  return branch;
}

function normalizeDirectoryName(value: string): string | undefined {
  const directoryName = value.trim();
  if (
    !directoryName ||
    directoryName === '.' ||
    directoryName === '..' ||
    directoryName.length > MAX_DIRECTORY_NAME_LENGTH ||
    CONTROL_CHARACTERS.test(directoryName) ||
    path.isAbsolute(directoryName) ||
    directoryName.includes('/') ||
    directoryName.includes('\\')
  ) {
    return undefined;
  }
  return directoryName;
}

function targetPathFor(project: Project, directoryName: string): string {
  return path.join(path.dirname(path.resolve(project.path)), directoryName);
}

function blocked(
  targetPath: string,
  branch: string,
  diagnostic: string,
): CreateGitWorktreeResult {
  return { state: 'blocked', path: targetPath, branch, diagnostic };
}

export class GitWorktreeLifecycleService {
  private readonly observer: GitWorktreeObserver;

  public constructor(
    private readonly runCommand: GitWorktreeCommandRunner = defaultRunner,
    observer?: GitWorktreeObserver,
  ) {
    this.observer = observer ?? new GitWorktreeObserver(runCommand);
  }

  public async create(
    project: Project,
    input: CreateGitWorktreeInput,
  ): Promise<CreateGitWorktreeResult> {
    const branch = normalizeBranch(input.branch);
    const directoryName = normalizeDirectoryName(input.directoryName);
    const fallbackPath = path.dirname(path.resolve(project.path));

    if (!branch) {
      return blocked(
        fallbackPath,
        input.branch.trim(),
        'A branch informada não pode ser usada para criar um worktree.',
      );
    }
    if (!directoryName) {
      return blocked(
        fallbackPath,
        branch,
        'O diretório do worktree precisa ser um nome simples ao lado do projeto.',
      );
    }

    const targetPath = targetPathFor(project, directoryName);
    const before = await this.observer.inspect(project);
    if (before.state !== 'ready') {
      return blocked(
        targetPath,
        branch,
        'O estado atual dos worktrees não pôde ser confirmado com segurança.',
      );
    }

    const atTarget = before.worktrees.find(
      (worktree) =>
        path.normalize(worktree.path) === path.normalize(targetPath),
    );
    if (atTarget) {
      if (atTarget.branch === branch) {
        return {
          state: 'already-present',
          path: targetPath,
          branch,
          worktree: atTarget,
        };
      }
      return blocked(
        targetPath,
        branch,
        'Já existe outro worktree usando o diretório escolhido.',
      );
    }

    const branchInUse = before.worktrees.find(
      (worktree) => worktree.branch === branch,
    );
    if (branchInUse) {
      return blocked(
        targetPath,
        branch,
        'A branch já está vinculada a outro worktree.',
      );
    }

    try {
      await this.runCommand(project.path, [
        'check-ref-format',
        '--branch',
        branch,
      ]);
    } catch {
      return blocked(
        targetPath,
        branch,
        'A branch informada não possui um nome aceito pelo Git.',
      );
    }

    const args = input.createBranch
      ? ['worktree', 'add', '-b', branch, '--', targetPath]
      : ['worktree', 'add', '--', targetPath, branch];

    try {
      await this.runCommand(project.path, args);
    } catch {
      return {
        state: 'failed',
        path: targetPath,
        branch,
        diagnostic:
          'Git não conseguiu criar o worktree. Verifique se a branch e o diretório ainda estão disponíveis.',
      };
    }

    const after = await this.observer.inspect(project);
    if (after.state !== 'ready') {
      return {
        state: 'unverified',
        path: targetPath,
        branch,
        diagnostic:
          'O comando foi executado, mas o novo worktree não pôde ser confirmado com segurança.',
      };
    }

    const created = after.worktrees.find(
      (worktree) =>
        path.normalize(worktree.path) === path.normalize(targetPath),
    );
    if (!created || created.branch !== branch) {
      return {
        state: 'unverified',
        path: targetPath,
        branch,
        diagnostic:
          'O Git respondeu ao comando, mas o worktree esperado não apareceu no snapshot confirmado.',
      };
    }

    return {
      state: 'created',
      path: targetPath,
      branch,
      worktree: created,
    };
  }
}
