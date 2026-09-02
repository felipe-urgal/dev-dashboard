import assert from 'node:assert/strict';
import { test, vi } from 'vitest';

import type {
  Deployment,
  DeploymentConfirmation,
  DeploymentPlan,
  DeploymentStatus,
  ProductionOverviewItem,
} from '@dev-dashboard/contracts';

import {
  executeProductionBatch,
  prepareProductionBatch,
  type ProductionBatchApi,
} from '../src/production-update-batch';

function overviewItem(
  projectId: string,
  overrides: Partial<ProductionOverviewItem> = {},
): ProductionOverviewItem {
  return {
    projectId,
    projectName: `Projeto ${projectId}`,
    state: 'drift',
    health: 'unknown',
    strategy: 'command',
    provider: 'systemd',
    branch: 'main',
    targetRevision: `revision-${projectId}`,
    ...overrides,
  };
}

function plan(projectId: string): DeploymentPlan {
  return {
    projectId,
    projectName: `Projeto ${projectId}`,
    provider: 'systemd',
    branch: 'main',
    revision: `revision-${projectId}`,
    planHash: `plan-${projectId}`,
    createdAt: '2026-09-02T10:00:00.000Z',
    steps: [],
  };
}

function confirmation(projectId: string): DeploymentConfirmation {
  return {
    token: `token-${projectId}`,
    projectId,
    revision: `revision-${projectId}`,
    planHash: `plan-${projectId}`,
    expiresAt: '2026-09-02T10:05:00.000Z',
  };
}

function deployment(
  projectId: string,
  status: DeploymentStatus,
  errorMessage?: string,
): Deployment {
  return {
    id: `deployment-${projectId}`,
    projectId,
    projectName: `Projeto ${projectId}`,
    provider: 'systemd',
    branch: 'main',
    revision: `revision-${projectId}`,
    planHash: `plan-${projectId}`,
    status,
    createdAt: '2026-09-02T10:00:00.000Z',
    timeline: [],
    ...(errorMessage ? { errorMessage } : {}),
  };
}

function api(overrides: Partial<ProductionBatchApi> = {}): ProductionBatchApi {
  return {
    fetchPlan: vi.fn(async (projectId) => plan(projectId)),
    createConfirmation: vi.fn(async (projectId) => confirmation(projectId)),
    startDeployment: vi.fn(async (projectId) =>
      deployment(projectId, 'succeeded'),
    ),
    fetchDeployment: vi.fn(async (projectId) =>
      deployment(projectId, 'succeeded'),
    ),
    ...overrides,
  };
}

test('gera todos os planos elegíveis antes de qualquer confirmação ou start', async () => {
  const events: string[] = [];
  const batchApi = api({
    fetchPlan: vi.fn(async (projectId) => {
      events.push(`plan:${projectId}`);
      return plan(projectId);
    }),
    createConfirmation: vi.fn(async (projectId) => {
      events.push(`confirm:${projectId}`);
      return confirmation(projectId);
    }),
    startDeployment: vi.fn(async (projectId) => {
      events.push(`start:${projectId}`);
      return deployment(projectId, 'succeeded');
    }),
  });

  const prepared = await prepareProductionBatch(
    [overviewItem('a'), overviewItem('b')],
    batchApi,
  );

  assert.deepEqual(events, ['plan:a', 'plan:b']);
  assert.deepEqual(
    prepared.map((item) => item.status),
    ['ready', 'ready'],
  );

  await executeProductionBatch(prepared, batchApi, {
    sleep: async () => undefined,
  });

  assert.deepEqual(events, [
    'plan:a',
    'plan:b',
    'confirm:a',
    'start:a',
    'confirm:b',
    'start:b',
  ]);
});

test('executa sequencialmente e só inicia o próximo depois do sucesso terminal', async () => {
  const events: string[] = [];
  let firstPoll = true;
  const batchApi = api({
    createConfirmation: vi.fn(async (projectId) => {
      events.push(`confirm:${projectId}`);
      return confirmation(projectId);
    }),
    startDeployment: vi.fn(async (projectId) => {
      events.push(`start:${projectId}`);
      return deployment(
        projectId,
        projectId === 'a' ? 'preparing' : 'succeeded',
      );
    }),
    fetchDeployment: vi.fn(async (projectId) => {
      const status = firstPoll ? 'deploying' : 'succeeded';
      firstPoll = false;
      events.push(`poll:${projectId}:${status}`);
      return deployment(projectId, status);
    }),
  });

  const prepared = await prepareProductionBatch(
    [overviewItem('a'), overviewItem('b')],
    batchApi,
  );
  const result = await executeProductionBatch(prepared, batchApi, {
    sleep: async () => undefined,
  });

  assert.ok(events.indexOf('start:b') > events.indexOf('poll:a:succeeded'));
  assert.deepEqual(
    result.map((item) => item.status),
    ['succeeded', 'succeeded'],
  );
});

test('para na primeira falha terminal e deixa os demais como não iniciados', async () => {
  const start = vi.fn(async (projectId: string) =>
    deployment(
      projectId,
      projectId === 'a' ? 'failed' : 'succeeded',
      projectId === 'a' ? 'Falha controlada' : undefined,
    ),
  );
  const batchApi = api({ startDeployment: start });

  const prepared = await prepareProductionBatch(
    [overviewItem('a'), overviewItem('b'), overviewItem('c')],
    batchApi,
  );
  const result = await executeProductionBatch(prepared, batchApi, {
    sleep: async () => undefined,
  });

  assert.equal(start.mock.calls.length, 1);
  assert.equal(start.mock.calls[0]?.[0], 'a');
  assert.deepEqual(
    result.map((item) => item.status),
    ['failed', 'not-started', 'not-started'],
  );
  assert.equal(result[0]?.message, 'Falha controlada');
});

test('ignora self-production disabled e mantém falha de planning isolada', async () => {
  const fetchPlan = vi.fn(async (projectId: string) => {
    if (projectId === 'broken') throw new Error('Plano indisponível');
    return plan(projectId);
  });
  const batchApi = api({ fetchPlan });

  const prepared = await prepareProductionBatch(
    [
      overviewItem('self', { strategy: 'disabled' }),
      overviewItem('broken'),
      overviewItem('ready'),
      overviewItem('synced', { state: 'in-sync' }),
    ],
    batchApi,
  );

  assert.deepEqual(
    prepared.map((item) => [item.projectId, item.status]),
    [
      ['broken', 'skipped'],
      ['ready', 'ready'],
    ],
  );
  assert.equal(prepared[0]?.message, 'Plano indisponível');
  assert.deepEqual(
    fetchPlan.mock.calls.map(([projectId]) => projectId),
    ['broken', 'ready'],
  );
});
