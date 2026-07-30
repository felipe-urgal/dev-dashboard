export { classifyGitStatus, matchesCommitFile } from './git-commit/classify';
export { withCommitPrefix } from './git-commit/commit-prefix';
export type { CommitFileFilter, CommitFileKind } from './git-commit/types';

import { enhanceComposer } from './git-commit/composer';
import { enhanceFiles } from './git-commit/files';
import { addPageHeading } from './git-commit/heading';

function enhanceCommitPage(section: HTMLElement): void {
  if (section.dataset.commitEnhanced === 'true') return;
  const metrics = section.querySelector<HTMLElement>('.commit-metrics');
  const layout = section.querySelector<HTMLElement>('.git-commit-layout');
  if (!metrics || !layout) return;

  section.dataset.commitEnhanced = 'true';
  section.classList.add('git-commit-page-enhanced');
  const branch = metrics.querySelector('article strong')?.textContent?.trim() ?? 'HEAD';
  addPageHeading(section, branch);
  const files = enhanceFiles(section);
  enhanceComposer(section, branch, files.counts);
}

function scan(root: ParentNode = document): void {
  const candidates = root instanceof HTMLElement && root.matches('.git-tab-page')
    ? [root]
    : Array.from(root.querySelectorAll<HTMLElement>('.git-tab-page'));
  candidates.forEach(enhanceCommitPage);
}

export function installGitCommitEnhancer(): void {
  if (typeof document === 'undefined') return;
  scan(document);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) scan(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
