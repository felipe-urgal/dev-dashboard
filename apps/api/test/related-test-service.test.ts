import assert from 'node:assert/strict';
import test from 'node:test';

import { findRelatedTestFiles } from '../src/services/related-test-service.js';

test('maps Rails source files to RSpec files and keeps changed specs', () => {
  const related = findRelatedTestFiles(
    [
      'app/models/order.rb',
      'app/services/payment_processor.rb',
      'spec/requests/checkout_spec.rb',
    ],
    [
      'spec/models/order_spec.rb',
      'spec/services/payment_processor_spec.rb',
      'spec/requests/checkout_spec.rb',
      'spec/models/unrelated_spec.rb',
    ],
    'rspec',
  );

  assert.deepEqual(related, [
    'spec/models/order_spec.rb',
    'spec/requests/checkout_spec.rb',
    'spec/services/payment_processor_spec.rb',
  ]);
});

test('maps Node source files to colocated test and spec files', () => {
  const related = findRelatedTestFiles(
    ['src/services/auth.ts', 'src/components/button.tsx'],
    [
      'src/services/auth.test.ts',
      'src/services/session.test.ts',
      'src/components/button.spec.tsx',
    ],
    'vitest',
  );

  assert.deepEqual(related, [
    'src/components/button.spec.tsx',
    'src/services/auth.test.ts',
  ]);
});

test('does not include unrelated tests when no path or stem matches', () => {
  const related = findRelatedTestFiles(
    ['app/models/order.rb'],
    ['spec/models/customer_spec.rb'],
    'rspec',
  );

  assert.deepEqual(related, []);
});
