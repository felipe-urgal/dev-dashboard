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
