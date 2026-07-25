import assert from 'node:assert/strict';
import { test } from 'node:test';

import { projectInitials } from '../src/utils/project-labels.js';

test('creates a stable two-letter fallback for project favicons', () => {
  assert.equal(projectInitials('Finance Office'), 'FO');
  assert.equal(projectInitials('controle-gastos'), 'CG');
  assert.equal(projectInitials('API'), 'AP');
});
