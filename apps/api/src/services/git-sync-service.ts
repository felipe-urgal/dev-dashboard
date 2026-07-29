import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

import type {
  GitSyncConfirmation,
  GitSyncResult,
  GitSyncStrategy,
  GitTrackingComparison,
} from '@dev-dashboard/contracts';

const execFileAsync = promisify(execFile);
const CONFIRMATION_TTL_MS = 60_000;
const REMOTE_REFERENCE_PATTERN = /^[A-Za-z0-9._-]+\/(?!\/)(?!.*\/\/)(?!.*\.\.)[A-Za-z0-9._/-]+(?<!\/)(?<!\.)$/;
const CONFLICT_PATTERN = /conflict|could not apply|automatic merge failed|resolve all conflicts/i;
const FAST_FORWARD_PATTERN = /not possible to fast-forward|diverging branches|fatal: not possible/i;

export type GitSyncErrorCode =
  | 'GIT_NOT_REPOSITORY'
  | 'GIT_REFERENCE_INVALID'
  | 'GIT_REFERENCE_NOT_FOUND'
  | 'GIT_WORKING_TREE_DIRTY'
  | 'GIT_SYNC_CONFIRMATION_REQUIRED'
  | 'GIT_DETACHED_HEAD'
  | 'GIT_SYNC_CONFLICT'
  | 'GIT_SYNC_DIVERGED'
  | 'GIT_SYNC_FAILED';

export class GitSyncError extends Error {
  public constructor(
    public readonly code: GitSyncErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GitSyncError';
  }
}

interface StoredConfirmation {
  token: string;
  projectId: string;
  reference: string;
  strategy: GitSyncStrategy;
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

function failureText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const withOutput = error as Error & { stdout?: string; stderr?: string };
  return [withOutput.message, withOutput.stdout, withOutput.stderr]
    .filter(Boolean)
    .join('\n');
}

function validateReference(reference: string): void {
  if (
    !reference
    || reference.length > 300
    || !REMOTE_REFERENCE_PATTERN.test(reference)
  ) {
    throw new GitSyncError(
      'GIT_REFERENCE_INVALID',
      'Referência remota inválida.',
    );
  }
}

function validateStrategy(strategy: GitSyncStrategy): void {
  if (!['ff-only', 'rebase', 'merge'].includes(strategy)) {
    throw new GitSyncError(
      'GIT_REFERENCE_INVALID',
      'Estratégia de sincronização inválida.',
    );
  }
}

async function requireRepository(projectPath: string): Promise<void> {
  try {
    await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new GitSyncError(
      'GIT_NOT_REPOSITORY',
      'O projeto não é um repositório Git.',
    );
  }
}

async function requireRemoteReference(
  projectPath: string,
  reference: string,
): Promise<void> {
  try {
    await runGit(projectPath, [
      'show-ref',
      '--verify',
      '--quiet',
      `refs/remotes/${reference}`,
    ]);
  } catch {
    throw new GitSyncError(
      'GIT_REFERENCE_NOT_FOUND',
      `A referência remota "${reference}" não foi encontrada. Execute fetch antes de continuar.`,
    );
  }
}

async function requireCleanWorkingTree(projectPath: string): Promise<void> {
  const output = await runGit(projectPath, [
    'status',
    '--porcelain=v2',
    '-z',
    '--untracked-files=all',
  ]);
  const dirty = output.split('\0').some((record) =>
    record.startsWith('1 ')
    || record.startsWith('2 ')
    || record.startsWith('u ')
    || record.startsWith('? '),
  );
  if (dirty) {
    throw new GitSyncError(
      'GIT_WORKING_TREE_DIRTY',
      'A árvore de trabalho precisa estar limpa para integrar uma referência remota.',
    );
  }
}

async function currentBranch(projectPath: string): Promise<string> {
  const branch = await runGit(projectPath, ['branch', '--show-current']);
  if (!branch) {
    throw new GitSyncError(
      'GIT_DETACHED_HEAD',
      'Não é possível sincronizar um HEAD destacado.',
    );
  }
  return branch;
}

async function abortOperation(
  projectPath: string,
  strategy: GitSyncStrategy,
): Promise<void> {
  try {
    if (strategy === 'rebase') {
      await runGit(projectPath, ['rebase', '--abort']);
    } else if (strategy === 'merge') {
      await runGit(projectPath, ['merge', '--abort']);
    }
  } catch {
    // A operação pode falhar antes de criar estado abortável.
  }
}

export class GitSyncService {
  private readonly confirmations = new Map<string, StoredConfirmation>();

  public prepareConfirmation(
    projectId: string,
    reference: string,
    strategy: GitSyncStrategy,
  ): GitSyncConfirmation {
    validateReference(reference);
    validateStrategy(strategy);
    this.pruneExpiredConfirmations();

    const token = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + CONFIRMATION_TTL_MS;
    this.confirmations.set(token, {
      token,
      projectId,
      reference,
      strategy,
      expiresAt,
    });

    return {
      token,
      reference,
      strategy,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public async compare(
    projectPath: string,
    reference: string,
  ): Promise<GitTrackingComparison> {
    validateReference(reference);
    await requireRepository(projectPath);
    await requireRemoteReference(projectPath, reference);

    const output = await runGit(projectPath, [
      'rev-list',
      '--left-right',
      '--count',
      `HEAD...${reference}`,
    ]);
    const [aheadRaw = '0', behindRaw = '0'] = output.split(/\s+/);

    return {
      reference,
      ahead: Number.parseInt(aheadRaw, 10) || 0,
      behind: Number.parseInt(behindRaw, 10) || 0,
    };
  }

  public async integrate(
    projectPath: string,
    projectId: string,
    reference: string,
    strategy: GitSyncStrategy,
    confirmationToken?: string,
  ): Promise<GitSyncResult> {
    validateReference(reference);
    validateStrategy(strategy);
    await requireRepository(projectPath);
    this.consumeConfirmation(
      projectId,
      reference,
      strategy,
      confirmationToken,
    );
    await requireRemoteReference(projectPath, reference);
    await requireCleanWorkingTree(projectPath);

    const branch = await currentBranch(projectPath);
    const previousHead = await runGit(projectPath, ['rev-parse', 'HEAD']);

    try {
      if (strategy === 'ff-only') {
        await runGit(projectPath, ['merge', '--ff-only', reference]);
      } else if (strategy === 'rebase') {
        await runGit(projectPath, ['rebase', reference]);
      } else {
        await runGit(projectPath, ['merge', '--no-edit', reference]);
      }
    } catch (error) {
      const details = failureText(error);
      await abortOperation(projectPath, strategy);

      if (strategy === 'ff-only' && FAST_FORWARD_PATTERN.test(details)) {
        throw new GitSyncError(
          'GIT_SYNC_DIVERGED',
          'A branch divergiu da referência selecionada. Use rebase ou merge.',
        );
      }
      if (CONFLICT_PATTERN.test(details)) {
        throw new GitSyncError(
          'GIT_SYNC_CONFLICT',
          'A integração encontrou conflitos e foi abortada automaticamente. O repositório voltou ao estado anterior.',
        );
      }
      throw new GitSyncError(
        'GIT_SYNC_FAILED',
        details || 'Não foi possível integrar a referência remota.',
      );
    }

    const currentHead = await runGit(projectPath, ['rev-parse', 'HEAD']);
    return {
      branch,
      reference,
      strategy,
      changed: currentHead !== previousHead,
      previousHead,
      currentHead,
    };
  }

  private consumeConfirmation(
    projectId: string,
    reference: string,
    strategy: GitSyncStrategy,
    token: string | undefined,
  ): void {
    this.pruneExpiredConfirmations();
    const confirmation = token
      ? this.confirmations.get(token)
      : undefined;

    if (
      !confirmation
      || confirmation.projectId !== projectId
      || confirmation.reference !== reference
      || confirmation.strategy !== strategy
    ) {
      throw new GitSyncError(
        'GIT_SYNC_CONFIRMATION_REQUIRED',
        'Confirmação obrigatória para sincronizar a branch.',
      );
    }
    this.confirmations.delete(token!);
  }

  private pruneExpiredConfirmations(): void {
    const now = Date.now();
    for (const [token, confirmation] of this.confirmations) {
      if (confirmation.expiresAt <= now) {
        this.confirmations.delete(token);
      }
    }
  }
}
