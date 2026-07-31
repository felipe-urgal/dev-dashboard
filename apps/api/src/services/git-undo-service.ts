import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CONFIRMATION_TTL_MS = 60_000;
const FIELD_SEPARATOR = '\u001f';

export type GitUndoOperation = 'commit' | 'file';
export type GitUndoStrategy = 'reset' | 'revert';

export type GitUndoErrorCode =
  | 'GIT_NOT_REPOSITORY'
  | 'GIT_DETACHED_HEAD'
  | 'GIT_WORKING_TREE_DIRTY'
  | 'GIT_MUTATION_CONFIRMATION_REQUIRED'
  | 'GIT_FILE_PATH_INVALID'
  | 'GIT_FILE_NOT_FOUND'
  | 'GIT_COMMIT_FAILED'
  | 'GIT_COMMAND_FAILED';

export class GitUndoError extends Error {
  public constructor(
    public readonly code: GitUndoErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GitUndoError';
  }
}

interface StoredConfirmation {
  token: string;
  projectId: string;
  operation: GitUndoOperation;
  target: string;
  expiresAt: number;
}

interface CommitSummary {
  hash: string;
  shortHash: string;
  subject: string;
}

export interface GitUndoConfirmation {
  token: string;
  operation: GitUndoOperation;
  target: string;
  expiresAt: string;
}

export interface GitUndoCommitResult {
  strategy: GitUndoStrategy;
  undone: CommitSummary;
  result?: CommitSummary;
}

async function runGit(
  projectPath: string,
  args: readonly string[],
): Promise<string> {
  const result = await execFileAsync('git', [...args], {
    cwd: projectPath,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_OPTIONAL_LOCKS: '0',
      LC_ALL: 'C',
    },
  });
  return result.stdout;
}

async function optionalGit(
  projectPath: string,
  args: readonly string[],
): Promise<string | null> {
  try {
    return await runGit(projectPath, args);
  } catch {
    return null;
  }
}

async function requireRepository(projectPath: string): Promise<void> {
  try {
    await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new GitUndoError(
      'GIT_NOT_REPOSITORY',
      'O projeto não é um repositório Git.',
    );
  }
}

async function currentBranch(projectPath: string): Promise<string> {
  const branch = (await runGit(projectPath, ['branch', '--show-current'])).trim();
  if (!branch) {
    throw new GitUndoError(
      'GIT_DETACHED_HEAD',
      'Não é possível desfazer um commit em HEAD destacado.',
    );
  }
  return branch;
}

function ensurePathInsideProject(projectPath: string, requestedPath: string): string {
  if (
    !requestedPath
    || requestedPath.length > 4096
    || requestedPath.includes('\0')
    || requestedPath.includes('\n')
    || requestedPath.includes('\r')
    || requestedPath.includes('\t')
    || path.isAbsolute(requestedPath)
    || requestedPath.split(/[\\/]/).includes('..')
  ) {
    throw new GitUndoError('GIT_FILE_PATH_INVALID', 'Caminho de arquivo inválido.');
  }

  const root = path.resolve(projectPath);
  const resolved = path.resolve(root, requestedPath);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new GitUndoError(
      'GIT_FILE_PATH_INVALID',
      'O arquivo precisa estar dentro do projeto.',
    );
  }
  return relative.replaceAll('\\', '/');
}

function parseCommit(value: string): CommitSummary {
  const [hash = '', shortHash = '', subject = ''] = value.trim().split(FIELD_SEPARATOR);
  return { hash, shortHash, subject };
}

async function headCommit(projectPath: string): Promise<CommitSummary> {
  try {
    return parseCommit(await runGit(
      projectPath,
      ['log', '-1', `--format=%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%s`],
    ));
  } catch {
    throw new GitUndoError('GIT_COMMIT_FAILED', 'O repositório ainda não possui commit para desfazer.');
  }
}

async function assertWorkingTreeClean(projectPath: string): Promise<void> {
  const status = await runGit(projectPath, [
    'status', '--porcelain=v2', '-z', '--untracked-files=all',
  ]);
  if (status.length > 0) {
    throw new GitUndoError(
      'GIT_WORKING_TREE_DIRTY',
      'Desfaça ou registre as alterações atuais antes de desfazer um commit.',
    );
  }
}

async function localAheadOfUpstream(projectPath: string): Promise<number | null> {
  const upstream = await optionalGit(projectPath, [
    'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}',
  ]);
  if (!upstream?.trim()) return null;

  const counts = await optionalGit(projectPath, [
    'rev-list', '--left-right', '--count', 'HEAD...@{upstream}',
  ]);
  if (!counts) return null;
  const [aheadRaw = '0'] = counts.trim().split(/\s+/);
  return Number.parseInt(aheadRaw, 10) || 0;
}

interface RenameInfo {
  kind: 'rename' | 'copy';
  previousPath: string;
}

async function renameInfo(
  projectPath: string,
  safePath: string,
): Promise<RenameInfo | null> {
  const output = await optionalGit(projectPath, [
    'diff', '--name-status', '-M', '-C', 'HEAD', '--', safePath,
  ]);
  if (!output?.trim()) return null;

  for (const line of output.trim().split('\n')) {
    const [status = '', previousPath = '', currentPath = ''] = line.split('\t');
    if (currentPath !== safePath || !previousPath) continue;
    if (status.startsWith('R')) return { kind: 'rename', previousPath };
    if (status.startsWith('C')) return { kind: 'copy', previousPath };
  }
  return null;
}

async function pathExistsInHead(
  projectPath: string,
  safePath: string,
): Promise<boolean> {
  const output = await optionalGit(projectPath, [
    'ls-tree', '--name-only', 'HEAD', '--', safePath,
  ]);
  return output?.trim() === safePath;
}

async function unlinkIfPresent(projectPath: string, safePath: string): Promise<void> {
  try {
    await unlink(path.join(projectPath, safePath));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw error;
  }
}

export class GitUndoService {
  private readonly confirmations = new Map<string, StoredConfirmation>();

  public async prepareConfirmation(
    projectPath: string,
    projectId: string,
    operation: GitUndoOperation,
    requestedTarget: string,
  ): Promise<GitUndoConfirmation> {
    await requireRepository(projectPath);
    const target = operation === 'file'
      ? ensurePathInsideProject(projectPath, requestedTarget)
      : await currentBranch(projectPath);

    if (operation === 'commit' && requestedTarget !== target) {
      throw new GitUndoError(
        'GIT_MUTATION_CONFIRMATION_REQUIRED',
        'A branch mudou antes da confirmação. Atualize a tela e tente novamente.',
      );
    }

    this.pruneExpiredConfirmations();
    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + CONFIRMATION_TTL_MS;
    this.confirmations.set(token, {
      token,
      projectId,
      operation,
      target,
      expiresAt,
    });
    return {
      token,
      operation,
      target,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public async undoLastCommit(
    projectPath: string,
    projectId: string,
    confirmationToken?: string,
  ): Promise<GitUndoCommitResult> {
    await requireRepository(projectPath);
    const branch = await currentBranch(projectPath);
    this.consumeConfirmation(projectId, 'commit', branch, confirmationToken);
    await assertWorkingTreeClean(projectPath);

    const undone = await headCommit(projectPath);
    const parent = await optionalGit(projectPath, ['rev-parse', '--verify', 'HEAD^']);
    if (!parent?.trim()) {
      throw new GitUndoError(
        'GIT_COMMIT_FAILED',
        'O primeiro commit do repositório não pode ser desfeito por esta ação.',
      );
    }

    const ahead = await localAheadOfUpstream(projectPath);
    if (ahead === 0) {
      try {
        await runGit(projectPath, ['revert', '--no-edit', 'HEAD']);
      } catch (error) {
        await optionalGit(projectPath, ['revert', '--abort']);
        throw new GitUndoError(
          'GIT_COMMAND_FAILED',
          error instanceof Error
            ? error.message
            : 'Não foi possível reverter o commit publicado.',
        );
      }
      return {
        strategy: 'revert',
        undone,
        result: await headCommit(projectPath),
      };
    }

    try {
      await runGit(projectPath, ['reset', '--soft', 'HEAD^']);
    } catch (error) {
      throw new GitUndoError(
        'GIT_COMMAND_FAILED',
        error instanceof Error
          ? error.message
          : 'Não foi possível desfazer o último commit.',
      );
    }
    return { strategy: 'reset', undone };
  }

  public async undoFile(
    projectPath: string,
    projectId: string,
    requestedPath: string,
    confirmationToken?: string,
  ): Promise<{ path: string }> {
    await requireRepository(projectPath);
    const safePath = ensurePathInsideProject(projectPath, requestedPath);
    this.consumeConfirmation(projectId, 'file', safePath, confirmationToken);

    const status = await runGit(projectPath, [
      'status', '--porcelain', '-z', '--untracked-files=all', '--', safePath,
    ]);
    if (!status) {
      throw new GitUndoError(
        'GIT_FILE_NOT_FOUND',
        'O arquivo não possui alterações para desfazer.',
      );
    }

    try {
      if (status.startsWith('?? ')) {
        await unlinkIfPresent(projectPath, safePath);
        return { path: safePath };
      }

      const moved = await renameInfo(projectPath, safePath);
      if (moved?.kind === 'rename') {
        const previousPath = ensurePathInsideProject(projectPath, moved.previousPath);
        await runGit(projectPath, ['reset', 'HEAD', '--', safePath, previousPath]);
        await unlinkIfPresent(projectPath, safePath);
        await runGit(projectPath, [
          'restore', '--source=HEAD', '--staged', '--worktree', '--', previousPath,
        ]);
        return { path: safePath };
      }

      if (moved?.kind === 'copy') {
        await runGit(projectPath, ['reset', 'HEAD', '--', safePath]);
        await unlinkIfPresent(projectPath, safePath);
        return { path: safePath };
      }

      if (await pathExistsInHead(projectPath, safePath)) {
        await runGit(projectPath, [
          'restore', '--source=HEAD', '--staged', '--worktree', '--', safePath,
        ]);
      } else {
        await runGit(projectPath, ['reset', 'HEAD', '--', safePath]);
        await unlinkIfPresent(projectPath, safePath);
      }
      return { path: safePath };
    } catch (error) {
      if (error instanceof GitUndoError) throw error;
      throw new GitUndoError(
        'GIT_COMMAND_FAILED',
        error instanceof Error
          ? error.message
          : 'Não foi possível desfazer as alterações do arquivo.',
      );
    }
  }

  private consumeConfirmation(
    projectId: string,
    operation: GitUndoOperation,
    target: string,
    token: string | undefined,
  ): void {
    this.pruneExpiredConfirmations();
    const confirmation = token ? this.confirmations.get(token) : undefined;
    if (
      !confirmation
      || confirmation.projectId !== projectId
      || confirmation.operation !== operation
      || confirmation.target !== target
    ) {
      throw new GitUndoError(
        'GIT_MUTATION_CONFIRMATION_REQUIRED',
        'Confirmação obrigatória para esta operação.',
      );
    }
    this.confirmations.delete(token!);
  }

  private pruneExpiredConfirmations(): void {
    const now = Date.now();
    for (const [token, confirmation] of this.confirmations) {
      if (confirmation.expiresAt <= now) this.confirmations.delete(token);
    }
  }
}
