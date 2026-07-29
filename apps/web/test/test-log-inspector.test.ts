import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test } from 'vitest';

import { parseTestLog } from '../src/test-log-inspector';

function sourceFile(fileName: string): string {
  return resolve(process.cwd(), 'src', fileName);
}

const rspecFailure = [
  'bundle exec rspec',
  'Randomized with seed 63580',
  'Failures:',
  '',
  '  1) ShortenedUrl helpers source_url',
  '     Failure/Error: expect(result).to eq(expected)',
  '',
  '       expected: "https://example.com/shortened_url:3003/s/slug-45"',
  '            got: "https://example.com/shortened_url:3000/s/slug-45"',
  '',
  '       (compared using ==)',
  '',
  "     # ./spec/models/shortened_url_spec.rb:78:in `block (3 levels) in <main>'",
  '',
  'Finished in 4 minutes 34.7 seconds (files took 16.56 seconds to load)',
  '7483 examples, 1 failure',
  '',
  'Failed examples:',
  '',
  'rspec ./spec/models/shortened_url_spec.rb:78 # ShortenedUrl helpers source_url',
].join('\n');

test('estrutura falhas RSpec com comparação, origem e resumo', () => {
  const report = parseTestLog(rspecFailure);

  assert.equal(report.total, 7483);
  assert.equal(report.passed, 7482);
  assert.equal(report.failed, 1);
  assert.equal(report.seed, '63580');
  assert.match(report.duration ?? '', /4 minutes 34\.7 seconds/);
  assert.equal(report.failures.length, 1);
  assert.equal(report.failures[0]?.title, 'ShortenedUrl helpers source_url');
  assert.equal(report.failures[0]?.assertion, 'expect(result).to eq(expected)');
  assert.equal(report.failures[0]?.file, './spec/models/shortened_url_spec.rb');
  assert.equal(report.failures[0]?.line, 78);
  assert.match(report.failures[0]?.expected ?? '', /3003/);
  assert.match(report.failures[0]?.actual ?? '', /3000/);
  assert.equal(report.failedExamples.length, 1);
});

test('mantem fallback útil para runners sem bloco de falha estruturado', () => {
  const report = parseTestLog('AssertionError: expected true to be false\n at test/example.test.ts:14:2');

  assert.equal(report.failures.length, 1);
  assert.equal(report.failures[0]?.type, 'AssertionError');
  assert.match(report.failures[0]?.assertion ?? '', /expected true to be false/);
});

test('aplica layout responsivo, comparação e temas por tokens', async () => {
  const css = await readFile(sourceFile('test-log-inspector.css'), 'utf8');

  assert.match(css, /test-log-inspector-layout/);
  assert.match(css, /test-log-comparison-grid/);
  assert.match(css, /test-log-explorer-toolbar/);
  assert.match(css, /var\(--surface-0\)/);
  assert.match(css, /var\(--danger-text\)/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test('carrega o inspetor depois das camadas visuais existentes', async () => {
  const main = await readFile(sourceFile('main.ts'), 'utf8');

  assert.match(main, /import '\.\/test-log-inspector\.css';/);
  assert.match(main, /installTestLogInspector\(\);/);
  assert.ok(main.indexOf("import './test-log-theme-fix.css';") < main.indexOf("import './test-log-inspector.css';"));
});
