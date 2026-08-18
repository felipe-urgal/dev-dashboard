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

  const activeButton = shell.querySelector<HTMLButtonElement>(
    '.tests-log-tabs button.active',
  );
  const activeLabel =
    activeButton?.textContent?.trim().toLocaleLowerCase('pt-BR') ?? 'log';
  const onRawLog = activeLabel.startsWith('log');
  const lastRowText = rows.at(-1)?.textContent ?? '';
  const rowsSignature = `${rows.length}:${lastRowText}`;
  const rowsChanged = shell.dataset.testLogRowsSignature !== rowsSignature;
  const semanticTones = rowsChanged ? rows.map(enhanceRow) : [];

  if (onRawLog && rowsChanged) {
    const errorCount = semanticTones.filter((tone) => tone === 'error').length;
    const warningCount = semanticTones.filter(
      (tone) => tone === 'warning',
    ).length;
    shell.dataset.testLogSemanticErrorCount = String(errorCount);
    shell.dataset.testLogSemanticWarningCount = String(warningCount);
    shell.dataset.testLogRowsSignature = rowsSignature;
  }

  const errorCount = Number(shell.dataset.testLogSemanticErrorCount ?? '0');
  const warningCount = Number(shell.dataset.testLogSemanticWarningCount ?? '0');
  setTabCount(tabButton(shell, 'erros'), 'Erros', errorCount);
  setTabCount(tabButton(shell, 'avisos'), 'Avisos', warningCount);

  if (activeLabel.startsWith('erros')) {
    rows.forEach((row) => {
      const shouldHide = row.dataset.testLogSemanticTone !== 'error';
      if (row.hidden !== shouldHide) row.hidden = shouldHide;
    });
    if (errorCount === 0) renderSemanticEmptyInspector(shell);
  }
}
