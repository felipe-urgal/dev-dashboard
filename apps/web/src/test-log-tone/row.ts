import { RSPEC_PROGRESS_PATTERN, TEST_LOG_ROW_TONE_CLASSES, TEST_LOG_TONE_CLASSES } from './constants';
import { classifyTestLogLine, classifyTestLogSemanticTone, normalizedLine } from './classify';
import { toggleExclusiveClass } from './dom-helpers';

function decorateRspecProgress(code: HTMLElement, text: string): void {
  const line = normalizedLine(text);
  if (!RSPEC_PROGRESS_PATTERN.test(line) || line.length < 3) {
    if (code.dataset.testLogProgressSource !== undefined) {
      code.replaceChildren(code.ownerDocument.createTextNode(text));
      delete code.dataset.testLogProgressSource;
    }
    return;
  }

  if (
    code.dataset.testLogProgressSource === text
    && code.querySelector('.test-log-progress-token')
  ) return;

  const fragment = code.ownerDocument.createDocumentFragment();
  for (const character of text) {
    if (!/[.·•*EFSPX]/i.test(character)) {
      fragment.append(code.ownerDocument.createTextNode(character));
      continue;
    }
    const token = code.ownerDocument.createElement('span');
    token.className = 'test-log-progress-token';
    if (/[EFX]/i.test(character)) token.classList.add('test-log-progress-failure');
    else if (/[SP]/i.test(character)) token.classList.add('test-log-progress-pending');
    else token.classList.add('test-log-progress-success');
    token.textContent = character;
    fragment.append(token);
  }
  code.replaceChildren(fragment);
  code.dataset.testLogProgressSource = text;
}

export function enhanceRow(row: HTMLElement): void {
  const code = row.querySelector<HTMLElement>('code');
  const text = code?.textContent ?? '';
  if (!code) return;

  const semanticTone = classifyTestLogSemanticTone(text);
  toggleExclusiveClass(row, TEST_LOG_ROW_TONE_CLASSES, `tests-log-line-${semanticTone}`);

  const visualTone = classifyTestLogLine(text);
  TEST_LOG_TONE_CLASSES.forEach((className) => {
    const shouldHaveClass = className === `test-log-visual-${visualTone}`;
    if (row.classList.contains(className) !== shouldHaveClass) {
      row.classList.toggle(className, shouldHaveClass);
    }
  });

  decorateRspecProgress(code, text);
  row.dataset.testLogToneSource = text;
}
