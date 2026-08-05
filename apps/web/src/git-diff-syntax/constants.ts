export const PATCH_SELECTOR = [
  '.git-summary-detail-diff pre',
  '.git-history-page-diff pre',
  'pre.git-commit-detail-patch',
  '.git-commit-detail-patch pre',
  'pre.git-history-page-patch',
  '.git-history-page-patch pre',
].join(', ');

export const CODE_SELECTOR = [
  '.git-diff-unified-row code',
  '.git-diff-side-cell code',
  '.git-inline-diff-line code',
  '.git-inline-diff-side code',
].join(', ');
