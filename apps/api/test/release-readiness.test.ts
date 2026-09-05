import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ProjectDiagnosticReport,
  ProjectGitOverview,
  TestExecutionHistory,
  TestExecutionRecord,
} from '@dev-dashboard/contracts';

import {
  buildReleaseReadinessSnapshot,
  evaluateDoctorReadiness,
  evaluateGitReadiness,
  evaluateTestsReadiness,
  type ReleaseReadinessTestIdentity,
} from '../src/services/release-readiness.js';

const NOW = Date.parse('2026-09-05T18:00:00.000Z');
const IDENTITY: ReleaseReadinessTestIdentity = {
  gitRevision: 'abc123',
  gitDirtyFingerprint: 'clean',
};

function git(input: Partial<ProjectGitOverview> = {}): ProjectGitOverview {
  return {
    repository: true,
    branch: 'feature/example',
    detached: false,
    upstream: 'origin/feature/example',
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

function fullSuite(
  input: Partial<TestExecutionRecord> = {},
): TestExecutionRecord {
  return {
    id: 'run-full',
    projectId: 'p1',
    commandId: 'test',
    scope: 'full-suite',
    status: 'stopped',
    startedAt: '2026-09-05T17:50:00.000Z',
    finishedAt: '2026-09-05T17:55:00.000Z',
    exitCode: 0,
    gitRevision: IDENTITY.gitRevision,
    gitDirtyFingerprint: IDENTITY.gitDirtyFingerprint,
    ...input,
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

test('Git dirty, ahead, behind ou divergente bloqueia readiness', () => {
  assert.equal(
    evaluateGitReadiness(
      git({
        clean: false,
        files: [
          {
            path: 'src/example.ts',
            indexStatus: ' ',
            worktreeStatus: 'M',
            status: 'modified',
          },
        ],
      }),
      '2026-09-05T18:00:00.000Z',
    ).state,
    'block',
  );
  assert.equal(
    evaluateGitReadiness(git({ ahead: 1 }), '2026-09-05T18:00:00.000Z').state,
    'block',
  );
  assert.equal(
    evaluateGitReadiness(git({ behind: 2 }), '2026-09-05T18:00:00.000Z').state,
    'block',
  );
  assert.equal(
    evaluateGitReadiness(
      git({ ahead: 1, behind: 2 }),
      '2026-09-05T18:00:00.000Z',
    ).state,
    'block',
  );
  assert.equal(
    evaluateGitReadiness(git(), '2026-09-05T18:00:00.000Z').state,
    'pass',
  );
});

test('Git sem upstream não produz falso pass de sincronização', () => {
  const overview = git();
  delete overview.upstream;

  const result = evaluateGitReadiness(overview, '2026-09-05T18:00:00.000Z');

  assert.equal(result.state, 'unknown');
  assert.match(result.evidence, /não é possível provar sincronização remota/);
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
        gitRevision: IDENTITY.gitRevision,
        gitDirtyFingerprint: IDENTITY.gitDirtyFingerprint,
      },
    ]),
    NOW,
    60 * 60 * 1000,
    IDENTITY,
  );

  assert.equal(result.state, 'unknown');
  assert.match(result.evidence, /targeted/);
});

test('suíte completa recente distingue sucesso, falha e evidência stale', () => {
  const passed = history([fullSuite()]);

  assert.equal(
    evaluateTestsReadiness(passed, NOW, 60 * 60 * 1000, IDENTITY).state,
    'pass',
  );
  assert.equal(
    evaluateTestsReadiness(
      history([fullSuite({ id: 'failed', status: 'failed', exitCode: 1 })]),
      NOW,
      60 * 60 * 1000,
      IDENTITY,
    ).state,
    'block',
  );
  assert.equal(
    evaluateTestsReadiness(passed, NOW, 60 * 1000, IDENTITY).state,
    'unknown',
  );
});

test('Readiness só usa suíte full com identidade compatível', () => {
  const result = evaluateTestsReadiness(
    history([
      fullSuite({
        id: 'other-revision',
        gitRevision: 'different',
        finishedAt: '2026-09-05T17:59:00.000Z',
      }),
      fullSuite({ id: 'compatible', finishedAt: '2026-09-05T17:57:00.000Z' }),
    ]),
    NOW,
    60 * 60 * 1000,
    IDENTITY,
  );

  assert.equal(result.state, 'pass');
  assert.match(result.evidence, /compatible/);
});

test('identidade ausente ou incompatível nunca produz pass', () => {
  assert.equal(
    evaluateTestsReadiness(history([fullSuite()]), NOW, 60 * 60 * 1000).state,
    'unknown',
  );
  assert.equal(
    evaluateTestsReadiness(
      history([fullSuite({ gitDirtyFingerprint: 'different' })]),
      NOW,
      60 * 60 * 1000,
      IDENTITY,
    ).state,
    'unknown',
  );
  assert.equal(
    evaluateTestsReadiness(
      history([fullSuite({ environmentInstanceId: 'env-a' })]),
      NOW,
      60 * 60 * 1000,
      IDENTITY,
    ).state,
    'unknown',
  );
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
      evaluateTestsReadiness(history([]), NOW, 60 * 60 * 1000, IDENTITY),
    ],
    '2026-09-05T18:00:00.000Z',
  );

  assert.equal(snapshot.state, 'unknown');
  assert.deepEqual(snapshot.checks.map((check) => check.id), ['git', 'doctor', 'tests']);
});
