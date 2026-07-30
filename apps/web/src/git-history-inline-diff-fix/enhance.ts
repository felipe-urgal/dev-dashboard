import {
  Bars3BottomLeftIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  ViewColumnsIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

import { findGitPatchForFile } from '../utils/git-file-patch';
import { mountIcon } from './dom-helpers';
import { split, unified } from './diff-render';
import { filePaths } from './paths';
import { readMode, saveMode } from './storage';

export function enhance(detail: HTMLElement): void {
  const files = detail.querySelector<HTMLElement>('.git-history-page-detail-files');
  const patch = detail.querySelector<HTMLElement>('.git-history-page-diff pre');
  if (!files || !patch || files.dataset.historyInlineDiffFix === 'true') return;
  files.dataset.historyInlineDiffFix = 'true';

  const viewer = document.createElement('section');
  viewer.className = 'git-inline-file-diff';
  viewer.hidden = true;
  files.after(viewer);
  let active: HTMLElement | null = null;

  const close = (): void => {
    viewer.hidden = true;
    viewer.replaceChildren();
    active?.classList.remove('is-diff-active');
    active = null;
  };

  files.querySelectorAll<HTMLElement>('ul > li').forEach((row) => {
    if (row.classList.contains('git-inline-file-row')) return;
    const paths = filePaths(row);
    if (!paths) return;
    row.classList.add('git-inline-file-row');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `Ver diff de ${paths.path}`);
    mountIcon(row, ChevronRightIcon, 'git-inline-file-row-chevron');

    const open = (): void => {
      const filePatch = findGitPatchForFile(patch.dataset.rawPatch ?? patch.textContent ?? '', paths.path, paths.previousPath);
      active?.classList.remove('is-diff-active');
      active = row;
      row.classList.add('is-diff-active');
      viewer.hidden = false;
      viewer.replaceChildren();

      const header = document.createElement('header');
      const heading = document.createElement('div');
      mountIcon(heading, DocumentTextIcon, 'git-inline-diff-heading-icon');
      const copy = document.createElement('div');
      const eyebrow = document.createElement('span');
      eyebrow.textContent = 'Diff do arquivo';
      const title = document.createElement('code');
      title.textContent = paths.path;
      copy.append(eyebrow, title);
      heading.append(copy);

      const actions = document.createElement('div');
      actions.className = 'git-inline-diff-actions';
      const switcher = document.createElement('div');
      switcher.className = 'git-inline-diff-mode-switch';
      const body = document.createElement('div');
      body.className = 'git-inline-diff-body';
      let mode = readMode();

      const draw = (): void => {
        switcher.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
          const selected = button.dataset.mode === mode;
          button.classList.toggle('active', selected);
          button.setAttribute('aria-pressed', String(selected));
        });
        body.replaceChildren();
        const binary = row.querySelector('small')?.textContent?.toLocaleLowerCase('pt-BR').includes('binário') ?? false;
        if (binary || !filePatch?.content.trim()) {
          const empty = document.createElement('div');
          empty.className = 'git-inline-diff-empty';
          empty.textContent = binary
            ? 'Arquivos binários não possuem visualização textual.'
            : 'O patch deste arquivo não está disponível ou foi truncado.';
          body.append(empty);
        } else {
          body.append(mode === 'split' ? split(filePatch.content) : unified(filePatch.content));
        }
      };

      [
        { mode: 'unified' as const, label: 'Unificado', icon: Bars3BottomLeftIcon },
        { mode: 'split' as const, label: 'Lado a lado', icon: ViewColumnsIcon },
      ].forEach((definition) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.mode = definition.mode;
        mountIcon(button, definition.icon, 'git-inline-diff-mode-icon');
        const label = document.createElement('span');
        label.textContent = definition.label;
        button.append(label);
        button.addEventListener('click', () => {
          mode = definition.mode;
          saveMode(mode);
          draw();
        });
        switcher.append(button);
      });

      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.className = 'git-inline-diff-close';
      closeButton.setAttribute('aria-label', 'Fechar diff do arquivo');
      mountIcon(closeButton, XMarkIcon, 'git-inline-diff-close-icon');
      closeButton.addEventListener('click', close);
      actions.append(switcher, closeButton);
      header.append(heading, actions);
      viewer.append(header, body);
      draw();
      viewer.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };

    row.addEventListener('click', open);
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open();
    });
  });
}
