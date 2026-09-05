import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ProjectDiagnosticReport,
  ProjectGitOverview,
  TestExecutionHistory,
} from '@dev-dashboard/contracts';

import {
  buildReleaseReadinessSnapshot,
  evaluateDoctorReadiness,
  evaluateGitReadiness,
  evaluateTestsReadiness,
} from '../src/services/release-readiness.js';

const NOW = Date.parse('2026-09-05T18:00:00.000Z');

function git(input: Partial<ProjectGitOverview> = {}): ProjectGitOverview {
  return {
    repository: true,
    branch: 'feature/example',
    detached: false,
    ahead: 0,
    behind: 0,
    clean: true,
    files: [],
    recentCommits: [],
    ...input,
  };
}

function history(items: TestExecutionHistory['items']): TestExecutionHistory {
  return {
    items,
    page: 1,
    pageSize: 20,
    total: items.length,
    totalPages: items.length > 0 ? 1 : 0,
  };
}

function doctor(
  overallStatus: ProjectDiagnosticReport['overallStatus'],
): ProjectDiagnosticReport {
  return {
    projectId: 'p1',
    generatedAt: '2026-09-05T17:58:00.000Z',
    overallStatus,
    summary: {
      passed: overallStatus === 'healthy' ? 3 : 2,
      warnings: overallStatus === 'attention' ? 1 : 0,
      failed: overallStatus === 'blocked' ? 1 : 0,
      skipped: 0,
    },
    checks: [],
  };
}

test('Git dirty ou atrás bloqueia readiness sem autorizar mutação', () => {
  assert.equal(
    evaluateGitReadiness(git({ clean: false, files: [{} as never] }), '2026-09-05T18:00:00.000Z').state,
    'block',
  );
  assert.equal(
    evaluateGitReadiness(git({ behind: 2 }), '2026-09-05T18:00:00.000Z').state,
    'block',
  );
  assert.equal(
    evaluateGitReadiness(git(), '2026-09-05T18:00:00.000Z').state,
    'pass',
  );
});

test('execução targeted nunca comprova suíte completa', () => {
  const result = evaluateTestsReadiness(
    history([
      {
        id: 'run-targeted',
        projectId: 'p1',
        commandId: 'test',
        scope: 'targeted',
        status: 'stopped',
        startedAt: '2026-09-05T17:55:00.000Z',
        finishedAt: '2026-09-05T17:56:00.000Z',
        exitCode: 0,
      },
    ]),
    NOW,
    60 * 60 * 1000,
  );

  assert.equal(result.state, 'unknown');
  assert.match(result.evidence, /targeted/);
});

test('suíte completa recente distingue sucesso, falha e evidência stale', () => {
  const passed = history([
    {
      id: 'run-full',
      projectId: 'p1',
      commandId: 'test',
      scope: 'full-suite',
      status: 'stopped',
      startedAt: '2026-09-05T17:50:00.000Z',
      finishedAt: '2026-09-05T17:55:00.000Z',
      exitCode: 0,
    },
  ]);

  assert.equal(evaluateTestsReadiness(passed, NOW, 60 * 60 * 1000).state, 'pass');
  assert.equal(
    evaluateTestsReadiness(
      history([{ ...passed.items[0]!, id: 'failed', status: 'failed', exitCode: 1 }]),
      NOW,
      60 * 60 * 1000,
    ).state,
    'block',
  );
  assert.equal(evaluateTestsReadiness(passed, NOW, 60 * 1000).state, 'unknown');
});

test('Doctor mantém warning separado de block', () => {
  assert.equal(evaluateDoctorReadiness(doctor('healthy')).state, 'pass');
  assert.equal(evaluateDoctorReadiness(doctor('attention')).state, 'warning');
  assert.equal(evaluateDoctorReadiness(doctor('blocked')).state, 'block');
});

test('snapshot usa o estado mais conservador sem score opaco', () => {
  const snapshot = buildReleaseReadinessSnapshot(
    [
      evaluateGitReadiness(git(), '2026-09-05T18:00:00.000Z'),
      evaluateDoctorReadiness(doctor('attention')),
      evaluateTestsReadiness(history([]), NOW, 60 * 60 * 1000),
    ],
    '2026-09-05T18:00:00.000Z',
  );

  assert.equal(snapshot.state, 'unknown');
  assert.deepEqual(snapshot.checks.map((check) => check.id), ['git', 'doctor', 'tests']);
});
