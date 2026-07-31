function totalFileCount(page: HTMLElement): number {
  const cards = page.querySelectorAll('.git-diff-file-card').length;
  if (cards > 0) return cards;
  const text = page.querySelector<HTMLElement>('.git-diff-files-pane > header span')?.textContent ?? '';
  const match = text.match(/de\s+(\d+)/i);
  if (match?.[1]) return Number.parseInt(match[1], 10) || 0;
  return page.querySelectorAll('.git-diff-file-list > button').length;
}

export function updateFilters(page: HTMLElement): void {
  const statusFilter = page.querySelector<HTMLElement>('.git-diff-status-filter');
  const singleFile = totalFileCount(page) <= 1;
  page.classList.toggle('has-single-diff-file', singleFile);
  if (statusFilter) statusFilter.hidden = singleFile;
}
