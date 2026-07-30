export function selectedBranch(panel: HTMLElement): string {
  return panel.querySelector('h3')?.textContent?.trim() ?? '';
}

export function isLocalBranch(panel: HTMLElement): boolean {
  return panel.querySelector('.section-kicker')?.textContent?.trim() === 'Branch local';
}

export function isCurrentBranch(panel: HTMLElement): boolean {
  return panel.querySelector('.branch-state')?.textContent?.trim() === 'Atual';
}

export function protectionReason(branch: string, current: boolean): string {
  if (current) return 'Troque para outra branch antes de remover esta branch.';
  if (branch === 'main' || branch === 'master') {
    return 'Branches principais são protegidas contra remoção no dashboard.';
  }
  return '';
}

export function refreshBranches(): void {
  const button = document.querySelector<HTMLButtonElement>(
    '.git-branches-page .branches-page-heading .secondary-button',
  );
  button?.click();
}
