import type { GitStashEntry } from '@dev-dashboard/contracts';

import { consumeMutationConfirmation } from './confirmation.js';
import { GitMutationError } from './errors.js';
import { assertWorkingTreeClean, requireRepository } from './mutation-guards.js';
import { runGit, commandFailureText } from './run.js';
import { parseStatus } from './status-parsing.js';
import { listStashEntries } from './stash.js';
import type { GitMutationConfirmationService } from '../git-mutation-confirmation-service.js';

/** Mutações de stash: guardar alterações rastreadas e restaurar o mais recente. */
export function createStashOperations(confirmations: GitMutationConfirmationService) {
  async function stashPush(projectPath: string, projectId: string, confirmationToken?: string): Promise<{ stash: GitStashEntry }> {
    await requireRepository(projectPath);
    const status = parseStatus(await runGit(projectPath, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']));
    const branch = status.branch ?? 'HEAD';
    consumeMutationConfirmation(confirmations, projectId, 'stash-push', branch, confirmationToken);
    const hasTrackedChanges = status.files.some((file) => file.status !== 'untracked');
    if (!hasTrackedChanges) {
      throw new GitMutationError('GIT_NOTHING_TO_STASH', 'Não há alterações rastreadas para guardar no stash.');
    }
    try {
      await runGit(projectPath, ['stash', 'push']);
    } catch (error) {
      throw new GitMutationError('GIT_STASH_PUSH_FAILED', error instanceof Error ? error.message : 'Falha ao guardar o stash.');
    }
    const created = (await listStashEntries(projectPath))[0];
    if (!created) {
      throw new GitMutationError('GIT_STASH_PUSH_FAILED', 'Stash criado mas não encontrado na listagem.');
    }
    return { stash: created };
  }

  async function stashPop(projectPath: string, projectId: string, confirmationToken?: string): Promise<{ popped: GitStashEntry }> {
    await requireRepository(projectPath);
    const status = parseStatus(await runGit(projectPath, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']));
    const branch = status.branch ?? 'HEAD';
    consumeMutationConfirmation(confirmations, projectId, 'stash-pop', branch, confirmationToken);
    const top = (await listStashEntries(projectPath))[0];
    if (!top) {
      throw new GitMutationError('GIT_STASH_EMPTY', 'Não há nenhum stash para restaurar.');
    }
    await assertWorkingTreeClean(projectPath);
    const beforeHead = (await runGit(projectPath, ['rev-parse', 'HEAD'])).trim();
    try {
      await runGit(projectPath, ['stash', 'pop']);
    } catch (error) {
      try {
        await runGit(projectPath, ['reset', '--hard', beforeHead]);
      } catch {
        // A árvore de trabalho é restaurada em melhor esforço; o erro original do pop é o relevante.
      }
      const details = commandFailureText(error);
      if (/conflict/i.test(details)) {
        throw new GitMutationError('GIT_STASH_CONFLICT', 'Não foi possível restaurar o stash sem conflitos; a árvore de trabalho foi mantida limpa e o stash foi preservado.');
      }
      throw new GitMutationError('GIT_STASH_POP_FAILED', details);
    }
    return { popped: top };
  }

  return { stashPush, stashPop };
}
