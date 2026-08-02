import assert from 'node:assert/strict';
import { test } from 'node:test';

import { slugifyProcessInstance } from '../src/index.js';

test('slugifyProcessInstance keeps normalized-collision instances distinct', () => {
  const slugA = slugifyProcessInstance('api.v1');
  const slugB = slugifyProcessInstance('api_v1');

  assert.notEqual(slugA, slugB);
  assert.equal(slugifyProcessInstance('api.v1'), slugA);
});

test('slugifyProcessInstance keeps case-collision instances distinct', () => {
  const slugA = slugifyProcessInstance('API');
  const slugB = slugifyProcessInstance('api');

  assert.notEqual(slugA, slugB);
});
