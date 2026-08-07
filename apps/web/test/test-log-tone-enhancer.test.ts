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
  assert.equal(
    isTestLogErrorLine('× spec/real-failure.spec.tsx (1 test | 1 failed)'),
    true,
  );
  assert.equal(isTestLogErrorLine('7483 examples, 1 failure'), true);
  assert.equal(
    isTestLogErrorLine('Failure/Error: expect(result).to eq(expected)'),
    true,
  );
});

test('aplica verde e vermelho ao progresso do RSpec sem tokenizar caracteres', () => {
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
  assert.equal(rows[2]?.classList.contains('test-log-visual-progress'), true);
  assert.equal(rows[3]?.classList.contains('tests-log-line-error'), true);

  const progressCode = rows[2]?.querySelector('code');
  assert.equal(progressCode?.textContent, '...F..');
  assert.equal(progressCode?.childElementCount, 0);
  assert.equal(
    document.querySelector('.tests-log-tabs button:nth-child(2)')?.textContent,
    'Erros (3)',
  );
  assert.equal(
    document.querySelector('.tests-log-tabs button:nth-child(3)')?.textContent,
    'Avisos (0)',
  );
});

test('mantém progresso longo do RSpec em um único nó de texto', () => {
  const progress = `${'.'.repeat(5_000)}F${'.'.repeat(5_000)}`;
  document.body.innerHTML = `
    <div class="tests-log-shell">
      <div class="tests-log-tabs">
        <button class="active">Log</button>
        <button>Erros (0)</button>
        <button>Avisos (0)</button>
      </div>
      <div class="tests-log-output">
        <ol class="tests-log-lines">
          <li class="tests-log-line-default"><span>1</span><code>${progress}</code></li>
        </ol>
      </div>
    </div>
  `;

  enhanceTestLogTones(document);
  enhanceTestLogTones(document);

  const row = document.querySelector<HTMLElement>('.tests-log-lines li');
  const code = row?.querySelector<HTMLElement>('code');
  assert.ok(row);
  assert.ok(code);
  assert.equal(row.classList.contains('test-log-visual-progress'), true);
  assert.equal(row.classList.contains('tests-log-line-error'), true);
  assert.equal(code.textContent, progress);
  assert.equal(code.childElementCount, 0);
  assert.equal(code.childNodes.length, 1);
});

test('mantém saída longa de Vitest com DOM estável em reprocessamentos', () => {
  const total = 2_000;
  const rows = Array.from(
    { length: total },
    (_, index) =>
      `<li class="tests-log-line-default"><span>${index + 1}</span><code>✓ src/features/case-${index}.test.ts &gt; cenário ${index} (1 test) ${index % 40}ms</code></li>`,
  ).join('');

  document.body.innerHTML = `
    <div class="tests-log-shell">
      <div class="tests-log-tabs">
        <button class="active">Log</button>
        <button>Erros (0)</button>
        <button>Avisos (0)</button>
      </div>
      <div class="tests-log-output">
        <ol class="tests-log-lines">${rows}</ol>
      </div>
    </div>
  `;

  enhanceTestLogTones(document);
  enhanceTestLogTones(document);
  enhanceTestLogTones(document);

  const renderedRows = document.querySelectorAll('.tests-log-lines > li');
  const codeNodes = document.querySelectorAll('.tests-log-lines > li > code');
  assert.equal(renderedRows.length, total);
  assert.equal(codeNodes.length, total);
  assert.equal(document.querySelectorAll('.test-log-progress-token').length, 0);
  assert.equal(
    Array.from(codeNodes).every((code) => code.childElementCount === 0),
    true,
  );
  assert.equal(
    document.querySelector('.tests-log-tabs button:nth-child(2)')?.textContent,
    'Erros (0)',
  );
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

  const buttons = shell.querySelectorAll<HTMLButtonElement>(
    '.tests-log-tabs button',
  );
  buttons[0]?.classList.remove('active');
  buttons[1]?.classList.add('active');
  shell.insertAdjacentHTML(
    'beforeend',
    '<div class="test-log-inspector"><strong>Falha identificada no log</strong></div>',
  );

  enhanceTestLogTones(shell);

  assert.equal(buttons[1]?.textContent, 'Erros (0)');
  assert.match(
    shell.querySelector('.test-log-inspector')?.textContent ?? '',
    /Nenhuma falha estruturada/,
  );
  assert.equal(
    shell.querySelector<HTMLElement>('.tests-log-lines li')?.hidden,
    true,
  );
});
