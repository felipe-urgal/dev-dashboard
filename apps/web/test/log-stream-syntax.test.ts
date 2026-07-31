import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';

import { JSDOM } from 'jsdom';

import {
  decorateRawLine,
  isWarningMessage,
} from '../src/log-visual/line-decorators';
import { tokenizeLogLine } from '../src/log-visual/tokens';

const originalDocument = globalThis.document;

afterEach(() => {
  if (originalDocument) globalThis.document = originalDocument;
  else delete (globalThis as { document?: Document }).document;
});

function createLine(value: string): HTMLElement {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  globalThis.document = dom.window.document;
  const line = document.createElement('span');
  line.className = 'project-log-line';
  line.textContent = value;
  document.body.append(line);
  return line;
}

test('tokeniza elementos técnicos sem depender de innerHTML', () => {
  const tokens = tokenizeLogLine(
    'GET /dados/explorador 200 in 130ms SELECT users WHERE id = 2',
  );

  assert.ok(tokens.some((token) => token.kind === 'method' && token.value === 'GET'));
  assert.ok(tokens.some((token) => token.kind === 'route' && token.value === '/dados/explorador'));
  assert.ok(tokens.some((token) => token.kind === 'status' && token.value === '200'));
  assert.ok(tokens.some((token) => token.kind === 'duration' && token.value === '130ms'));
  assert.ok(tokens.some((token) => token.kind === 'sql-keyword' && token.value === 'SELECT'));
  assert.ok(tokens.some((token) => token.kind === 'sql-keyword' && token.value === 'WHERE'));
});

test('renderiza compilação Node como linha estruturada e compacta', () => {
  const line = createLine('✓ Compiled /instrumentation in 2.3s (998 modules)');

  decorateRawLine(line);

  assert.ok(line.classList.contains('enhanced-log-build-card'));
  assert.equal(line.querySelector('.enhanced-log-source-badge')?.textContent, 'NODE');
  assert.equal(line.querySelector('.enhanced-log-kind-badge')?.textContent, 'BUILD');
  assert.match(line.textContent ?? '', /Compilado \/instrumentation/);
  assert.match(line.textContent ?? '', /2\.3s/);
  assert.match(line.textContent ?? '', /998 módulos/);
});

test('destaca eventos Rails preservando o texto original', () => {
  const value = 'Processing by SessionsController#create as HTML';
  const line = createLine(value);

  decorateRawLine(line);

  assert.ok(line.classList.contains('enhanced-log-framework-rails'));
  assert.equal(line.querySelector('.enhanced-log-source-badge')?.textContent, 'RAILS');
  assert.equal(line.querySelector('.log-token-controller')?.textContent, 'SessionsController#create');
  assert.match(line.textContent ?? '', /Processing by SessionsController#create as HTML/);
});

test('reconhece warning do webpack mesmo sem prefixo WARN', () => {
  const value = '<w> [webpack.cache.PackFileCacheStrategy] Serializing big strings (318kiB) impacts performance';
  assert.equal(isWarningMessage(value), true);

  const line = createLine(value);
  decorateRawLine(line);

  assert.ok(line.classList.contains('enhanced-log-warning-card'));
  assert.equal(line.querySelector('.enhanced-log-kind-badge')?.textContent, 'AVISO');
  assert.match(line.textContent ?? '', /PackFileCacheStrategy/);
});
