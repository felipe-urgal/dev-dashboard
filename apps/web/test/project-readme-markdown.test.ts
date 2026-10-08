import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseMarkdown, renderInlineMarkdown } from '../src/utils/project-readme-markdown';

test('slugs repetidos são estáveis e anchors reutilizáveis', () => {
  const source = '# Seção\n# Seção\n## Outra seção';
  const ids = parseMarkdown(source).filter(block => block.type === 'heading').map(block => block.id);
  assert.deepEqual(ids, ['secao', 'secao-1', 'outra-secao']);
  assert.deepEqual(ids, parseMarkdown(source).filter(block => block.type === 'heading').map(block => block.id));
});

test('HTML cru é escapado e scripts nunca se tornam links', () => {
  const markup = renderInlineMarkdown('<img src=x onerror=alert(1)> [abrir](javascript:alert)');
  assert.equal(markup.includes('<img'), false);
  assert.equal(markup.includes('javascript:'), false);
  assert.equal(markup.includes('<a'), false);
  assert.ok(markup.includes('&lt;img'));
});

test('links internos, externos e imagens seguem política restrita', () => {
  const markup = renderInlineMarkdown('[doc](docs/start.md#intro) [site](https://example.com) ![imagem](a.png) [fora](//evil.com)');
  assert.ok(markup.includes('data-readme-target="docs/start.md#intro"'));
  assert.ok(markup.includes('rel="noreferrer noopener"'));
  assert.equal(markup.includes('<img'), false);
  assert.equal(markup.includes('evil.com"'), false);
});

test('lista, tabela, código e links com HTML no label mantêm escaping', () => {
  const blocks = parseMarkdown('- um\n- dois\n\n| a | b |\n| --- | --- |\n| x | y |');
  assert.ok(blocks.some(block => block.type === 'list'));
  assert.ok(blocks.some(block => block.type === 'table'));
  const markup = renderInlineMarkdown('[<script>](#secao) e `<b>`');
  assert.ok(markup.includes('&lt;script&gt;'));
  assert.ok(markup.includes('&lt;b&gt;'));
});
