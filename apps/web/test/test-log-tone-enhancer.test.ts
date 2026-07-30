import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';

import {
  classifyTestLogSemanticTone,
  enhanceTestLogTones,
  isTestLogErrorLine,
} from '../src/test-log-tone-enhancer';

afterEach(() => {
  document.body.replaceChildren();
});

test('não interpreta arquivo aprovado com error no nome como falha', () => {
  const passedFile = '✓ spec/global-error.spec.tsx (3 tests) 242ms';

  assert.equal(isTestLogErrorLine(passedFile), false);
  assert.equal(classifyTestLogSemanticTone(passedFile), 'success');
  assert.equal(isTestLogErrorLine('× spec/real-failure.spec.tsx (1 test | 1 failed)'), true);
  assert.equal(isTestLogErrorLine('7483 examples, 1 failure'), true);
  assert.equal(isTestLogErrorLine('Failure/Error: expect(result).to eq(expected)'), true);
});

test('aplica verde, vermelho e tokens semânticos ao progresso do RSpec', () => {
  document.body.innerHTML = `
    <div class="tests-log-shell">
      <div class="tests-log-tabs">
        <button class="active">Log</button>
        <button>Erros (99)</button>
        <button>Avisos (99)</button>
      </div>
      <div class="tests-log-output">
        <ol class="tests-log-lines">
          <li class="tests-log-line-error"><span>1</span><code>✓ spec/global-error.spec.tsx (3 tests) 242ms</code></li>
          <li class="tests-log-line-default"><span>2</span><code>× spec/real-failure.spec.tsx (1 test | 1 failed)</code></li>
          <li class="tests-log-line-default"><span>3</span><code>...F..</code></li>
          <li class="tests-log-line-default"><span>4</span><code>Failure/Error: expect(result).to eq(expected)</code></li>
        </ol>
      </div>
    </div>
  `;

  enhanceTestLogTones(document);

  const rows = document.querySelectorAll<HTMLElement>('.tests-log-lines li');
  assert.equal(rows[0]?.classList.contains('tests-log-line-success'), true);
  assert.equal(rows[0]?.classList.contains('tests-log-line-error'), false);
  assert.equal(rows[1]?.classList.contains('tests-log-line-error'), true);
  assert.equal(rows[2]?.classList.contains('tests-log-line-error'), true);
  assert.equal(rows[3]?.classList.contains('tests-log-line-error'), true);

  assert.equal(rows[2]?.querySelectorAll('.test-log-progress-success').length, 5);
  assert.equal(rows[2]?.querySelectorAll('.test-log-progress-failure').length, 1);
  assert.equal(document.querySelector('.tests-log-tabs button:nth-child(2)')?.textContent, 'Erros (3)');
  assert.equal(document.querySelector('.tests-log-tabs button:nth-child(3)')?.textContent, 'Avisos (0)');
});

test('remove o falso diagnóstico estruturado quando não há erro real', () => {
  document.body.innerHTML = `
    <div class="tests-log-shell">
      <div class="tests-log-tabs">
        <button class="active">Log</button>
        <button>Erros (1)</button>
        <button>Avisos (0)</button>
      </div>
      <div class="tests-log-output">
        <ol class="tests-log-lines">
          <li class="tests-log-line-error"><span>1</span><code>✓ spec/global-error.spec.tsx (3 tests) 242ms</code></li>
        </ol>
      </div>
    </div>
  `;

  const shell = document.querySelector<HTMLElement>('.tests-log-shell');
  assert.ok(shell);
  enhanceTestLogTones(document);

  const buttons = shell.querySelectorAll<HTMLButtonElement>('.tests-log-tabs button');
  buttons[0]?.classList.remove('active');
  buttons[1]?.classList.add('active');
  shell.insertAdjacentHTML('beforeend', '<div class="test-log-inspector"><strong>Falha identificada no log</strong></div>');

  enhanceTestLogTones(shell);

  assert.equal(buttons[1]?.textContent, 'Erros (0)');
  assert.match(shell.querySelector('.test-log-inspector')?.textContent ?? '', /Nenhuma falha estruturada/);
  assert.equal(shell.querySelector<HTMLElement>('.tests-log-lines li')?.hidden, true);
});