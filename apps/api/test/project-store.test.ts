import assert from 'node:assert/strict';

import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { ProjectStore } from '../src/store/project-store.js';

function project(id: string, workspaceId: string): Project {
  return {
    id,
    workspaceId,
    name: id,
    path: `/tmp/${id}`,
    type: 'node',
    source: 'workspace',
    favorite: false,
    enabled: true,
    capabilities: ['server'],
  };
}

test('keeps project scans isolated between app contexts', () => {
  const firstStore = new ProjectStore();
  const secondStore = new ProjectStore();

  firstStore.saveWorkspaceScan({
    workspaceId: 'workspace-a',
    workspacePath: '/tmp/workspace-a',
    projects: [project('project-a', 'workspace-a')],
    warnings: [],
  });

  assert.equal(firstStore.findProject('project-a')?.id, 'project-a');
  assert.equal(secondStore.findProject('project-a'), null);
  assert.deepEqual(secondStore.listWorkspaceScans(), []);
});

test('replaces the latest scan for the same workspace', () => {
  const store = new ProjectStore();

  store.saveWorkspaceScan({
    workspaceId: 'workspace-a',
    workspacePath: '/tmp/workspace-a',
    projects: [project('old-project', 'workspace-a')],
    warnings: [],
  });

  store.saveWorkspaceScan({
    workspaceId: 'workspace-a',
    workspacePath: '/tmp/workspace-a',
    projects: [project('new-project', 'workspace-a')],
    warnings: [],
  });

  assert.equal(store.findProject('old-project'), null);
  assert.equal(store.findProject('new-project')?.id, 'new-project');
});

test('updates every occurrence of a favorite shared by workspace scans', () => {
  const store = new ProjectStore();

  store.saveWorkspaceScan({
    workspaceId: 'workspace-a',
    workspacePath: '/tmp/workspace-a',
    projects: [project('shared-project', 'workspace-a')],
    warnings: [],
  });
  store.saveWorkspaceScan({
    workspaceId: 'workspace-b',
    workspacePath: '/tmp/workspace-b',
    projects: [project('shared-project', 'workspace-b')],
    warnings: [],
  });

  const updatedProject = store.setFavorite('shared-project', true);

  assert.equal(updatedProject?.favorite, true);
  assert.deepEqual(
    store.listWorkspaceScans().map((scan) => ({
      workspaceId: scan.workspaceId,
      projectWorkspaceId: scan.projects[0]?.workspaceId,
      favorite: scan.projects[0]?.favorite,
    })),
    [
      {
        workspaceId: 'workspace-a',
        projectWorkspaceId: 'workspace-a',
        favorite: true,
      },
      {
        workspaceId: 'workspace-b',
        projectWorkspaceId: 'workspace-b',
        favorite: true,
      },
    ],
  );
});

test('removes every occurrence of a project without deleting workspace scans', () => {
  const store = new ProjectStore();

  store.saveWorkspaceScan({
    workspaceId: 'workspace-a',
    workspacePath: '/tmp/workspace-a',
    projects: [
      project('shared-project', 'workspace-a'),
      project('kept-project-a', 'workspace-a'),
    ],
    warnings: [],
  });
  store.saveWorkspaceScan({
    workspaceId: 'workspace-b',
    workspacePath: '/tmp/workspace-b',
    projects: [
      project('shared-project', 'workspace-b'),
      project('kept-project-b', 'workspace-b'),
    ],
    warnings: [],
  });

  const removedProject = store.removeProject('shared-project');

  assert.equal(removedProject?.id, 'shared-project');
  assert.equal(store.findProject('shared-project'), null);
  assert.deepEqual(
    store.listWorkspaceScans().map((scan) => ({
      workspaceId: scan.workspaceId,
      projectIds: scan.projects.map((item) => item.id),
    })),
    [
      { workspaceId: 'workspace-a', projectIds: ['kept-project-a'] },
      { workspaceId: 'workspace-b', projectIds: ['kept-project-b'] },
    ],
  );
});

test('forgets a project once a rescan of its workspace no longer lists it', () => {
  const store = new ProjectStore();

  store.saveWorkspaceScan({
    workspaceId: 'workspace-a',
    workspacePath: '/tmp/workspace-a',
    projects: [project('dropped-project', 'workspace-a')],
    warnings: [],
  });
  assert.equal(store.findProject('dropped-project')?.id, 'dropped-project');

  store.saveWorkspaceScan({
    workspaceId: 'workspace-a',
    workspacePath: '/tmp/workspace-a',
    projects: [],
    warnings: [],
  });

  assert.equal(store.findProject('dropped-project'), null);
  assert.equal(store.setFavorite('dropped-project', true), null);
});

test('forgets every occurrence of a project once its workspace scan is deleted', () => {
  const store = new ProjectStore();

  store.saveWorkspaceScan({
    workspaceId: 'workspace-a',
    workspacePath: '/tmp/workspace-a',
    projects: [project('shared-project', 'workspace-a')],
    warnings: [],
  });
  store.saveWorkspaceScan({
    workspaceId: 'workspace-b',
    workspacePath: '/tmp/workspace-b',
    projects: [project('shared-project', 'workspace-b')],
    warnings: [],
  });

  store.deleteWorkspaceScan('workspace-a');

  assert.equal(store.findProject('shared-project')?.workspaceId, 'workspace-b');

  store.deleteWorkspaceScan('workspace-b');

  assert.equal(store.findProject('shared-project'), null);
  assert.equal(store.setFavorite('shared-project', true), null);
});

test('keeps tracking a project that disappears and reappears across rescans', () => {
  const store = new ProjectStore();

  store.saveWorkspaceScan({
    workspaceId: 'workspace-a',
    workspacePath: '/tmp/workspace-a',
    projects: [project('flaky-project', 'workspace-a')],
    warnings: [],
  });

  store.saveWorkspaceScan({
    workspaceId: 'workspace-a',
    workspacePath: '/tmp/workspace-a',
    projects: [],
    warnings: [],
  });
  assert.equal(store.findProject('flaky-project'), null);

  store.saveWorkspaceScan({
    workspaceId: 'workspace-a',
    workspacePath: '/tmp/workspace-a',
    projects: [project('flaky-project', 'workspace-a')],
    warnings: [],
  });

  assert.equal(store.findProject('flaky-project')?.id, 'flaky-project');
  assert.equal(store.setFavorite('flaky-project', true)?.favorite, true);
});
