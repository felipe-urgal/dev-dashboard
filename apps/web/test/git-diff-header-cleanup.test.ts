import assert from 'node:assert/strict';
import { test } from 'vitest';

import { removeRedundantGitDiffHeaders } from '../src/git-diff-header-cleanup';
import { isRedundantGitDiffHeaderLine } from '../src/utils/git-diff-metadata';

test('identifica somente os cabeçalhos técnicos repetitivos do arquivo', () => {
  assert.equal(
    isRedundantGitDiffHeaderLine('diff --git a/app.rb b/app.rb'),
    true,
  );
  assert.equal(
    isRedundantGitDiffHeaderLine('index 123abcd..456def0 100644'),
    true,
  );
  assert.equal(isRedundantGitDiffHeaderLine('--- a/app.rb'), true);
  assert.equal(isRedundantGitDiffHeaderLine('+++ b/app.rb'), true);
  assert.equal(
    isRedundantGitDiffHeaderLine('@@ -10,2 +10,3 @@ def call'),
    false,
  );
  assert.equal(isRedundantGitDiffHeaderLine('new file mode 100644'), false);
});

test('remove cabeçalhos redundantes das visualizações estruturadas e dos patches completos', () => {
  const host = document.createElement('div');
  host.innerHTML = `
    <div class="git-diff-unified-row is-meta"><code>diff --git a/app.rb b/app.rb</code></div>
    <div class="git-diff-unified-row is-meta"><code>index 123abcd..456def0 100644</code></div>
    <div class="git-diff-unified-row is-hunk"><code>@@ -1 +1 @@ def call</code></div>
    <pre><span class="git-syntax-patch-line is-meta"><span class="git-syntax-patch-code">--- a/app.rb</span></span>\n<span class="git-syntax-patch-line is-meta"><span class="git-syntax-patch-code">+++ b/app.rb</span></span>\n<span class="git-syntax-patch-line is-hunk"><span class="git-syntax-patch-code">@@ -1 +1 @@ def call</span></span></pre>
  `;

  removeRedundantGitDiffHeaders(host);

  assert.doesNotMatch(host.textContent ?? '', /diff --git/);
  assert.doesNotMatch(host.textContent ?? '', /index 123abcd/);
  assert.doesNotMatch(host.textContent ?? '', /--- a\/app\.rb/);
  assert.doesNotMatch(host.textContent ?? '', /\+\+\+ b\/app\.rb/);
  assert.match(host.textContent ?? '', /@@ -1 \+1 @@ def call/);
  assert.equal(host.querySelectorAll('.git-syntax-patch-line').length, 1);
});
