import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  Project,
  ProjectDiagnosticReport,
  ProjectGitOverview,
  TestExecutionHistory,
} from '@dev-dashboard/contracts';

import type { MigrationOverview } from '../src/services/migration-provider.js';
import { ReleaseReadinessService } from '../src/services/release-readiness-service.js';

const NOW = Date.parse('2026-09-05T20:00:00.000Z');
const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/projeto',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: [],
};

const gitOverview: ProjectGitOverview = {
  repository: true,
  branch: 'feature/example',
  detached: false,
  upstream: 'origin/feature/example',
  ahead: 0,
  behind: 0,
  clean: true,
  files: [],
  recentCommits: [],
};

const history: TestExecutionHistory = {
  items: [
    {
      id: 'run-1',
      projectId: project.id,
      commandId: 'test',
      scope: 'full-suite',
      status: 'stopped',
      startedAt: '2026-09-05T19:50:00.000Z',
      finishedAt: '2026-09-05T19:55:00.000Z',
      exitCode: 0,
      gitRevision: 'abc123',
      gitDirtyFingerprint: 'clean',
    },
  ],
  page: 1,
  pageSize: 50,
  total: 1,
  totalPages: 1,
};

const doctorReport: ProjectDiagnosticReport = {
  projectId: project.id,
  generatedAt: '2026-09-05T19:58:00.000Z',
  overallStatus: 'healthy',
  summary: { passed: 3, warnings: 0, failed: 0, skipped: 0 },
  checks: [],
};

const migrationOverview: MigrationOverview = {
  provider: 'custom',
  status: 'up-to-date',
  database: 'primary',
  applied: [],
  pending: [],
  observedAt: '2026-09-05T19:59:00.000Z',
  evidence: 'custom:migrations:status',
  warnings: [],
};

function service(
  overrides: {
    git?: () => Promise<ProjectGitOverview>;
    tests?: () => Promise<TestExecutionHistory>;
    doctor?: () => Promise<ProjectDiagnosticReport>;
    migrations?: () => Promise<MigrationOverview>;
    identity?: () => Promise<{
      gitRevision?: string;
      gitDirtyFingerprint?: string;
    }>;
  } = {},
) {
  return new ReleaseReadinessService(
    { getOverview: overrides.git ?? (async () => gitOverview) },
    { history: overrides.tests ?? (async () => history) },
    { getReport: overrides.doctor ?? (async () => doctorReport) },
    { inspect: overrides.migrations ?? (async () => migrationOverview) },
    {
      now: () => NOW,
      captureIdentity:
        overrides.identity ??
        (async () => ({ gitRevision: 'abc123', gitDirtyFingerprint: 'clean' })),
    },
  );
}

test('agrega Git, histórico de testes, Doctor e Migrations em um snapshot real', async () => {
  const snapshot = await service().getSnapshot(project, {
    testMaxAgeMs: 60 * 60 * 1000,
  });

  assert.equal(snapshot.state, 'pass');
  assert.equal(snapshot.generatedAt, '2026-09-05T20:00:00.000Z');
  assert.deepEqual(
    snapshot.checks.map((check) => [check.id, check.state]),
    [
      ['git', 'pass'],
      ['tests', 'pass'],
      ['doctor', 'pass'],
      ['migrations', 'pass'],
    ],
  );
});

test('migrations pendentes bloqueiam o snapshot sem conhecer o provider', async () => {
  const snapshot = await service({
    migrations: async () => ({
      ...migrationOverview,
      provider: 'prisma',
      status: 'pending',
      evidence: 'prisma:migrate:status',
    }),
  }).getSnapshot(project, { testMaxAgeMs: 60 * 60 * 1000 });

  assert.equal(snapshot.state, 'block');
  assert.equal(
    snapshot.checks.find((check) => check.id === 'migrations')?.state,
    'block',
  );
});

test('falha de uma fonte fica isolada como unknown sem apagar checks saudáveis', async () => {
  const snapshot = await service({
    migrations: async () => {
      throw new Error('migrations indisponível');
    },
  }).getSnapshot(project, { testMaxAgeMs: 60 * 60 * 1000 });

  assert.equal(snapshot.state, 'unknown');
  assert.equal(
    snapshot.checks.find((check) => check.id === 'migrations')?.state,
    'unknown',
  );
  assert.equal(
    snapshot.checks.find((check) => check.id === 'git')?.state,
    'pass',
  );
  assert.equal(
    snapshot.checks.find((check) => check.id === 'tests')?.state,
    'pass',
  );
  assert.equal(
    snapshot.checks.find((check) => check.id === 'doctor')?.state,
    'pass',
  );
});

test('identidade Git incompleta nunca recicla resultado verde de testes', async () => {
  const snapshot = await service({
    identity: async () => ({ gitRevision: 'abc123' }),
  }).getSnapshot(project, { testMaxAgeMs: 60 * 60 * 1000 });

  const tests = snapshot.checks.find((check) => check.id === 'tests');
  assert.equal(tests?.state, 'unknown');
  assert.match(
    tests?.evidence ?? '',
    /revisão\/fingerprint atual não foi fornecida/,
  );
});

test('janela de freshness inválida falha antes de consultar providers', async () => {
  let called = false;
  const instance = service({
    git: async () => {
      called = true;
      return gitOverview;
    },
  });

  await assert.rejects(
    () => instance.getSnapshot(project, { testMaxAgeMs: 0 }),
    /janela de freshness dos testes deve ser positiva/,
  );
  assert.equal(called, false);
});
