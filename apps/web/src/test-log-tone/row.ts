import { TEST_LOG_ROW_TONE_CLASSES, TEST_LOG_TONE_CLASSES } from './constants';
import { classifyTestLogLine, classifyTestLogSemanticTone } from './classify';
import { toggleExclusiveClass } from './dom-helpers';
import type { TestLogSemanticTone } from './types';

function restorePlainProgressText(code: HTMLElement, text: string): void {
  if (code.dataset.testLogProgressSource === undefined) return;
  code.replaceChildren(code.ownerDocument.createTextNode(text));
  delete code.dataset.testLogProgressSource;
}

export function enhanceRow(row: HTMLElement): TestLogSemanticTone {
  const code = row.querySelector<HTMLElement>('code');
  const text = code?.textContent ?? '';
  if (!code) return 'default';

  // O progresso do RSpec pode ter milhares de caracteres. Mantê-lo como texto
  // evita criar um <span> por ponto e disparar uma cascata de MutationObservers
  // durante o streaming do log.
  restorePlainProgressText(code, text);
  if (row.dataset.testLogToneSource === text) {
    return (
      (row.dataset.testLogSemanticTone as TestLogSemanticTone) ?? 'default'
    );
  }

  const semanticTone = classifyTestLogSemanticTone(text);
  toggleExclusiveClass(
    row,
    TEST_LOG_ROW_TONE_CLASSES,
    `tests-log-line-${semanticTone}`,
  );

  const visualTone = classifyTestLogLine(text);
  TEST_LOG_TONE_CLASSES.forEach((className) => {
    const shouldHaveClass = className === `test-log-visual-${visualTone}`;
    if (row.classList.contains(className) !== shouldHaveClass) {
      row.classList.toggle(className, shouldHaveClass);
    }
  });

  row.dataset.testLogToneSource = text;
  row.dataset.testLogSemanticTone = semanticTone;
  return semanticTone;
}
