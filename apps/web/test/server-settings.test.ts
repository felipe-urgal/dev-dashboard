import assert from 'node:assert/strict';
import { test } from 'vitest';

import { parseServerPort } from '../src/utils/server-settings.js';

test('normalizes automatic and fixed project server ports', () => {
  assert.equal(parseServerPort(''), null);
  assert.equal(parseServerPort(null), null);
  assert.equal(parseServerPort(' 3000 '), 3000);
  assert.equal(parseServerPort(5173), 5173);
});

test('rejects invalid project server ports', () => {
  assert.throws(() => parseServerPort('3000.5'));
  assert.throws(() => parseServerPort(80));
  assert.throws(() => parseServerPort(70_000));
});
