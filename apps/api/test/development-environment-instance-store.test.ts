import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import {
  DevelopmentEnvironmentInstanceStore,
  primaryEnvironmentInstanceId,
  worktreeEnvironmentInstanceId,
} from '../src/store/development-environment-instance-store.js';
import { ProjectStore } from '../src/store/project-store.js';

function project(id: string, projectPath = `/tmp/${id}`): Project {
  return {
    id,
    workspaceId: 'workspace-a',
    name: id,
    path: projectPath,
    type: 'node',
    source: 'workspace',
    enabled: true,
    capabilities: ['server'],
  };
}

function saveProjects(store: ProjectStore, projects: Project[]): void {
  store.saveWorkspaceScan({
    workspaceId: 'workspace-a',
    workspacePath: '/tmp/workspace-a',
    projects,
    warnings: [],
  });
}

test('exposes one deterministic primary host instance for every current project', () => {
  const projectStore = new ProjectStore();
  saveProjects(projectStore, [project('project-b'), project('project-a')]);

  const store = new DevelopmentEnvironmentInstanceStore(projectStore);

  assert.deepEqual(store.list(), [
    {
      id: primaryEnvironmentInstanceId('project-a'),
      projectId: 'project-a',
      source: { kind: 'primary', path: '/tmp/project-a' },
      runtime: { kind: 'host' },
      lifecycle: 'ready',
    },
    {
      id: primaryEnvironmentInstanceId('project-b'),
      projectId: 'project-b',
      source: { kind: 'primary', path: '/tmp/project-b' },
      runtime: { kind: 'host' },
      lifecycle: 'ready',
    },
  ]);
});

test('keeps primary identity stable while resolving cwd from backend project state', () => {
  const projectStore = new ProjectStore();
  saveProjects(projectStore, [project('project-a', '/tmp/old-path')]);

  const store = new DevelopmentEnvironmentInstanceStore(projectStore);
  const instanceId = primaryEnvironmentInstanceId('project-a');

  assert.deepEqual(store.resolveExecutionContext(instanceId), {
    projectId: 'project-a',
    environmentInstanceId: instanceId,
    cwd: '/tmp/old-path',
    runtime: 'host',
  });

  saveProjects(projectStore, [project('project-a', '/tmp/new-path')]);

  assert.equal(store.findById(instanceId)?.id, instanceId);
  assert.deepEqual(store.resolveExecutionContext(instanceId), {
    projectId: 'project-a',
    environmentInstanceId: instanceId,
    cwd: '/tmp/new-path',
    runtime: 'host',
  });
});

test('does not resolve arbitrary or unknown environment identities', () => {
  const projectStore = new ProjectStore();
  saveProjects(projectStore, [project('project-a')]);

  const store = new DevelopmentEnvironmentInstanceStore(projectStore);

  assert.equal(store.findById('environment:worktree:unknown'), null);
  assert.equal(
    store.resolveExecutionContext(primaryEnvironmentInstanceId('missing')),
    null,
  );
});

test('maps linked worktree to one deterministic instance and degrades it when it disappears', () => {
  const projectStore = new ProjectStore();
  saveProjects(projectStore, [project('project-a', '/workspace/project-a')]);
  const store = new DevelopmentEnvironmentInstanceStore(projectStore);
  const worktree = {
    id: 'worktree-stable-1',
    path: '/workspace/project-a-feature',
    kind: 'linked' as const,
  };
  const environmentId = worktreeEnvironmentInstanceId(
    'project-a',
    worktree.id,
  );

  const first = store.reconcileWorktrees('project-a', [
    {
      id: 'worktree-main',
      path: '/workspace/project-a',
      kind: 'main',
    },
    worktree,
  ]);

  assert.equal(
    first.filter((instance) => instance.source.kind === 'primary').length,
    1,
  );
  assert.deepEqual(store.findById(environmentId), {
    id: environmentId,
    projectId: 'project-a',
    source: {
      kind: 'worktree',
      path: worktree.path,
      worktreeId: worktree.id,
    },
    runtime: { kind: 'host' },
    lifecycle: 'ready',
  });

  store.reconcileWorktrees('project-a', []);
  assert.equal(store.findById(environmentId)?.lifecycle, 'degraded');
  assert.equal(store.resolveExecutionContext(environmentId), null);

  store.reconcileWorktrees('project-a', [worktree]);
  assert.equal(store.findById(environmentId)?.id, environmentId);
  assert.equal(store.findById(environmentId)?.lifecycle, 'ready');
  assert.equal(store.resolveExecutionContext(environmentId)?.cwd, worktree.path);
});

test('persists identity/runtime outside the project tree and reconciles restart fail-closed', () => {
  const stateDirectory = mkdtempSync(
    path.join(tmpdir(), 'dev-dashboard-environment-instance-'),
  );

  try {
    const firstProjectStore = new ProjectStore();
    saveProjects(firstProjectStore, [
      project('project-a', '/workspace/project-a'),
    ]);
    const firstStore = new DevelopmentEnvironmentInstanceStore(
      firstProjectStore,
      { stateDirectory },
    );
    const worktree = {
      id: 'worktree-stable-1',
      path: '/workspace/project-a-feature',
      kind: 'linked' as const,
    };
    const environmentId = worktreeEnvironmentInstanceId(
      'project-a',
      worktree.id,
    );

    firstStore.reconcileWorktrees('project-a', [worktree]);
    const worktreeInstance = firstStore.findById(environmentId);
    assert.ok(worktreeInstance);
    firstStore.upsert({
      ...worktreeInstance,
      runtime: { kind: 'devcontainer', runtimeId: 'runtime-1' },
      lifecycle: 'ready',
    });

    const restartedProjectStore = new ProjectStore();
    const restartedStore = new DevelopmentEnvironmentInstanceStore(
      restartedProjectStore,
      { stateDirectory },
    );

    const beforeDiscovery = restartedStore.findById(environmentId);
    assert.equal(beforeDiscovery?.id, environmentId);
    assert.deepEqual(beforeDiscovery?.runtime, {
      kind: 'devcontainer',
      runtimeId: 'runtime-1',
    });
    assert.equal(beforeDiscovery?.lifecycle, 'degraded');
    assert.equal(restartedStore.resolveExecutionContext(environmentId), null);

    saveProjects(restartedProjectStore, [
      project('project-a', '/workspace/project-a'),
    ]);
    assert.equal(
      restartedStore.findPrimaryByProjectId('project-a')?.lifecycle,
      'ready',
    );
    assert.equal(restartedStore.findById(environmentId)?.lifecycle, 'degraded');

    restartedStore.reconcileWorktrees('project-a', [worktree]);
    assert.equal(restartedStore.findById(environmentId)?.id, environmentId);
    assert.deepEqual(restartedStore.findById(environmentId)?.runtime, {
      kind: 'devcontainer',
      runtimeId: 'runtime-1',
    });
    assert.equal(restartedStore.findById(environmentId)?.lifecycle, 'degraded');
  } finally {
    rmSync(stateDirectory, { recursive: true, force: true });
  }
});
