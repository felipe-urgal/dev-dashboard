import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  gitSyntaxLanguageForPath,
  highlightGitDiffCode,
  highlightGitPatch,
} from '../src/utils/git-syntax-highlight';

test('infere a linguagem pelo caminho do arquivo', () => {
  assert.equal(gitSyntaxLanguageForPath('app/controllers/admin_controller.rb'), 'ruby');
  assert.equal(gitSyntaxLanguageForPath('src/components/Panel.vue'), 'vue');
  assert.equal(gitSyntaxLanguageForPath('config/database.yml'), 'yaml');
  assert.equal(gitSyntaxLanguageForPath('Gemfile'), 'ruby');
});

test('destaca palavras-chave, classes, métodos, símbolos e comentários Ruby', () => {
  const declaration = highlightGitDiffCode(
    'def current_site',
    'app/controllers/admin_controller.rb',
  );
  const inheritance = highlightGitDiffCode(
    'class AdminController < ApplicationController',
    'app/controllers/admin_controller.rb',
  );
  const methodCall = highlightGitDiffCode(
    'resource_index_path.merge(filtered_params)',
    'app/controllers/admin_controller.rb',
  );
  const symbol = highlightGitDiffCode(
    'dependent: :destroy # remove filhos',
    'app/models/research.rb',
  );

  assert.match(declaration, /git-syntax-keyword[^>]*>def/);
  assert.match(declaration, /git-syntax-function[^>]*>current_site/);
  assert.match(inheritance, /git-syntax-type[^>]*>AdminController/);
  assert.match(inheritance, /git-syntax-type[^>]*>ApplicationController/);
  assert.match(methodCall, /git-syntax-function[^>]*>resource_index_path/);
  assert.match(methodCall, /git-syntax-function[^>]*>merge/);
  assert.match(symbol, /git-syntax-symbol[^>]*>:destroy/);
  assert.match(symbol, /git-syntax-comment[^>]*># remove filhos/);
});

test('mantém a busca marcada dentro dos tokens de sintaxe', () => {
  const highlighted = highlightGitDiffCode(
    'def current_site',
    'app/controllers/admin_controller.rb',
    'site',
  );

  assert.match(highlighted, /git-syntax-function[^>]*>current_<mark>site<\/mark>/);
});

test('aplica sintaxe por arquivo nas linhas de um patch completo', () => {
  const patch = highlightGitPatch([
    'diff --git a/app/controllers/admin_controller.rb b/app/controllers/admin_controller.rb',
    '--- a/app/controllers/admin_controller.rb',
    '+++ b/app/controllers/admin_controller.rb',
    '@@ -1,2 +1,2 @@',
    '-def old_site',
    '+def current_site',
  ].join('\n'));

  assert.match(patch, /git-syntax-patch-line is-deletion/);
  assert.match(patch, /git-syntax-patch-line is-addition/);
  assert.match(patch, /git-syntax-keyword[^>]*>def/);
  assert.match(patch, /git-syntax-function[^>]*>current_site/);
});
