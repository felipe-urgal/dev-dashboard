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

test('updates every occurrence of a project shared by workspace scans', () => {
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

  const updatedProject = store.setEnabled('shared-project', false);

  assert.equal(updatedProject?.enabled, false);
  assert.deepEqual(
    store.listWorkspaceScans().map((scan) => ({
      workspaceId: scan.workspaceId,
      projectWorkspaceId: scan.projects[0]?.workspaceId,
      enabled: scan.projects[0]?.enabled,
    })),
    [
      {
        workspaceId: 'workspace-a',
        projectWorkspaceId: 'workspace-a',
        enabled: false,
      },
      {
        workspaceId: 'workspace-b',
        projectWorkspaceId: 'workspace-b',
        enabled: false,
      },
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
  assert.equal(store.setEnabled('dropped-project', false), null);
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
  assert.equal(store.setEnabled('shared-project', false), null);
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
  assert.equal(store.setEnabled('flaky-project', false)?.enabled, false);
});
