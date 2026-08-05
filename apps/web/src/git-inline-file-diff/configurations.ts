import type { DetailConfiguration } from './types';

export const configurations: DetailConfiguration[] = [
  {
    container: '.git-summary-commit-detail',
    files: '.git-summary-detail-files',
    patch: '.git-summary-detail-diff pre',
    fullDiffSummary: '.git-summary-detail-diff summary',
  },
];
