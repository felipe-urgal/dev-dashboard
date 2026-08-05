import type { GitMutationOperation } from '@dev-dashboard/contracts';

import { GitMutationError } from './errors.js';
import {
  GitMutationConfirmationError,
  type GitMutationConfirmationService,
} from '../git-mutation-confirmation-service.js';

/**
 * Consome um token de confirmação já preparado, traduzindo o erro do
 * mecanismo compartilhado (`GitMutationConfirmationError`) para
 * `GitMutationError` — mesmo comportamento que cada operação de `GitService`
 * replicava individualmente antes da divisão por domínio.
 */
export function consumeMutationConfirmation(
  confirmations: GitMutationConfirmationService,
  projectId: string,
  operation: GitMutationOperation,
  target: string,
  token: string | undefined,
): void {
  try {
    confirmations.consume(projectId, operation, target, token);
  } catch (error) {
    if (error instanceof GitMutationConfirmationError) {
      throw new GitMutationError(error.code, error.message);
    }
    throw error;
  }
}
