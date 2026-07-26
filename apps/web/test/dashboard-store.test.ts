import assert from 'node:assert/strict';
import { test } from 'vitest';

import type {
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
};

const project: Project = {
  id: 'project-1',
  workspaceId: workspace.id,
  name: 'Project',
  path: '/tmp/workspace/project',
  type: 'node',
  source: 'workspace',
  favorite: false,
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

function createApi(
  overrides: Partial<DashboardApi> = {},
): DashboardApi {
  return {
    createWorkspace: async () => workspace,
    deleteWorkspace: async () => undefined,
    fetchHealth: async () => ({
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
    }),
    fetchProject: async () => project,
    fetchProjects: async () => [],
    fetchWorkspaces: async () => [],
    scanWorkspace: async () => scanResult([]),
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

  assert.deepEqual(
    await store.ensureProject(project.id),
    project,
  );

  await store.scanSelectedWorkspace();

  assert.deepEqual(store.projects.value, []);
  assert.equal(await store.ensureProject(project.id), null);
});
