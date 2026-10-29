import assert from 'node:assert/strict';
import { test } from 'vitest';

import { renderMarkdown } from '../src/utils/markdown';

test('markdown da resposta nunca emite HTML do modelo', () => {
  const html = renderMarkdown(
    '<script>alert(1)</script> <img src=x onerror=alert(1)> **ok**',
  );
  assert.equal(html.includes('<script'), false);
  assert.equal(html.includes('<img'), false);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<strong>ok<\/strong>/);
});

test('markdown só gera links http(s) e nunca javascript:', () => {
  const ok = renderMarkdown('[docs](https://exemplo.com/a?b=1&c=2)');
  assert.match(ok, /<a href="https:\/\/exemplo\.com\/a\?b=1&amp;c=2"/);
  assert.match(ok, /rel="noopener noreferrer"/);

  const bad = renderMarkdown('[x](javascript:alert(1))');
  assert.equal(bad.includes('<a '), false);
});

test('markdown formata negrito, código, listas e blocos sem interpretar dentro do código', () => {
  const html = renderMarkdown(
    [
      '**Título:**',
      '- um `**cru**`',
      '- dois',
      '',
      '1. a',
      '2. b',
      '',
      '```',
      '<b>x</b>',
      '```',
    ].join('\n'),
  );
  assert.match(html, /<p><strong>Título:<\/strong><\/p>/);
  assert.match(
    html,
    /<ul><li>um <code>\*\*cru\*\*<\/code><\/li><li>dois<\/li><\/ul>/,
  );
  assert.match(html, /<ol><li>a<\/li><li>b<\/li><\/ol>/);
  assert.match(html, /<pre><code>&lt;b&gt;x&lt;\/b&gt;<\/code><\/pre>/);
});
