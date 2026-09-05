import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ProductionOverview,
  Project,
  ProjectDiagnosticReport,
  ProjectGitOverview,
  TestExecutionHistory,
} from '@dev-dashboard/contracts';

import { AttentionCenterService } from '../src/services/attention-center-service.js';

const NOW = Date.parse('2026-09-05T12:00:00.000Z');

function project(id: string, name: string, enabled = true): Project {
  return {
    id,
    name,
    path: `/tmp/${id}`,
    type: 'node',
    source: 'workspace',
    workspaceId: 'w1',
    enabled,
    capabilities: ['git', 'tests'],
  };
}

function gitOverview(
  input: Partial<ProjectGitOverview> = {},
): ProjectGitOverview {
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

function testHistory(
  items: TestExecutionHistory['items'] = [],
): TestExecutionHistory {
  return {
    items,
    page: 1,
    pageSize: 1,
    total: items.length,
    totalPages: items.length > 0 ? 1 : 0,
  };
}

function doctorReport(
  projectId: string,
  failed = 0,
): ProjectDiagnosticReport {
  return {
    projectId,
    generatedAt: '2026-09-05T11:58:00.000Z',
    overallStatus: failed > 0 ? 'blocked' : 'healthy',
    summary: { passed: 2, warnings: 0, failed, skipped: 0 },
    checks: [],
  };
}

test('agrega múltiplos projetos, prioriza severidade e preserva falha parcial', async () => {
  const alpha = project('p1', 'Alpha');
  const beta = project('p2', 'Beta');
  const disabled = project('p3', 'Disabled', false);

  const production: ProductionOverview = {
    generatedAt: '2026-09-05T11:59:00.000Z',
    items: [
      {
        projectId: beta.id,
        projectName: beta.name,
        state: 'recovery-required',
        health: 'unknown',
        deploymentId: 'd1',
      },
      {
        projectId: disabled.id,
        projectName: disabled.name,
        state: 'failed',
        health: 'unknown',
      },
    ],
  };

  const service = new AttentionCenterService({
    now: () => NOW,
    processReader: {
      async listProcesses() {
        return [
          {
            id: 'server:p1',
            projectId: alpha.id,
            kind: 'server',
            status: 'failed',
            stoppedAt: '2026-09-05T11:55:00.000Z',
          },
          {
            id: 'server:p2',
            projectId: beta.id,
            kind: 'server',
            status: 'stopped',
            exitCode: 0,
          },
          {
            id: 'server:p3',
            projectId: disabled.id,
            kind: 'server',
            status: 'failed',
          },
        ];
      },
    },
    productionReader: { async read() { return production; } },
    gitReader: {
      async getOverview(projectPath) {
        if (projectPath.endsWith('/p2')) throw new Error('git indisponível');
        return gitOverview({
          clean: false,
          behind: 1,
          files: [
            {
              path: 'src/index.ts',
              indexStatus: ' ',
              worktreeStatus: 'M',
              status: 'modified',
            },
          ],
        });
      },
    },
    testHistoryReader: {
      async history(projectId) {
        if (projectId !== alpha.id) return testHistory();
        return testHistory([
          {
            id: 't1',
            projectId,
            commandId: 'test',
            status: 'stopped',
            exitCode: 1,
            startedAt: '2026-09-05T11:50:00.000Z',
            finishedAt: '2026-09-05T11:51:00.000Z',
          },
        ]);
      },
    },
    doctorReader: {
      async getReport(target) {
        return doctorReport(target.id, target.id === beta.id ? 1 : 0);
      },
    },
  });

  const result = await service.read('w1', [alpha, beta, disabled]);

  assert.equal(result.workspaceId, 'w1');
  assert.equal(result.generatedAt, '2026-09-05T12:00:00.000Z');
  assert.equal(result.partial, true);
  assert.deepEqual(result.unavailableSources, [
    { category: 'git', projectId: beta.id },
  ]);
  assert.deepEqual(
    result.items.map((item) => [item.projectId, item.category, item.severity]),
    [
      ['p1', 'process', 'critical'],
      ['p1', 'test', 'critical'],
      ['p2', 'doctor', 'critical'],
      ['p2', 'production', 'critical'],
      ['p1', 'git', 'warning'],
    ],
  );
  assert.equal(result.items.some((item) => item.projectId === disabled.id), false);
});

test('condições resolvidas desaparecem e parada normal não gera ruído', async () => {
  const alpha = project('p1', 'Alpha');
  const service = new AttentionCenterService({
    now: () => NOW,
    processReader: {
      async listProcesses() {
        return [
          {
            id: 'server:p1',
            projectId: alpha.id,
            kind: 'server',
            status: 'stopped',
            exitCode: 0,
          },
        ];
      },
    },
    gitReader: { async getOverview() { return gitOverview(); } },
    testHistoryReader: {
      async history() {
        return testHistory([
          {
            id: 'ok',
            projectId: alpha.id,
            commandId: 'test',
            status: 'stopped',
            exitCode: 0,
            startedAt: '2026-09-05T11:00:00.000Z',
            finishedAt: '2026-09-05T11:01:00.000Z',
          },
        ]);
      },
    },
    doctorReader: { async getReport() { return doctorReport(alpha.id); } },
    productionReader: {
      async read() {
        return {
          generatedAt: '2026-09-05T12:00:00.000Z',
          items: [
            {
              projectId: alpha.id,
              projectName: alpha.name,
              state: 'in-sync',
              health: 'verified',
            },
          ],
        };
      },
    },
  });

  const result = await service.read('w1', [alpha]);
  assert.equal(result.partial, false);
  assert.deepEqual(result.unavailableSources, []);
  assert.deepEqual(result.items, []);
});

test('git divergente é crítico por regra explícita', async () => {
  const alpha = project('p1', 'Alpha');
  const service = new AttentionCenterService({
    now: () => NOW,
    processReader: { async listProcesses() { return []; } },
    gitReader: {
      async getOverview() {
        return gitOverview({ ahead: 2, behind: 3 });
      },
    },
    testHistoryReader: { async history() { return testHistory(); } },
    doctorReader: { async getReport() { return doctorReport(alpha.id); } },
    productionReader: {
      async read() {
        return { generatedAt: '2026-09-05T12:00:00.000Z', items: [] };
      },
    },
  });

  const result = await service.read('w1', [alpha]);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.category, 'git');
  assert.equal(result.items[0]?.severity, 'critical');
  assert.match(result.items[0]?.message ?? '', /2 à frente, 3 atrás/);
});
