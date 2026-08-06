import {
  Bars3BottomLeftIcon,
  ViewColumnsIcon,
} from '@heroicons/vue/24/outline';

import { mountIcon } from './dom-helpers';
import { emptyView, splitView, unifiedView } from './diff-render';
import { persistViewMode, rawPatchOf, readViewMode } from './storage';

export function updateFullDiffLabel(
  container: HTMLElement,
  selector: string,
): void {
  const summary = container.querySelector<HTMLElement>(selector);
  const labels = Array.from(
    summary?.querySelectorAll<HTMLElement>('span') ?? [],
  );
  const label = labels.find((candidate) =>
    candidate.textContent?.includes('diff completo'),
  );
  if (label) label.textContent = 'Ver diff completo (todos os arquivos)';
}

export function enhanceFullDiff(patch: HTMLElement): void {
  const details = patch.closest<HTMLDetailsElement>('details');
  if (!details || details.dataset.structuredFullDiff === 'true') return;
  details.dataset.structuredFullDiff = 'true';

  const rawPatch = rawPatchOf(patch);
  // O CSS legado do <pre> define display:block e pode sobrepor o atributo hidden.
  // A referência continua disponível para os cliques nos arquivos, então removemos
  // apenas a representação visual antiga e mantemos o patch bruto em memória.
  patch.remove();

  const shell = document.createElement('section');
  shell.className = 'git-inline-full-diff';
  const toolbar = document.createElement('div');
  toolbar.className = 'git-inline-full-diff-toolbar';
  const label = document.createElement('strong');
  label.textContent = 'Visualização';
  const switcher = document.createElement('div');
  switcher.className = 'git-inline-diff-mode-switch';
  switcher.setAttribute('aria-label', 'Modo de visualização do diff completo');
  const body = document.createElement('div');
  body.className = 'git-inline-diff-body';
  let mode = readViewMode();

  const draw = (): void => {
    switcher.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      const selected = button.dataset.mode === mode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    body.replaceChildren();
    body.append(
      rawPatch.trim()
        ? mode === 'split'
          ? splitView(rawPatch)
          : unifiedView(rawPatch)
        : emptyView('Este commit não possui diff textual para exibir.'),
    );
  };

  [
    { mode: 'unified' as const, label: 'Unificado', icon: Bars3BottomLeftIcon },
    { mode: 'split' as const, label: 'Lado a lado', icon: ViewColumnsIcon },
  ].forEach((definition) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mode = definition.mode;
    mountIcon(button, definition.icon, 'git-inline-diff-mode-icon');
    const text = document.createElement('span');
    text.textContent = definition.label;
    button.append(text);
    button.addEventListener('click', () => {
      mode = definition.mode;
      persistViewMode(mode);
      draw();
    });
    switcher.append(button);
  });

  toolbar.append(label, switcher);
  shell.append(toolbar, body);
  details.append(shell);
  draw();
}
