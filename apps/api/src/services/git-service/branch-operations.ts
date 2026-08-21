import type { GitBranchMutationResult } from '@dev-dashboard/contracts';

import { REMOTE_UNAVAILABLE_PATTERN } from './constants.js';
import { consumeMutationConfirmation } from './confirmation.js';
import { GitMutationError } from './errors.js';
import {
  assertWorkingTreeClean,
  requireOriginRemote,
  requireRepository,
  validateBranchName,
} from './mutation-guards.js';
import { runGit, commandFailureText } from './run.js';
import { parseStatus } from './status-parsing.js';
import type { GitMutationConfirmationService } from '../git-mutation-confirmation-service.js';
import { computeProjectChangeImpact } from '../project-change-impact-service.js';

/** Mutações de branch: criar, trocar, atualizar (pull) e publicar (push). */
export function createBranchOperations(
  confirmations: GitMutationConfirmationService,
) {
  async function createBranch(
    projectPath: string,
    projectId: string,
    name: string,
    confirmationToken?: string,
  ): Promise<{ branch: string }> {
    validateBranchName(name);
    await requireRepository(projectPath);
    consumeMutationConfirmation(
      confirmations,
      projectId,
      'create-branch',
      name,
      confirmationToken,
    );
    try {
      await runGit(projectPath, [
        'show-ref',
        '--verify',
        '--quiet',
        `refs/heads/${name}`,
      ]);
      throw new GitMutationError(
        'GIT_BRANCH_EXISTS',
        'Já existe um branch com esse nome.',
      );
    } catch (error) {
      if (error instanceof GitMutationError) throw error;
      // show-ref falha quando o branch não existe — é o caminho esperado
    }
    await assertWorkingTreeClean(projectPath);
    try {
      await runGit(projectPath, ['switch', '--create', name]);
    } catch (error) {
      throw new GitMutationError(
        'GIT_BRANCH_INVALID',
        error instanceof Error ? error.message : 'Falha ao criar branch.',
      );
    }
    return { branch: name };
  }

  async function switchBranch(
    projectPath: string,
    projectId: string,
    name: string,
    confirmationToken?: string,
  ): Promise<GitBranchMutationResult> {
    validateBranchName(name);
    await requireRepository(projectPath);
    consumeMutationConfirmation(
      confirmations,
      projectId,
      'switch-branch',
      name,
      confirmationToken,
    );
    try {
      await runGit(projectPath, [
        'show-ref',
        '--verify',
        '--quiet',
        `refs/heads/${name}`,
      ]);
    } catch {
      throw new GitMutationError(
        'GIT_BRANCH_NOT_FOUND',
        'Branch não encontrado.',
      );
    }
    await assertWorkingTreeClean(projectPath);
    const previousSha = (
      await runGit(projectPath, ['rev-parse', 'HEAD'])
    ).trim();
    try {
      await runGit(projectPath, ['switch', name]);
    } catch (error) {
      throw new GitMutationError(
        'GIT_BRANCH_INVALID',
        error instanceof Error ? error.message : 'Falha ao trocar de branch.',
      );
    }
    const currentSha = (
      await runGit(projectPath, ['rev-parse', 'HEAD'])
    ).trim();
    const impact = await computeProjectChangeImpact(
      projectPath,
      previousSha,
      currentSha,
    );
    return { branch: name, impact };
  }

  async function pull(
    projectPath: string,
    projectId: string,
    confirmationToken?: string,
  ): Promise<GitBranchMutationResult> {
    await requireRepository(projectPath);
    const status = parseStatus(
      await runGit(projectPath, [
        'status',
        '--porcelain=v2',
        '--branch',
        '-z',
        '--untracked-files=all',
      ]),
    );
    if (status.detached || !status.branch) {
      throw new GitMutationError(
        'GIT_DETACHED_HEAD',
        'Não é possível fazer pull em um HEAD destacado.',
      );
    }
    const branch = status.branch;
    consumeMutationConfirmation(
      confirmations,
      projectId,
      'pull',
      branch,
      confirmationToken,
    );
    if (!status.upstream) {
      throw new GitMutationError(
        'GIT_NO_UPSTREAM',
        'O branch atual não tem upstream configurado.',
      );
    }
    await assertWorkingTreeClean(projectPath);
    const previousSha = (
      await runGit(projectPath, ['rev-parse', 'HEAD'])
    ).trim();
    try {
      await runGit(projectPath, ['pull', '--ff-only']);
    } catch (error) {
      const details = commandFailureText(error);
      const diverged = /not possible to fast-forward|divergent branches/i.test(
        details,
      );
      if (diverged && branch !== 'main' && branch !== 'master') {
        try {
          await runGit(projectPath, ['rebase', status.upstream]);
        } catch (rebaseError) {
          const rebaseDetails = commandFailureText(rebaseError);
          await runGit(projectPath, ['rebase', '--abort']).catch(() => '');
          throw new GitMutationError(
            'GIT_PULL_DIVERGED',
            'A branch local e a remota divergiram, e o rebase encontrou conflitos. A operação foi abortada sem concluir a atualização.' +
              (rebaseDetails ? `\n${rebaseDetails}` : ''),
          );
        }
      } else if (diverged) {
        throw new GitMutationError(
          'GIT_PULL_DIVERGED',
          'O branch local divergiu do remoto; resolva manualmente antes de tentar novamente.',
        );
      } else if (REMOTE_UNAVAILABLE_PATTERN.test(details)) {
        throw new GitMutationError(
          'GIT_REMOTE_UNAVAILABLE',
          'Não foi possível acessar o remoto configurado.',
        );
      } else {
        throw new GitMutationError('GIT_PULL_FAILED', details);
      }
    }
    const currentSha = (
      await runGit(projectPath, ['rev-parse', 'HEAD'])
    ).trim();
    const impact = await computeProjectChangeImpact(
      projectPath,
      previousSha,
      currentSha,
    );
    return { branch, impact };
  }

  async function push(
    projectPath: string,
    projectId: string,
    confirmationToken?: string,
  ): Promise<{ branch: string }> {
    await requireRepository(projectPath);
    const status = parseStatus(
      await runGit(projectPath, [
        'status',
        '--porcelain=v2',
        '--branch',
        '-z',
        '--untracked-files=all',
      ]),
    );
    if (status.detached || !status.branch) {
      throw new GitMutationError(
        'GIT_DETACHED_HEAD',
        'Não é possível fazer push em um HEAD destacado.',
      );
    }
    const branch = status.branch;
    consumeMutationConfirmation(
      confirmations,
      projectId,
      'push',
      branch,
      confirmationToken,
    );
    await requireOriginRemote(projectPath);
    try {
      if (status.upstream) {
        await runGit(projectPath, ['push']);
      } else {
        await runGit(projectPath, ['push', '--set-upstream', 'origin', branch]);
      }
    } catch (error) {
      const details = commandFailureText(error);
      if (/\[rejected\]|non-fast-forward|fetch first/i.test(details)) {
        throw new GitMutationError(
          'GIT_PUSH_REJECTED',
          'O remoto tem commits que o branch local não possui; faça pull antes de enviar.',
        );
      }
      if (REMOTE_UNAVAILABLE_PATTERN.test(details)) {
        throw new GitMutationError(
          'GIT_REMOTE_UNAVAILABLE',
          'Não foi possível acessar o remoto configurado.',
        );
      }
      throw new GitMutationError('GIT_PUSH_FAILED', details);
    }
    return { branch };
  }

  return { createBranch, switchBranch, pull, push };
}
