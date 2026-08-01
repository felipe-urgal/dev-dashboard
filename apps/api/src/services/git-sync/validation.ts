import type { GitSyncStrategy } from '@dev-dashboard/contracts';

import { REMOTE_REFERENCE_PATTERN } from './constants.js';
import { GitSyncError } from './errors.js';

export function validateReference(reference: string): void {
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

export function validateStrategy(strategy: GitSyncStrategy): void {
  if (!['ff-only', 'rebase', 'merge'].includes(strategy)) {
    throw new GitSyncError(
      'GIT_REFERENCE_INVALID',
      'Estratégia de sincronização inválida.',
    );
  }
}
