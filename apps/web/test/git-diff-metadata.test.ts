import assert from 'node:assert/strict';
import { test } from 'vitest';

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
  assert.equal(isRedundantGitDiffHeaderLine('similarity index 98%'), false);
  assert.equal(isRedundantGitDiffHeaderLine('rename from app/old.rb'), false);
});
