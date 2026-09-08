import assert from 'node:assert/strict';

import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import {
  DevelopmentEnvironmentInstanceStore,
  primaryEnvironmentInstanceId,
} from '../src/store/development-environment-instance-store.js';
import { ProjectStore } from '../src/store/project-store.js';

function project(id: string, path = `/tmp/${id}`): Project {
  return {
    id,
    workspaceId: 'workspace-a',
    name: id,
    path,
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
