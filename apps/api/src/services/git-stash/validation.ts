import type { GitStashCreateInput } from '@dev-dashboard/contracts';

import { STASH_REFERENCE_PATTERN } from './constants.js';
import { GitStashError } from './errors.js';

export function validateReference(reference: string): number {
  const match = STASH_REFERENCE_PATTERN.exec(reference);
  const index = match?.[1] ? Number.parseInt(match[1], 10) : Number.NaN;
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new GitStashError(
      'GIT_STASH_REFERENCE_INVALID',
      'Referência de stash inválida.',
    );
  }
  return index;
}

export function validateCreateInput(input: GitStashCreateInput): GitStashCreateInput {
  const message = input.message.trim();
  if (message.length > 200) {
    throw new GitStashError(
      'GIT_STASH_PUSH_FAILED',
      'A mensagem do stash deve ter no máximo 200 caracteres.',
    );
  }
  return {
    message,
    includeUntracked: input.includeUntracked,
    keepIndex: input.keepIndex,
  };
}
