import assert from 'node:assert/strict';
import test from 'node:test';

import type { MigrationOverview } from '../src/services/migration-provider.js';
import { evaluateMigrationsReadiness } from '../src/services/release-readiness.js';

function overview(status: MigrationOverview['status']): MigrationOverview {
  return {
    provider: 'provider-de-teste',
    status,
    database: 'primary',
    applied: [],
    pending: [],
    observedAt: '2026-09-09T12:00:00.000Z',
    evidence: 'migration-provider:status',
    warnings: [],
  };
}

test('MigrationOverview atualizado produz pass sem depender do provider', () => {
  const check = evaluateMigrationsReadiness(overview('up-to-date'));

  assert.equal(check.id, 'migrations');
  assert.equal(check.state, 'pass');
  assert.equal(check.action.target, 'migrations');
});

test('MigrationOverview pendente produz block', () => {
  assert.equal(evaluateMigrationsReadiness(overview('pending')).state, 'block');
});

test('MigrationOverview unavailable ou unknown permanece inconclusivo', () => {
  assert.equal(
    evaluateMigrationsReadiness(overview('unavailable')).state,
    'unknown',
  );
  assert.equal(
    evaluateMigrationsReadiness(overview('unknown')).state,
    'unknown',
  );
});
