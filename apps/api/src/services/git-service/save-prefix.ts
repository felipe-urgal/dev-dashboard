import { SAVE_PREFIX_BY_BRANCH_TYPE } from './constants.js';

export function resolveSavePrefix(branch: string | undefined): string {
  if (!branch) return '';
  const type = branch.split('/')[0] ?? '';
  return SAVE_PREFIX_BY_BRANCH_TYPE[type] ?? '';
}
