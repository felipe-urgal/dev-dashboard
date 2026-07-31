import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

import type {
  GitMutationConfirmation,
  GitMutationOperation,
} from '@dev-dashboard/contracts';

const execFileAsync = promisify(execFile);
const CONFIRMATION_TTL_MS = 60_000;
const REMOTE_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const BRANCH_NAME_PATTERN = /^(?!\/)(?!.*\/\/)(?!.*\.\.)[A-Za-z0-9._/-]+(?<!\/)(?<!\.)$/;

export type GitBranchServiceErrorCode =
  | 'GIT_BRANCH_INVALID'
  | 'GIT_BRANCH_EXISTS'
  | 'GIT_BRANCH_NOT_FOUND'
  | 'GIT_WORKING_TREE_DIRTY'
  | 'GIT_MUTATION_CONFIRMATION_REQUIRED'
  | 'GIT_REMOTE_NOT_CONFIGURED'
  | 'GIT_COMMAND_FAILED';

export class GitBranchServiceError extends Error {
  public constructor(
    public readonly code: GitBranchServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GitBranchServiceError';
  }
}

interface StoredConfirmation {
  token: string;
  projectId: string;
  operation: Extract<GitMutationOperation, 'track-branch' | 'delete-remote-branch'>;
  target: string;
  expiresAt: number;
}

async function runGit(projectPath: string, args: readonly string[]): Promise<string> {
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
  return result.stdout.trim();
}

function splitRemoteBranch(remoteBranch: string): { remote: string; localBranch: string } {
  const separator = remoteBranch.indexOf('/');
  const remote = separator > 0 ? remoteBranch.slice(0, separator) : '';
  const localBranch = separator > 0 ? remoteBranch.slice(separator + 1) : '';

  if (
    !REMOTE_NAME_PATTERN.test(remote)
    || !localBranch
    || localBranch.length > 200
    || !BRANCH_NAME_PATTERN.test(localBranch)
  ) {
    throw new GitBranchServiceError(
      'GIT_BRANCH_INVALID',
      'A referência remota informada não representa uma branch válida.',
    );
  }

  return { remote, localBranch };
}

function assertOriginRemoteBranch(remoteBranch: string): {
  remote: string;
  localBranch: string;
} {
  const parsed = splitRemoteBranch(remoteBranch);
  if (parsed.remote !== 'origin') {
    throw new GitBranchServiceError(
      'GIT_BRANCH_INVALID',
      'Somente branches do remote "origin" podem ser removidas pelo painel.',
    );
  }
  if (parsed.localBranch === 'main' || parsed.localBranch === 'master') {
    throw new GitBranchServiceError(
      'GIT_BRANCH_INVALID',
      `A branch protegida "${parsed.localBranch}" não pode ser removida do origin.`,
    );
  }
  return parsed;
}

async function assertClean(projectPath: string): Promise<void> {
  const status = await runGit(projectPath, [
    'status',
    '--porcelain=v2',
    '-z',
    '--untracked-files=all',
  ]);
  if (status) {
    throw new GitBranchServiceError(
      'GIT_WORKING_TREE_DIRTY',
      'A árvore de trabalho tem alterações não commitadas ou arquivos não rastreados.',
    );
  }
}

async function assertRepository(projectPath: string): Promise<void> {
  try {
    await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new GitBranchServiceError(
      'GIT_COMMAND_FAILED',
      'O projeto não é um repositório Git.',
    );
  }
}

async function assertRemote(projectPath: string, remote: string): Promise<void> {
  try {
    await runGit(projectPath, ['remote', 'get-url', remote]);
  } catch {
    throw new GitBranchServiceError(
      'GIT_REMOTE_NOT_CONFIGURED',
      `O remote "${remote}" não está configurado neste projeto.`,
    );
  }
}

export class GitBranchService {
  private readonly confirmations = new Map<string, StoredConfirmation>();

  public prepareTrackingConfirmation(
    projectId: string,
    remoteBranch: string,
  ): GitMutationConfirmation {
    splitRemoteBranch(remoteBranch);
    return this.prepareConfirmation(projectId, 'track-branch', remoteBranch);
  }

  public prepareRemoteDeleteConfirmation(
    projectId: string,
    remoteBranch: string,
  ): GitMutationConfirmation {
    assertOriginRemoteBranch(remoteBranch);
    return this.prepareConfirmation(
      projectId,
      'delete-remote-branch',
      remoteBranch,
    );
  }

  public async trackRemoteBranch(
    projectPath: string,
    projectId: string,
    remoteBranch: string,
    confirmationToken?: string,
  ): Promise<{ branch: string }> {
    const { remote, localBranch } = splitRemoteBranch(remoteBranch);
    this.consumeConfirmation(
      projectId,
      'track-branch',
      remoteBranch,
      confirmationToken,
    );

    await assertRepository(projectPath);
    await assertClean(projectPath);
    await assertRemote(projectPath, remote);

    try {
      await runGit(projectPath, [
        'show-ref',
        '--verify',
        '--quiet',
        `refs/remotes/${remoteBranch}`,
      ]);
    } catch {
      throw new GitBranchServiceError(
        'GIT_BRANCH_NOT_FOUND',
        `A branch remota "${remoteBranch}" não foi encontrada. Execute fetch e tente novamente.`,
      );
    }

    try {
      await runGit(projectPath, [
        'show-ref',
        '--verify',
        '--quiet',
        `refs/heads/${localBranch}`,
      ]);
      throw new GitBranchServiceError(
        'GIT_BRANCH_EXISTS',
        `Já existe uma branch local chamada "${localBranch}".`,
      );
    } catch (error) {
      if (error instanceof GitBranchServiceError) throw error;
      // show-ref falha quando a branch local ainda não existe.
    }

    try {
      await runGit(projectPath, [
        'switch',
        '--create',
        localBranch,
        '--track',
        remoteBranch,
      ]);
    } catch (error) {
      throw new GitBranchServiceError(
        'GIT_COMMAND_FAILED',
        error instanceof Error ? error.message : 'Não foi possível criar a branch local.',
      );
    }

    return { branch: localBranch };
  }

  public async deleteRemoteBranch(
    projectPath: string,
    projectId: string,
    remoteBranch: string,
    confirmationToken?: string,
  ): Promise<{ branch: string }> {
    const { remote, localBranch } = assertOriginRemoteBranch(remoteBranch);
    this.consumeConfirmation(
      projectId,
      'delete-remote-branch',
      remoteBranch,
      confirmationToken,
    );

    await assertRepository(projectPath);
    await assertRemote(projectPath, remote);

    try {
      await runGit(projectPath, ['push', remote, '--delete', localBranch]);
    } catch (error) {
      throw new GitBranchServiceError(
        'GIT_COMMAND_FAILED',
        error instanceof Error
          ? error.message
          : `Não foi possível remover "${remoteBranch}".`,
      );
    }

    try {
      await runGit(projectPath, ['fetch', '--prune', remote]);
    } catch {
      // A remoção remota já foi concluída; o próximo fetch limpa a referência local.
    }

    return { branch: localBranch };
  }

  private prepareConfirmation(
    projectId: string,
    operation: StoredConfirmation['operation'],
    target: string,
  ): GitMutationConfirmation {
    this.pruneExpired();

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

  private consumeConfirmation(
    projectId: string,
    operation: StoredConfirmation['operation'],
    target: string,
    token: string | undefined,
  ): void {
    this.pruneExpired();
    const confirmation = token ? this.confirmations.get(token) : undefined;
    if (
      !confirmation
      || confirmation.projectId !== projectId
      || confirmation.operation !== operation
      || confirmation.target !== target
    ) {
      throw new GitBranchServiceError(
        'GIT_MUTATION_CONFIRMATION_REQUIRED',
        'Confirmação obrigatória para alterar a branch remota.',
      );
    }
    this.confirmations.delete(token!);
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [token, confirmation] of this.confirmations) {
      if (confirmation.expiresAt <= now) this.confirmations.delete(token);
    }
  }
}
