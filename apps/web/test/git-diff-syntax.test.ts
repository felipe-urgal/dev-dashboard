import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  detectLanguage,
  languageForPath,
  syntaxRangesFor,
  syntaxRangesFromHighlightedHtml,
} from '../src/utils/git-diff-syntax';
import { renderGitDiffLineHtml } from '../src/utils/git-diff-view';

test('mapeia a linguagem pela extensão do arquivo', () => {
  assert.equal(languageForPath('app/ui/signup/index.tsx'), 'typescript');
  assert.equal(languageForPath('lib/tasks/deploy.rake'), 'ruby');
  assert.equal(languageForPath('config/database.yml'), 'yaml');
  assert.equal(languageForPath('Dockerfile'), 'dockerfile');
  assert.equal(languageForPath('Gemfile'), 'ruby');
  assert.equal(languageForPath('README'), null);
});

test('cobre as extensões do dia a dia do repositório', () => {
  const expected: Record<string, string> = {
    'apps/web/src/styles/tokens.css': 'css',
    'app/ui/pages/auth/signup/index.tsx': 'typescript',
    'apps/api/src/services/git-service.ts': 'typescript',
    'tasks/README.md': 'markdown',
    'apps/web/src/components/ProjectGitDiffPage.vue': 'xml',
    'apps/web/src/main.js': 'javascript',
    'app/models/user.rb': 'ruby',
    'app/views/users/index.html.haml': 'haml',
  };

  for (const [filePath, language] of Object.entries(expected)) {
    assert.equal(languageForPath(filePath), language, filePath);
    assert.ok(syntaxRangesFor('class Foo\n', language).length >= 0, filePath);
  }
});

test('cai na auto-detecção quando a extensão não diz nada', () => {
  const ruby = [
    'class ApplicationController < ActionController::Base',
    '  before_action :authenticate_user!',
    '  def index',
    '    @projects = Project.where(active: true).order(:name)',
    '    render json: @projects',
    '  end',
    'end',
  ].join('\n');

  assert.equal(detectLanguage('scripts/sem-extensao', ruby), 'ruby');
});

test('não adivinha linguagem a partir de texto sem sinal', () => {
  assert.equal(detectLanguage('notas', 'olá\nmundo\n'), null);
  assert.equal(detectLanguage('notas', '   '), null);
});

test('converte a saída do highlight.js em faixas sobre o texto puro', () => {
  const ranges = syntaxRangesFromHighlightedHtml(
    '<span class="hljs-keyword">const</span> valor = <span class="hljs-number">1</span>;',
    'const valor = 1;',
  );

  assert.deepEqual(ranges, [
    { start: 0, end: 5, className: 'hljs-keyword' },
    { start: 14, end: 15, className: 'hljs-number' },
  ]);
});

test('descarta as faixas quando o texto reconstruído não bate', () => {
  assert.deepEqual(
    syntaxRangesFromHighlightedHtml('<span class="hljs-keyword">const</span>', 'outro'),
    [],
  );
});

test('mantém o alinhamento das faixas em linhas com caracteres escapados', () => {
  const text = 'const marcado = "<Form a=\'b\' />" && true;';
  const ranges = syntaxRangesFor(text, 'typescript');

  assert.ok(ranges.length > 0);
  for (const range of ranges) {
    assert.ok(range.start >= 0 && range.end <= text.length, 'faixa dentro do texto');
  }
  const keyword = ranges.find((range) => range.className === 'hljs-keyword');
  assert.equal(text.slice(keyword!.start, keyword!.end), 'const');
});

test('não realça quando a linguagem é desconhecida', () => {
  assert.deepEqual(syntaxRangesFor('const valor = 1;', null), []);
  assert.deepEqual(syntaxRangesFor('const valor = 1;', 'brainfuck'), []);
});

test('combina realce de sintaxe, trecho alterado e busca na mesma linha', () => {
  const text = 'const valor = 2;';
  const html = renderGitDiffLineHtml(text, {
    syntax: syntaxRangesFor(text, 'typescript'),
    words: [{ start: 14, end: 15 }],
    query: 'valor',
  });

  assert.match(html, /class="hljs-keyword"/);
  assert.match(html, /<mark>valor<\/mark>/);
  assert.match(html, /git-diff-word/);
  assert.ok(!html.includes('<span class="hljs-number">2</span><span'), 'sem faixas duplicadas');
});
