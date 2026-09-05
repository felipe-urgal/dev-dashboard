import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ProjectCoverageHistoryEntry,
  ProjectCoverageTotals,
} from '@dev-dashboard/contracts';

import {
  analyzeStructuredFlakiness,
  buildCoverageDelta,
} from '../src/services/test-intelligence-analysis.js';

function totals(pct: number): ProjectCoverageTotals {
  return {
    statements: { total: 100, covered: pct, pct },
    branches: { total: 100, covered: pct, pct },
    functions: { total: 100, covered: pct, pct },
    lines: { total: 100, covered: pct, pct },
  };
}

function snapshot(
  generatedAt: string,
  pct: number,
  overrides: Partial<ProjectCoverageHistoryEntry> = {},
): ProjectCoverageHistoryEntry {
  return {
    id: generatedAt,
    generatedAt,
    recordedAt: generatedAt,
    total: totals(pct),
    gitRevision: 'abc123',
    gitDirtyFingerprint: 'clean',
    files: [
      { path: 'src/auth.ts', ...totals(pct) },
      { path: 'src/other.ts', ...totals(pct) },
    ],
    ...overrides,
  };
}

test('coverage delta compara somente artifact com identidade compatível', () => {
  const current = snapshot('2026-09-05T12:00:00.000Z', 80, {
    files: [
      { path: 'src/auth.ts', ...totals(70) },
      { path: 'src/other.ts', ...totals(90) },
    ],
  });
  const baseline = snapshot('2026-09-05T11:00:00.000Z', 85, {
    files: [
      { path: 'src/auth.ts', ...totals(90) },
      { path: 'src/other.ts', ...totals(80) },
    ],
  });

  const delta = buildCoverageDelta([current, baseline], current.generatedAt, [
    'src/auth.ts',
    'src/missing.ts',
  ]);

  assert.equal(delta.state, 'available');
  assert.equal(delta.total?.lines, -5);
  assert.deepEqual(delta.worsenedFiles, [
    {
      path: 'src/auth.ts',
      statements: -20,
      branches: -20,
      functions: -20,
      lines: -20,
    },
  ]);
  assert.deepEqual(delta.missingFiles, ['src/missing.ts']);
});

test('coverage delta não compara revisão diferente', () => {
  const current = snapshot('2026-09-05T12:00:00.000Z', 80);
  const baseline = snapshot('2026-09-05T11:00:00.000Z', 85, {
    gitRevision: 'different',
  });

  const delta = buildCoverageDelta([current, baseline], current.generatedAt, [
    'src/auth.ts',
  ]);

  assert.equal(delta.state, 'unknown');
  assert.equal(delta.reason, 'no-compatible-baseline');
  assert.equal(delta.total, undefined);
});

test('coverage delta não compara fingerprint dirty diferente', () => {
  const current = snapshot('2026-09-05T12:00:00.000Z', 80, {
    gitDirtyFingerprint: 'dirty-current',
  });
  const baseline = snapshot('2026-09-05T11:00:00.000Z', 85, {
    gitDirtyFingerprint: 'dirty-baseline',
  });

  const delta = buildCoverageDelta([current, baseline], current.generatedAt, [
    'src/auth.ts',
  ]);

  assert.equal(delta.state, 'unknown');
  assert.equal(delta.reason, 'no-compatible-baseline');
});

test('coverage delta não assume comparabilidade sem fingerprint do worktree', () => {
  const current = snapshot('2026-09-05T12:00:00.000Z', 80, {
    gitDirtyFingerprint: undefined,
  });

  const delta = buildCoverageDelta(
    [current, snapshot('2026-09-05T11:00:00.000Z', 85)],
    current.generatedAt,
    ['src/auth.ts'],
  );

  assert.equal(delta.state, 'unknown');
  assert.equal(delta.reason, 'identity-incomplete');
});

test('flakiness exige múltiplos outcomes estruturados na mesma identidade', () => {
  const flakiness = analyzeStructuredFlakiness([
    {
      executionId: 'run-1',
      testIdentity: 'spec/models/user_spec.rb:42',
      outcome: 'passed',
      gitRevision: 'abc123',
      gitDirtyFingerprint: 'clean',
    },
    {
      executionId: 'run-2',
      testIdentity: 'spec/models/user_spec.rb:42',
      outcome: 'failed',
      gitRevision: 'abc123',
      gitDirtyFingerprint: 'clean',
    },
    {
      executionId: 'run-3',
      testIdentity: 'spec/models/user_spec.rb:42',
      outcome: 'passed',
      gitRevision: 'abc123',
      gitDirtyFingerprint: 'clean',
    },
  ]);

  assert.equal(flakiness.state, 'available');
  assert.equal(flakiness.tests.length, 1);
  assert.deepEqual(
    {
      testIdentity: flakiness.tests[0]?.testIdentity,
      attempts: flakiness.tests[0]?.attempts,
      passed: flakiness.tests[0]?.passed,
      failed: flakiness.tests[0]?.failed,
    },
    {
      testIdentity: 'spec/models/user_spec.rb:42',
      attempts: 3,
      passed: 2,
      failed: 1,
    },
  );
});

test('provider sem identidade granular permanece unknown', () => {
  const flakiness = analyzeStructuredFlakiness([
    {
      executionId: 'run-1',
      outcome: 'failed',
      gitRevision: 'abc123',
      gitDirtyFingerprint: 'clean',
    },
  ]);

  assert.equal(flakiness.state, 'unknown');
  assert.equal(flakiness.reason, 'identity-incomplete');
  assert.deepEqual(flakiness.tests, []);
});

test('tentativas da mesma prova em revisões diferentes não viram flaky', () => {
  const flakiness = analyzeStructuredFlakiness([
    {
      executionId: 'run-1',
      testIdentity: 'spec/models/user_spec.rb:42',
      outcome: 'passed',
      gitRevision: 'abc123',
      gitDirtyFingerprint: 'clean',
    },
    {
      executionId: 'run-2',
      testIdentity: 'spec/models/user_spec.rb:42',
      outcome: 'failed',
      gitRevision: 'def456',
      gitDirtyFingerprint: 'clean',
    },
  ]);

  assert.equal(flakiness.state, 'unknown');
  assert.equal(flakiness.reason, 'insufficient-compatible-attempts');
  assert.deepEqual(flakiness.tests, []);
});

test('Environment Instances diferentes não misturam histórico de flakiness', () => {
  const flakiness = analyzeStructuredFlakiness([
    {
      executionId: 'run-1',
      testIdentity: 'spec/models/user_spec.rb:42',
      outcome: 'passed',
      gitRevision: 'abc123',
      gitDirtyFingerprint: 'clean',
      environmentInstanceId: 'env-a',
    },
    {
      executionId: 'run-2',
      testIdentity: 'spec/models/user_spec.rb:42',
      outcome: 'failed',
      gitRevision: 'abc123',
      gitDirtyFingerprint: 'clean',
      environmentInstanceId: 'env-b',
    },
  ]);

  assert.equal(flakiness.state, 'unknown');
  assert.equal(flakiness.reason, 'insufficient-compatible-attempts');
  assert.deepEqual(flakiness.tests, []);
});

test('múltiplas execuções compatíveis sempre verdes não são flaky', () => {
  const flakiness = analyzeStructuredFlakiness([
    {
      executionId: 'run-1',
      testIdentity: 'spec/models/user_spec.rb:42',
      outcome: 'passed',
      gitRevision: 'abc123',
      gitDirtyFingerprint: 'clean',
    },
    {
      executionId: 'run-2',
      testIdentity: 'spec/models/user_spec.rb:42',
      outcome: 'passed',
      gitRevision: 'abc123',
      gitDirtyFingerprint: 'clean',
    },
  ]);

  assert.equal(flakiness.state, 'available');
  assert.deepEqual(flakiness.tests, []);
});
