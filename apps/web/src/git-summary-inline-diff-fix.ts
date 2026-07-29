import { h, render } from 'vue';
import {
  Bars3BottomLeftIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  ViewColumnsIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

import {
  buildSplitGitDiffRows,
  parseUnifiedGitDiff,
  type GitUnifiedDiffLine,
} from './utils/git-diff-view';
import { findGitPatchForFile } from './utils/git-file-patch';

type ViewMode = 'unified' | 'split';

const MODE_KEY = 'dev-dashboard-git-inline-diff-mode';

function mountIcon(host: HTMLElement, component: Parameters<typeof h>[0], className: string): void {
  const iconHost = document.createElement('span');
  iconHost.className = className;
  iconHost.setAttribute('aria-hidden', 'true');
  render(h(component, { class: `${className}-svg` }), iconHost);
  host.append(iconHost);
}

function readMode(): ViewMode {
  try {
    return window.localStorage.getItem(MODE_KEY) === 'split' ? 'split' : 'unified';
  } catch {
    return 'unified';
  }
}

function saveMode(mode: ViewMode): void {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Preferência visual opcional.
  }
}

function prefix(line: GitUnifiedDiffLine | null): string {
  if (!line) return '';
  if (line.kind === 'addition') return '+';
  if (line.kind === 'deletion') return '−';
  return line.kind === 'context' ? ' ' : '';
}

function number(value: number | null): string {
  return value === null ? '' : String(value);
}

function unified(content: string): HTMLElement {
  const table = document.createElement('div');
  table.className = 'git-inline-diff-unified';

  parseUnifiedGitDiff(content).forEach((line) => {
    const row = document.createElement('div');
    row.className = `git-inline-diff-line is-${line.kind}`;

    const oldNumber = document.createElement('span');
    oldNumber.className = 'git-inline-diff-line-number';
    oldNumber.textContent = number(line.oldLine);
    const newNumber = document.createElement('span');
    newNumber.className = 'git-inline-diff-line-number';
    newNumber.textContent = number(line.newLine);
    const marker = document.createElement('span');
    marker.className = 'git-inline-diff-prefix';
    marker.textContent = prefix(line);
    const code = document.createElement('code');
    code.textContent = line.text;

    row.append(oldNumber, newNumber, marker, code);
    table.append(row);
  });

  return table;
}

function splitCell(line: GitUnifiedDiffLine | null, side: 'left' | 'right'): HTMLElement {
  const cell = document.createElement('div');
  cell.className = `git-inline-diff-side is-${side}${line ? ` is-${line.kind}` : ' is-empty'}`;

  const lineNumber = document.createElement('span');
  lineNumber.className = 'git-inline-diff-line-number';
  lineNumber.textContent = number(side === 'left' ? line?.oldLine ?? null : line?.newLine ?? null);
  const marker = document.createElement('span');
  marker.className = 'git-inline-diff-prefix';
  marker.textContent = prefix(line);
  const code = document.createElement('code');
  code.textContent = line?.text ?? '';

  cell.append(lineNumber, marker, code);
  return cell;
}

function split(content: string): HTMLElement {
  const table = document.createElement('div');
  table.className = 'git-inline-diff-split';

  buildSplitGitDiffRows(parseUnifiedGitDiff(content)).forEach((row) => {
    if (row.kind === 'meta') {
      const meta = document.createElement('div');
      const line = row.left ?? row.right;
      meta.className = `git-inline-diff-split-meta is-${line?.kind ?? 'meta'}`;
      const code = document.createElement('code');
      code.textContent = line?.text ?? '';
      meta.append(code);
      table.append(meta);
      return;
    }

    const pair = document.createElement('div');
    pair.className = `git-inline-diff-pair is-${row.kind}`;
    pair.append(splitCell(row.left, 'left'), splitCell(row.right, 'right'));
    table.append(pair);
  });

  return table;
}

function filePaths(row: HTMLElement): { path: string; previousPath: string } | null {
  const text = row.querySelector('code')?.textContent?.trim() ?? '';
  if (!text) return null;
  const parts = text.split(' → ').map((part) => part.trim()).filter(Boolean);
  return {
    path: parts.at(-1) ?? text,
    previousPath: parts.length > 1 ? parts[0] ?? '' : '',
  };
}

function enhance(detail: HTMLElement): void {
  const files = detail.querySelector<HTMLElement>('.git-summary-detail-files');
  const patch = detail.querySelector<HTMLElement>('.git-summary-detail-diff pre');
  if (!files || !patch || files.dataset.summaryInlineDiffFix === 'true') return;

  // O enhancer genérico pode já ter processado este painel.
  if (files.querySelector('.git-inline-file-row')) {
    files.dataset.summaryInlineDiffFix = 'true';
    return;
  }

  files.dataset.summaryInlineDiffFix = 'true';
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
    const paths = filePaths(row);
    if (!paths) return;

    row.classList.add('git-inline-file-row');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `Ver diff de ${paths.path}`);
    mountIcon(row, ChevronRightIcon, 'git-inline-file-row-chevron');

    const open = (): void => {
      const filePatch = findGitPatchForFile(patch.textContent ?? '', paths.path, paths.previousPath);
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
      if (paths.previousPath && paths.previousPath !== paths.path) {
        const previous = document.createElement('small');
        previous.textContent = `Renomeado de ${paths.previousPath}`;
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

  const label = Array.from(
    detail.querySelectorAll<HTMLElement>('.git-summary-detail-diff summary span'),
  ).find((candidate) => candidate.textContent?.includes('diff completo'));
  if (label) label.textContent = 'Ver diff completo (todos os arquivos)';
}

function scan(): void {
  document.querySelectorAll<HTMLElement>('.git-summary-commit-detail').forEach(enhance);
}

export function installGitSummaryInlineDiffFix(): void {
  if (typeof document === 'undefined') return;
  scan();

  let scheduled = false;
  const scheduleScan = (): void => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      scan();
    });
  };

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
