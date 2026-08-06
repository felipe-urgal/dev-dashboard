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
  recursiveScan: false,
};

const secondWorkspace: Workspace = {
  id: 'workspace-2',
  name: 'Second workspace',
  path: '/tmp/second-workspace',
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
    updateProjectFavorite: async (_projectId, favorite) => ({
      ...project,
      favorite,
    }),
    updateWorkspaceRecursiveScan: async (
      workspaceId,
      recursiveScan,
    ) => ({
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

  assert.deepEqual(
    await store.ensureProject(project.id),
    project,
  );

  await store.scanSelectedWorkspace();

  assert.deepEqual(store.projects.value, []);
  assert.equal(await store.ensureProject(project.id), null);
});

test('dashboard store ordena favoritos primeiro e persiste a alteração', async () => {
  const otherProject: Project = {
    ...project,
    id: 'project-2',
    name: 'Alpha',
    favorite: true,
  };
  const store = createDashboardStore(
    createApi({
      fetchProjects: async () => [project, otherProject],
    }),
  );

  await store.ensureDashboardLoaded();

  assert.deepEqual(
    store.sortedProjects.value.map((item) => item.id),
    ['project-2', 'project-1'],
  );

  await store.toggleProjectFavorite(project);

  assert.equal(store.projects.value[0]?.favorite, true);
  assert.deepEqual(store.favoriteUpdatingIds.value, []);
});

test('dashboard store desfaz a alteração otimista quando a API falha', async () => {
  let rejectUpdate!: (error: Error) => void;
  const updatePromise = new Promise<Project>((_resolve, reject) => {
    rejectUpdate = reject;
  });
  const store = createDashboardStore(
    createApi({
      fetchProjects: async () => [project],
      updateProjectFavorite: async () => updatePromise,
    }),
  );

  await store.ensureDashboardLoaded();
  const update = store.toggleProjectFavorite(project);

  assert.equal(store.projects.value[0]?.favorite, true);
  assert.deepEqual(store.favoriteUpdatingIds.value, [project.id]);

  rejectUpdate(new Error('Falha ao salvar favorito'));
  await update;

  assert.equal(store.projects.value[0]?.favorite, false);
  assert.equal(store.errorMessage.value, 'Falha ao salvar favorito');
  assert.deepEqual(store.favoriteUpdatingIds.value, []);
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

test('dashboard store mantém o favorito consistente em todos os workspaces', async () => {
  const store = createDashboardStore(
    createApi({
      fetchWorkspaces: async () => [workspace, secondWorkspace],
      scanWorkspace: async (workspaceId) => {
        const targetWorkspace = workspaceId === workspace.id
          ? workspace
          : secondWorkspace;

        return {
          ...scanResult([
            {
              ...project,
              workspaceId: targetWorkspace.id,
            },
          ]),
          workspaceId: targetWorkspace.id,
          workspacePath: targetWorkspace.path,
        };
      },
    }),
  );

  await store.ensureDashboardLoaded();
  await store.switchWorkspace(secondWorkspace.id);
  await store.toggleProjectFavorite(store.projects.value[0]!);

  assert.deepEqual(
    Object.values(store.projectsByWorkspace.value).map(
      (items) => ({
        workspaceId: items[0]?.workspaceId,
        favorite: items[0]?.favorite,
      }),
    ),
    [
      {
        workspaceId: workspace.id,
        favorite: true,
      },
      {
        workspaceId: secondWorkspace.id,
        favorite: true,
      },
    ],
  );
});
