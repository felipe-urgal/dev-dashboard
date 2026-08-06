import { h } from 'vue';
import {
  Bars3BottomLeftIcon,
  DocumentTextIcon,
  ViewColumnsIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

import { mountIcon } from './dom-helpers';
import { emptyView, splitView, unifiedView } from './diff-render';
import { persistViewMode, readViewMode } from './storage';
import type { DiffViewMode } from './types';

export function renderViewer(
  viewer: HTMLElement,
  options: {
    filePath: string;
    previousPath: string;
    content: string;
    binary: boolean;
    close: () => void;
  },
): void {
  let mode = readViewMode();
  viewer.hidden = false;
  viewer.replaceChildren();

  const header = document.createElement('header');
  const heading = document.createElement('div');
  mountIcon(heading, DocumentTextIcon, 'git-inline-diff-heading-icon');
  const copy = document.createElement('div');
  const eyebrow = document.createElement('span');
  eyebrow.textContent = 'Diff do arquivo';
  const title = document.createElement('code');
  title.textContent = options.filePath;
  copy.append(eyebrow, title);
  if (options.previousPath && options.previousPath !== options.filePath) {
    const previous = document.createElement('small');
    previous.textContent = `Renomeado de ${options.previousPath}`;
    copy.append(previous);
  }
  heading.append(copy);

  const actions = document.createElement('div');
  actions.className = 'git-inline-diff-actions';
  const switcher = document.createElement('div');
  switcher.className = 'git-inline-diff-mode-switch';
  switcher.setAttribute('aria-label', 'Modo de visualização do diff');

  const body = document.createElement('div');
  body.className = 'git-inline-diff-body';

  const draw = (): void => {
    switcher.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === mode);
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    });
    body.replaceChildren();
    if (options.binary) {
      body.append(
        emptyView('Arquivos binários não possuem visualização textual.'),
      );
    } else if (!options.content.trim()) {
      body.append(
        emptyView('O patch deste arquivo não está disponível ou foi truncado.'),
      );
    } else {
      body.append(
        mode === 'split'
          ? splitView(options.content)
          : unifiedView(options.content),
      );
    }
  };

  const modeDefinitions: Array<{
    mode: DiffViewMode;
    label: string;
    icon: Parameters<typeof h>[0];
  }> = [
    { mode: 'unified', label: 'Unificado', icon: Bars3BottomLeftIcon },
    { mode: 'split', label: 'Lado a lado', icon: ViewColumnsIcon },
  ];

  modeDefinitions.forEach((definition) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mode = definition.mode;
    mountIcon(button, definition.icon, 'git-inline-diff-mode-icon');
    const label = document.createElement('span');
    label.textContent = definition.label;
    button.append(label);
    button.addEventListener('click', () => {
      mode = definition.mode;
      persistViewMode(mode);
      draw();
    });
    switcher.append(button);
  });

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'git-inline-diff-close';
  close.title = 'Fechar diff do arquivo';
  close.setAttribute('aria-label', 'Fechar diff do arquivo');
  mountIcon(close, XMarkIcon, 'git-inline-diff-close-icon');
  close.addEventListener('click', options.close);
  actions.append(switcher, close);
  header.append(heading, actions);
  viewer.append(header, body);
  draw();
}
