import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  buildLogDiagnostics,
  parseLogExperience,
  summarizeLogDiagnostics,
} from '../src/utils/log-experience';

test('classifica fluxo Sidekiq com falha, retry e job lento', () => {
  const lines = parseLogExperience(
    [
      '16:18:21 jid=abc class=SyncProductsJob queue=default started',
      '16:18:27 jid=abc class=SyncProductsJob done 6.2s',
      '16:18:30 jid=def class=GenerateReportJob ERROR RuntimeError: boom',
      '16:18:31 jid=def retrying in 30 seconds',
    ].join('\n'),
    'sidekiq',
  );

  assert.equal(lines[0]?.tag, 'START');
  assert.equal(lines[1]?.issueKind, 'slow');
  assert.equal(lines[2]?.tone, 'danger');
  assert.equal(lines[3]?.issueKind, 'retry');

  const summary = summarizeLogDiagnostics(buildLogDiagnostics(lines, 'sidekiq'));
  assert.equal(summary.errors, 1);
  assert.equal(summary.retries, 1);
  assert.equal(summary.slow, 1);
});

test('classifica compilação Webpack e preserva duração', () => {
  const lines = parseLogExperience(
    [
      'Compiling /dashboard',
      'Compiled /dashboard in 3.2s (6273 modules)',
      'WARNING in ./src/legacy.ts deprecated loader',
      'ERROR in ./src/app.ts Module not found: x',
    ].join('\n'),
    'webpack',
  );

  assert.equal(lines[0]?.tag, 'BUILD');
  assert.equal(lines[1]?.durationMs, 3_200);
  assert.equal(lines[1]?.issueKind, 'slow');
  assert.equal(lines[2]?.issueKind, 'warning');
  assert.equal(lines[3]?.issueKind, 'error');
});

test('não transforma teste aprovado cujo caminho contém error em falha', () => {
  const lines = parseLogExperience(
    [
      '✓ spec/global-error.spec.tsx (3 tests) 242ms',
      'FAIL spec/real-failure.spec.tsx',
      'Failure/Error: expect(result).to eq(expected)',
    ].join('\n'),
    'test',
  );

  assert.equal(lines[0]?.tone, 'success');
  assert.equal(lines[0]?.issueKind, undefined);
  assert.equal(lines[1]?.issueKind, 'failure');
  assert.equal(lines[2]?.issueKind, 'failure');
});

test('agrupa mensagens equivalentes removendo ids e números voláteis', () => {
  const lines = parseLogExperience(
    [
      'ERROR job abcdef123456 failed after 120ms',
      'ERROR job fedcba654321 failed after 140ms',
    ].join('\n'),
    'script',
  );
  const issues = buildLogDiagnostics(lines, 'script');

  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.count, 2);
});
