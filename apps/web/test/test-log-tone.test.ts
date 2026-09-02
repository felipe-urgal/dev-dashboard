import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  classifyTestLogSemanticTone,
  isTestLogErrorLine,
  isTestLogWarningLine,
} from '../src/utils/test-log-tone';

test('classifica tons sem depender de DOM', () => {
  const passedFile = '✓ spec/global-error.spec.tsx (3 tests) 242ms';

  assert.equal(isTestLogErrorLine(passedFile), false);
  assert.equal(classifyTestLogSemanticTone(passedFile), 'success');
  assert.equal(
    isTestLogErrorLine('× spec/real-failure.spec.tsx (1 test | 1 failed)'),
    true,
  );
  assert.equal(isTestLogErrorLine('7483 examples, 1 failure'), true);
  assert.equal(
    isTestLogErrorLine('Failure/Error: expect(result).to eq(expected)'),
    true,
  );
  assert.equal(isTestLogWarningLine('DEPRECATION WARNING: API antiga'), true);
  assert.equal(classifyTestLogSemanticTone('RUN v4.0.0'), 'muted');
});

test('não trata resumos sem falhas como erro', () => {
  assert.equal(isTestLogErrorLine('7483 examples, 0 failures'), false);
  assert.equal(classifyTestLogSemanticTone('120 tests, 0 failed'), 'success');
  assert.equal(classifyTestLogSemanticTone('...F..'), 'error');
});
