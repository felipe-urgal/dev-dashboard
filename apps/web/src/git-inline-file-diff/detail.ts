import { ChevronRightIcon } from '@heroicons/vue/24/outline';

import { configurations } from './configurations';
import { mountIcon } from './dom-helpers';
import { enhanceFullDiff, updateFullDiffLabel } from './full-diff';
import { rawPatchOf } from './storage';
import { renderViewer } from './viewer';
import type { DetailConfiguration } from './types';
import { findGitPatchForFile } from '../utils/git-file-patch';

function pathsFromRow(row: HTMLElement): { filePath: string; previousPath: string } | null {
  const code = row.querySelector('code');
  const text = code?.textContent?.trim() ?? '';
  if (!text) return null;
  const parts = text.split(' → ').map((part) => part.trim()).filter(Boolean);
  return {
    filePath: parts.at(-1) ?? text,
    previousPath: parts.length > 1 ? parts[0] ?? '' : '',
  };
}

function enhanceDetail(container: HTMLElement, configuration: DetailConfiguration): void {
  const files = container.querySelector<HTMLElement>(configuration.files);
  const patch = container.querySelector<HTMLElement>(configuration.patch);
  if (!files || !patch || files.dataset.inlineFileDiff === 'true') return;
  files.dataset.inlineFileDiff = 'true';

  const viewer = document.createElement('section');
  viewer.className = 'git-inline-file-diff';
  viewer.hidden = true;
  files.after(viewer);

  let activeRow: HTMLElement | null = null;
  const close = (): void => {
    viewer.hidden = true;
    viewer.replaceChildren();
    activeRow?.classList.remove('is-diff-active');
    activeRow = null;
  };

  files.querySelectorAll<HTMLElement>('ul > li').forEach((row) => {
    const paths = pathsFromRow(row);
    if (!paths) return;
    row.classList.add('git-inline-file-row');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `Ver diff de ${paths.filePath}`);
    mountIcon(row, ChevronRightIcon, 'git-inline-file-row-chevron');

    const open = (): void => {
      const filePatch = findGitPatchForFile(rawPatchOf(patch), paths.filePath, paths.previousPath);
      activeRow?.classList.remove('is-diff-active');
      activeRow = row;
      row.classList.add('is-diff-active');
      renderViewer(viewer, {
        filePath: paths.filePath,
        previousPath: paths.previousPath,
        content: filePatch?.content ?? '',
        binary: row.querySelector('small')?.textContent?.toLocaleLowerCase('pt-BR').includes('binário') ?? false,
        close,
      });
      viewer.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };

    row.addEventListener('click', open);
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open();
    });
  });

  if (configuration.fullDiffSummary) {
    updateFullDiffLabel(container, configuration.fullDiffSummary);
  }
  if (configuration.showFullDiff !== false) enhanceFullDiff(patch);
}

export function scanDetails(root: ParentNode): void {
  configurations.forEach((configuration) => {
    if (root instanceof HTMLElement && root.matches(configuration.container)) {
      enhanceDetail(root, configuration);
    }
    root.querySelectorAll<HTMLElement>(configuration.container).forEach((container) => {
      enhanceDetail(container, configuration);
    });
  });
}
