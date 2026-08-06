import { isTestLogErrorLine, isTestLogWarningLine } from './classify';
import { enhanceRow } from './row';

function tabButton(
  shell: HTMLElement,
  prefix: string,
): HTMLButtonElement | undefined {
  return Array.from(
    shell.querySelectorAll<HTMLButtonElement>('.tests-log-tabs button'),
  ).find((button) =>
    button.textContent?.trim().toLocaleLowerCase('pt-BR').startsWith(prefix),
  );
}

function setTabCount(
  button: HTMLButtonElement | undefined,
  label: string,
  count: number,
): void {
  if (!button) return;
  const next = `${label} (${count})`;
  if (button.textContent?.trim() !== next) button.textContent = next;
}

function renderSemanticEmptyInspector(shell: HTMLElement): void {
  const inspector = shell.querySelector<HTMLElement>(
    ':scope > .test-log-inspector',
  );
  if (!inspector || inspector.dataset.testLogSemanticEmpty === 'true') return;

  const empty = inspector.ownerDocument.createElement('div');
  empty.className = 'test-log-inspector-empty';
  const title = inspector.ownerDocument.createElement('strong');
  title.textContent = 'Nenhuma falha estruturada foi identificada.';
  const description = inspector.ownerDocument.createElement('p');
  description.textContent =
    'Linhas aprovadas, mesmo com “error” no nome do arquivo, não são tratadas como falha.';
  empty.append(title, description);
  inspector.replaceChildren(empty);
  inspector.dataset.testLogSemanticEmpty = 'true';
}

export function enhanceShell(shell: HTMLElement): void {
  const rows = Array.from(
    shell.querySelectorAll<HTMLElement>('.tests-log-lines > li'),
  );
  rows.forEach(enhanceRow);

  const activeButton = shell.querySelector<HTMLButtonElement>(
    '.tests-log-tabs button.active',
  );
  const activeLabel =
    activeButton?.textContent?.trim().toLocaleLowerCase('pt-BR') ?? 'log';
  const onRawLog = activeLabel.startsWith('log');

  if (onRawLog) {
    const errorCount = rows.filter((row) =>
      isTestLogErrorLine(row.querySelector('code')?.textContent ?? ''),
    ).length;
    const warningCount = rows.filter((row) =>
      isTestLogWarningLine(row.querySelector('code')?.textContent ?? ''),
    ).length;
    shell.dataset.testLogSemanticErrorCount = String(errorCount);
    shell.dataset.testLogSemanticWarningCount = String(warningCount);
  }

  const errorCount = Number(shell.dataset.testLogSemanticErrorCount ?? '0');
  const warningCount = Number(shell.dataset.testLogSemanticWarningCount ?? '0');
  setTabCount(tabButton(shell, 'erros'), 'Erros', errorCount);
  setTabCount(tabButton(shell, 'avisos'), 'Avisos', warningCount);

  if (activeLabel.startsWith('erros')) {
    rows.forEach((row) => {
      const shouldHide = !isTestLogErrorLine(
        row.querySelector('code')?.textContent ?? '',
      );
      if (row.hidden !== shouldHide) row.hidden = shouldHide;
    });
    if (errorCount === 0) renderSemanticEmptyInspector(shell);
  }
}
