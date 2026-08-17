import assert from 'node:assert/strict';
import { test } from 'vitest';

import type {
  ManagedProcess,
  Project,
  Workspace,
} from '@dev-dashboard/contracts';

import { ApiRequestError } from '../src/api.js';
import {
  createDashboardStore,
  type DashboardApi,
} from '../src/stores/dashboard.js';

const workspace: Workspace = {
  id: 'workspace-1',
  name: 'Workspace',
  path: '/tmp/workspace',
  enabled: true,
  recursiveScan: false,
};

const project: Project = {
  id: 'project-1',
  workspaceId: workspace.id,
  name: 'Project',
  path: '/tmp/workspace/project',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: ['server'],
};

function scanResult(projects: Project[]) {
  return {
    workspaceId: workspace.id,
    workspacePath: workspace.path,
    projects,
    warnings: [],
    scannedAt: new Date().toISOString(),
  };
}

function createApi(overrides: Partial<DashboardApi> = {}): DashboardApi {
  return {
    createWorkspace: async () => workspace,
    deleteWorkspace: async () => undefined,
    fetchHealth: async () => ({
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
    }),
    fetchManagedProcesses: async () => [],
    fetchProject: async () => project,
    fetchProjects: async () => [],
    fetchWorkspaces: async () => [],
    scanWorkspace: async () => scanResult([]),
    updateProjectEnabled: async (_projectId, enabled) => ({
      ...project,
      enabled,
    }),
    updateWorkspaceRecursiveScan: async (workspaceId, recursiveScan) => ({
      ...workspace,
      id: workspaceId,
      recursiveScan,
    }),
    ...overrides,
  };
}

test('dashboard store retries after an initial API failure', async () => {
  let healthCalls = 0;

  const store = createDashboardStore(
    createApi({
      fetchHealth: async () => {
        healthCalls += 1;

        if (healthCalls === 1) {
          throw new Error('API indisponível');
        }

        return {
          status: 'ok',
          service: 'api',
          timestamp: new Date().toISOString(),
        };
      },
    }),
  );

  await store.ensureDashboardLoaded();

  assert.equal(store.apiConnected.value, false);
  assert.equal(store.errorMessage.value, 'API indisponível');

  await store.ensureDashboardLoaded();

  assert.equal(healthCalls, 2);
  assert.equal(store.apiConnected.value, true);
});

test('dashboard store evicts projects removed by a rescan', async () => {
  let scanCalls = 0;

  const store = createDashboardStore(
    createApi({
      fetchWorkspaces: async () => [workspace],
      fetchProject: async () => {
        throw new ApiRequestError({
          status: 404,
          code: 'PROJECT_NOT_FOUND',
          message: 'Projeto não encontrado.',
        });
      },
      scanWorkspace: async () => {
        scanCalls += 1;
        return scanResult(scanCalls === 1 ? [project] : []);
      },
    }),
  );

  await store.ensureDashboardLoaded();

  assert.deepEqual(await store.ensureProject(project.id), project);

  await store.scanSelectedWorkspace();

  assert.deepEqual(store.projects.value, []);
  assert.equal(await store.ensureProject(project.id), null);
});

test('dashboard store alterna recursiveScan de um workspace e persiste a alteração', async () => {
  const store = createDashboardStore(
    createApi({
      fetchWorkspaces: async () => [workspace],
    }),
  );

  await store.ensureDashboardLoaded();

  assert.equal(store.workspaces.value[0]?.recursiveScan, false);

  await store.toggleWorkspaceRecursiveScan(store.workspaces.value[0]!);

  assert.equal(store.workspaces.value[0]?.recursiveScan, true);
  assert.deepEqual(store.recursiveScanUpdatingIds.value, []);
});

test('dashboard store desfaz a alteração otimista de recursiveScan quando a API falha', async () => {
  let rejectUpdate!: (error: Error) => void;
  const updatePromise = new Promise<Workspace>((_resolve, reject) => {
    rejectUpdate = reject;
  });
  const store = createDashboardStore(
    createApi({
      fetchWorkspaces: async () => [workspace],
      updateWorkspaceRecursiveScan: async () => updatePromise,
    }),
  );

  await store.ensureDashboardLoaded();
  const target = store.workspaces.value[0]!;
  const update = store.toggleWorkspaceRecursiveScan(target);

  assert.equal(store.workspaces.value[0]?.recursiveScan, true);
  assert.deepEqual(store.recursiveScanUpdatingIds.value, [target.id]);

  rejectUpdate(new Error('Falha ao salvar a preferência'));
  await update;

  assert.equal(store.workspaces.value[0]?.recursiveScan, false);
  assert.equal(store.errorMessage.value, 'Falha ao salvar a preferência');
  assert.deepEqual(store.recursiveScanUpdatingIds.value, []);
});

test('dashboard store carrega o resumo dos processos gerenciados', async () => {
  const processes: ManagedProcess[] = [
    {
      id: 'server-1',
      projectId: project.id,
      workspaceId: workspace.id,
      kind: 'server',
      status: 'running',
      port: 3000,
      startedAt: new Date().toISOString(),
    },
    {
      id: 'test-1',
      projectId: project.id,
      workspaceId: workspace.id,
      kind: 'test',
      status: 'failed',
      startedAt: new Date().toISOString(),
      stoppedAt: new Date().toISOString(),
    },
    {
      id: 'test-2',
      projectId: project.id,
      workspaceId: workspace.id,
      kind: 'test',
      status: 'stopped',
      startedAt: new Date().toISOString(),
      stoppedAt: new Date().toISOString(),
    },
  ];
  const store = createDashboardStore(
    createApi({
      fetchManagedProcesses: async () => processes,
    }),
  );

  await store.ensureDashboardLoaded();

  assert.deepEqual(store.processSummary.value, {
    total: 3,
    active: 1,
    stopped: 1,
    failed: 1,
  });
  assert.equal(store.processSummaryError.value, '');
});

test('dashboard store preserva o dashboard quando o resumo de processos falha', async () => {
  const store = createDashboardStore(
    createApi({
      fetchManagedProcesses: async () => {
        throw new Error('Processos indisponíveis');
      },
    }),
  );

  await store.ensureDashboardLoaded();

  assert.equal(store.projects.value.length, 0);
  assert.equal(store.errorMessage.value, '');
  assert.equal(store.processSummaryError.value, 'Processos indisponíveis');
});
