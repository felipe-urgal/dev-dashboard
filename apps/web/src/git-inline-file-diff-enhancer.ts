import { scanDetails } from './git-inline-file-diff/detail';
import { TARGET_FILE_KEY } from './git-inline-file-diff/storage';

export { scanDetails } from './git-inline-file-diff/detail';

function commitFilePath(button: HTMLElement): string {
  const row = button.closest('li');
  const codes = Array.from(row?.querySelectorAll('code') ?? []);
  const text = codes.at(-1)?.textContent?.trim() ?? '';
  return text.split(' → ').at(-1)?.trim() ?? text;
}

function rememberCommitFile(event: Event): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLElement>('.git-commit-file-diff');
  if (!button) return;
  const filePath = commitFilePath(button);
  if (!filePath) return;
  try {
    window.sessionStorage.setItem(TARGET_FILE_KEY, JSON.stringify({
      filePath,
      createdAt: Date.now(),
    }));
  } catch {
    // A navegação para a aba Diff continua funcionando sem persistência.
  }
}

function openRememberedDiffFile(): void {
  let target: { filePath?: string; createdAt?: number } | null = null;
  try {
    const raw = window.sessionStorage.getItem(TARGET_FILE_KEY);
    target = raw ? JSON.parse(raw) as { filePath?: string; createdAt?: number } : null;
  } catch {
    target = null;
  }
  if (!target?.filePath || Date.now() - (target.createdAt ?? 0) > 30_000) {
    try { window.sessionStorage.removeItem(TARGET_FILE_KEY); } catch { /* noop */ }
    return;
  }

  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-git-diff-path]'));
  const button = buttons.find((candidate) => candidate.dataset.gitDiffPath === target?.filePath);
  if (!button) return;
  try { window.sessionStorage.removeItem(TARGET_FILE_KEY); } catch { /* noop */ }
  button.click();
  button.focus({ preventScroll: true });
  button.scrollIntoView({ block: 'nearest' });
}

function scan(root: ParentNode = document): void {
  scanDetails(root);
  openRememberedDiffFile();
}

export function installGitInlineFileDiffEnhancer(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('click', rememberCommitFile, true);
  scan(document);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.target instanceof HTMLElement) scan(mutation.target);
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) scan(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
