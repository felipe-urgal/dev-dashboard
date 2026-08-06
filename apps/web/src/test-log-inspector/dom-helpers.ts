import type { TestLogInspectorMode } from './types';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function labelValue(
  parent: HTMLElement,
  label: string,
  value: string,
  className?: string,
): void {
  const item = el('div', className);
  item.append(el('span', undefined, label), el('strong', undefined, value));
  parent.append(item);
}

export function collectLog(shell: HTMLElement): string {
  return Array.from(
    shell.querySelectorAll<HTMLElement>('.tests-log-lines li code'),
  )
    .map((line) => line.textContent ?? '')
    .join('\n');
}

export function modeFor(shell: HTMLElement): TestLogInspectorMode {
  const label =
    shell
      .querySelector<HTMLButtonElement>('.tests-log-tabs button.active')
      ?.textContent?.trim()
      .toLowerCase() ?? 'log';
  if (label.startsWith('erros')) return 'errors';
  if (label.startsWith('avisos')) return 'warnings';
  if (label.startsWith('detalhes')) return 'details';
  return 'log';
}

export function hidden(node: HTMLElement | null, value: boolean): void {
  if (node && node.hidden !== value) node.hidden = value;
}

export function updatePressed(
  button: HTMLButtonElement,
  active: boolean,
): void {
  button.setAttribute('aria-pressed', String(active));
  button.classList.toggle('active', active);
}
