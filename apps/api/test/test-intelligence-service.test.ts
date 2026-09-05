import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTestIntelligenceSuggestion } from '../src/services/test-intelligence-service.js';

test('recomenda targeted somente quando todos os arquivos têm evidência direta', () => {
  const suggestion = buildTestIntelligenceSuggestion(
    'test',
    'vitest',
    {
      baseBranch: 'main',
      currentBranch: 'feature/auth',
      changedFiles: ['src/auth.ts', 'src/button.tsx'],
      testFiles: ['src/auth.test.ts', 'src/button.spec.tsx'],
      resolved: { command: 'npm', args: ['run', 'test'] },
    },
    ['src/auth.test.ts', 'src/button.spec.tsx'],
  );

  assert.equal(suggestion.state, 'direct');
  assert.equal(suggestion.recommendation, 'targeted');
  assert.deepEqual(suggestion.unmappedFiles, []);
  assert.deepEqual(suggestion.evidence, [
    {
      kind: 'direct-file-match',
      changedFile: 'src/auth.ts',
      testFiles: ['src/auth.test.ts'],
    },
    {
      kind: 'direct-file-match',
      changedFile: 'src/button.tsx',
      testFiles: ['src/button.spec.tsx'],
    },
  ]);
});

test('arquivo sem mapeamento força unknown e suíte completa', () => {
  const suggestion = buildTestIntelligenceSuggestion(
    'test',
    'vitest',
    {
      baseBranch: 'main',
      currentBranch: 'feature/auth',
      changedFiles: ['src/auth.ts', 'config/runtime.ts'],
      testFiles: ['src/auth.test.ts'],
      resolved: { command: 'npm', args: ['run', 'test'] },
    },
    ['src/auth.test.ts'],
  );

  assert.equal(suggestion.state, 'unknown');
  assert.equal(suggestion.recommendation, 'full-suite');
  assert.deepEqual(suggestion.unmappedFiles, ['config/runtime.ts']);
  assert.deepEqual(suggestion.testFiles, ['src/auth.test.ts']);
});

test('ausência de testes relacionados nunca vira falso targeted', () => {
  const suggestion = buildTestIntelligenceSuggestion(
    'test',
    'rspec',
    {
      baseBranch: 'main',
      currentBranch: 'feature/order',
      changedFiles: ['app/models/order.rb'],
      testFiles: [],
      resolved: { command: 'bundle', args: ['exec', 'rspec'] },
    },
    ['spec/models/customer_spec.rb'],
  );

  assert.equal(suggestion.state, 'unknown');
  assert.equal(suggestion.recommendation, 'full-suite');
  assert.deepEqual(suggestion.unmappedFiles, ['app/models/order.rb']);
});
