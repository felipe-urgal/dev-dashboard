import type { GitMutationConfirmation } from '@dev-dashboard/contracts';

import { GIT_MUTATION_CONFIRMATION_TTL_MS } from './git-service/constants.js';
import { GitMutationError } from './git-service/errors.js';
import {
  assertWorkingTreeClean,
  requireRepository,
  validateBranchName,
  validateCommitMessage,
} from './git-service/mutation-guards.js';
import { commandFailureText, runGit } from './git-service/run.js';
import {
  GitMutationConfirmationError,
  GitMutationConfirmationService,
} from './git-mutation-confirmation-service.js';

const SQUASH_OPERATION_ID = 'branch-squash';

interface BranchSquashState {
  branch: string;
  head: string;
  base: string;
  commitCount: number;
}

async function referenceExists(
  projectPath: string,
  reference: string,
): Promise<boolean> {
  try {
    await runGit(projectPath, [
      'rev-parse',
      '--verify',
      '--quiet',
      '--end-of-options',
      `${reference}^{commit}`,
    ]);
    return true;
  } catch {
    return false;
  }
}

async function remoteDefaultReference(
  projectPath: string,
  remote: string,
): Promise<string | undefined> {
  try {
    const value = (
      await runGit(projectPath, [
        'symbolic-ref',
        '--quiet',
        '--short',
        `refs/remotes/${remote}/HEAD`,
      ])
    ).trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

async function resolveSquashBase(
  projectPath: string,
  branch: string,
): Promise<string | undefined> {
  const [upstreamDefault, originDefault] = await Promise.all([
    remoteDefaultReference(projectPath, 'upstream'),
    remoteDefaultReference(projectPath, 'origin'),
  ]);
  const candidates = [
    upstreamDefault,
    originDefault,
    'upstream/main',
    'origin/main',
    'main',
    'upstream/master',
    'origin/master',
    'master',
  ].filter((value): value is string => Boolean(value));

  const visited = new Set<string>();
  for (const candidate of candidates) {
    if (visited.has(candidate)) continue;
    visited.add(candidate);
    if (candidate === branch || candidate.endsWith(`/${branch}`)) continue;
    if (!(await referenceExists(projectPath, candidate))) continue;

    try {
      const mergeBase = (
        await runGit(projectPath, ['merge-base', '--', branch, candidate])
      ).trim();
      if (mergeBase) return mergeBase;
    } catch {
      // Tenta a próxima referência principal disponível.
    }
  }

  return undefined;
}

async function requireLocalBranch(
  projectPath: string,
  branch: string,
): Promise<void> {
  if (!(await referenceExists(projectPath, `refs/heads/${branch}`))) {
    throw new GitMutationError(
      'GIT_BRANCH_NOT_FOUND',
      `A branch local "${branch}" não foi encontrada.`,
    );
  }
}

async function requireCurrentBranch(
  projectPath: string,
  branch: string,
): Promise<void> {
  const current = (
    await runGit(projectPath, ['branch', '--show-current'])
  ).trim();
  if (current !== branch) {
    throw new GitMutationError(
      'GIT_FORCE_PUSH_CURRENT_BRANCH_REQUIRED',
      `Selecione a branch "${branch}" antes de fazer squash.`,
    );
  }
}

async function requireRewriteAllowed(
  projectPath: string,
  branch: string,
): Promise<void> {
  let protectedBranch = branch === 'main' || branch === 'master';

  for (const remote of ['origin', 'upstream']) {
    try {
      const defaultRemote = (
        await runGit(projectPath, [
          'symbolic-ref',
          '--quiet',
          '--short',
          `refs/remotes/${remote}/HEAD`,
        ])
      ).trim();
      protectedBranch ||= defaultRemote === `${remote}/${branch}`;
    } catch {
      // HEAD remoto é opcional; main/master continuam protegidas.
    }
  }

  if (protectedBranch) {
    throw new GitMutationError(
      'GIT_PROTECTED_BRANCH',
      `A branch protegida "${branch}" não pode ter o histórico reescrito pelo dashboard.`,
    );
  }
}

async function inspectSquashState(
  projectPath: string,
  branch: string,
): Promise<BranchSquashState> {
  validateBranchName(branch);
  await requireRepository(projectPath);
  await requireLocalBranch(projectPath, branch);
  await requireRewriteAllowed(projectPath, branch);

  const base = await resolveSquashBase(projectPath, branch);
  if (!base) {
    throw new GitMutationError(
      'GIT_NOTHING_TO_COMMIT',
      'Não foi possível identificar a branch principal usada como base para o squash.',
    );
  }

  const head = (
    await runGit(projectPath, ['rev-parse', '--verify', `refs/heads/${branch}`])
  ).trim();
  const commitCount =
    Number.parseInt(
      (
        await runGit(projectPath, [
          'rev-list',
          '--count',
          `${base}..refs/heads/${branch}`,
        ])
      ).trim(),
      10,
    ) || 0;

  return { branch, head, base, commitCount };
}

function confirmationTarget(state: BranchSquashState): string {
  return `${state.branch}::${state.head}::${state.base}`;
}

/**
 * Retorna quantos commits exclusivos da branch poderiam ser condensados.
 * Falhas de inspeção viram zero para não impedir a tela de branches de abrir.
 */
export async function countSquashableBranchCommits(
  projectPath: string,
  branch: string,
): Promise<number> {
  try {
    return (await inspectSquashState(projectPath, branch)).commitCount;
  } catch {
    return 0;
  }
}

export class GitBranchSquashService {
  private readonly confirmations = new GitMutationConfirmationService(
    GIT_MUTATION_CONFIRMATION_TTL_MS,
  );

  public async prepareConfirmation(
    projectPath: string,
    projectId: string,
    branch: string,
  ): Promise<GitMutationConfirmation> {
    const state = await inspectSquashState(projectPath, branch);
    await requireCurrentBranch(projectPath, branch);
    await assertWorkingTreeClean(projectPath);
    if (state.commitCount < 2) {
      throw new GitMutationError(
        'GIT_NOTHING_TO_COMMIT',
        `A branch "${branch}" precisa ter pelo menos dois commits exclusivos para fazer squash.`,
      );
    }

    const target = confirmationTarget(state);
    const { token, expiresAt } = this.confirmations.prepare(
      projectId,
      SQUASH_OPERATION_ID,
      target,
    );
    return { token, operation: 'squash', target, expiresAt };
  }

  public async squash(
    projectPath: string,
    projectId: string,
    branch: string,
    message: string,
    confirmationToken?: string,
  ): Promise<{ branch: string }> {
    validateCommitMessage(message);
    const state = await inspectSquashState(projectPath, branch);
    await requireCurrentBranch(projectPath, branch);
    await assertWorkingTreeClean(projectPath);
    if (state.commitCount < 2) {
      throw new GitMutationError(
        'GIT_NOTHING_TO_COMMIT',
        `A branch "${branch}" precisa ter pelo menos dois commits exclusivos para fazer squash.`,
      );
    }

    try {
      this.confirmations.consume(
        projectId,
        SQUASH_OPERATION_ID,
        confirmationTarget(state),
        confirmationToken,
      );
    } catch (error) {
      if (error instanceof GitMutationConfirmationError) {
        throw new GitMutationError(
          'GIT_MUTATION_CONFIRMATION_REQUIRED',
          'Confirmação obrigatória para fazer squash da branch.',
        );
      }
      throw error;
    }

    try {
      await runGit(projectPath, ['reset', '--soft', state.base]);
      await runGit(projectPath, ['commit', '-m', message.trim()]);
    } catch (error) {
      try {
        await runGit(projectPath, ['reset', '--hard', state.head]);
      } catch {
        // Mantém o erro original; o usuário ainda recebe a falha do squash.
      }
      throw new GitMutationError(
        'GIT_COMMIT_FAILED',
        commandFailureText(error) ||
          'Não foi possível condensar os commits da branch.',
      );
    }

    return { branch };
  }
}
