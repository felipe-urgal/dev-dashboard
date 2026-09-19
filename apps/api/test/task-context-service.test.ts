import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type {
  DevelopmentEnvironmentInstance,
  Project,
  ProjectGitOverview,
} from '@dev-dashboard/contracts';
import { TaskContextRepository } from '@dev-dashboard/core';

import {
  TaskContextService,
  TaskContextServiceError,
} from '../src/services/task-context-service.js';

const project: Project = {
  id: 'project-a',
  name: 'Project A',
  path: '/workspace/project-a',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: ['git'],
};

const primary: DevelopmentEnvironmentInstance = {
  id: 'environment:primary:project-a',
  projectId: 'project-a',
  source: { kind: 'primary', path: project.path },
  runtime: { kind: 'host' },
  lifecycle: 'ready',
};

const worktree: DevelopmentEnvironmentInstance = {
  id: 'environment:worktree:project-a:wt-1',
  projectId: 'project-a',
  source: {
    kind: 'worktree',
    path: '/workspace/project-a-wt',
    worktreeId: 'wt-1',
  },
  runtime: { kind: 'host' },
  lifecycle: 'ready',
};

function gitOverview(branch = 'feature/task-context'): ProjectGitOverview {
  return {
    repository: true,
    branch,
    detached: false,
    ahead: 0,
    behind: 0,
    clean: true,
    files: [],
    recentCommits: [],
  };
}

test('deriva branch e worktree do backend ao criar Task Context', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'task-context-service-'));
  const repository = new TaskContextRepository(directory);
  const requestedPaths: string[] = [];
  const service = new TaskContextService(
    { findProject: (id) => (id === project.id ? project : null) },
    {
      findById: (id) => (id === worktree.id ? worktree : null),
      findPrimaryByProjectId: (id) => (id === project.id ? primary : null),
    },
    {
      getOverview: async (projectPath) => {
        requestedPaths.push(projectPath);
        return gitOverview();
      },
    },
    repository,
  );

  const context = await service.create(project.id, {
    environmentInstanceId: worktree.id,
    issue: { repository: 'felipe-urgal/dev-dashboard', number: 599 },
    pullRequest: { repository: 'felipe-urgal/dev-dashboard', number: 780 },
  });

  assert.equal(context.branch, 'feature/task-context');
  assert.equal(context.environmentInstanceId, worktree.id);
  assert.equal(context.worktreeId, 'wt-1');
  assert.equal(context.issue?.number, 599);
  assert.equal(context.pullRequest?.number, 780);
  assert.deepEqual(requestedPaths, [worktree.source.path]);
});

test('usa a Environment Instance primária quando nenhuma é informada', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'task-context-service-'));
  const repository = new TaskContextRepository(directory);
  const service = new TaskContextService(
    { findProject: () => project },
    {
      findById: () => null,
      findPrimaryByProjectId: () => primary,
    },
    { getOverview: async () => gitOverview('main') },
    repository,
  );

  const context = await service.create(project.id);

  assert.equal(context.branch, 'main');
  assert.equal(context.environmentInstanceId, primary.id);
  assert.equal(context.worktreeId, undefined);
});

test('não aceita Environment Instance de outro projeto nem branch destacada', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'task-context-service-'));
  const repository = new TaskContextRepository(directory);
  const foreignEnvironment: DevelopmentEnvironmentInstance = {
    ...worktree,
    projectId: 'project-b',
  };

  const foreignService = new TaskContextService(
    { findProject: () => project },
    {
      findById: () => foreignEnvironment,
      findPrimaryByProjectId: () => primary,
    },
    { getOverview: async () => gitOverview() },
    repository,
  );

  await assert.rejects(
    foreignService.create(project.id, {
      environmentInstanceId: foreignEnvironment.id,
    }),
    (error) =>
      error instanceof TaskContextServiceError &&
      error.code === 'TASK_CONTEXT_ENVIRONMENT_NOT_FOUND',
  );

  const detachedService = new TaskContextService(
    { findProject: () => project },
    {
      findById: () => worktree,
      findPrimaryByProjectId: () => primary,
    },
    {
      getOverview: async () => ({
        repository: true,
        detached: true,
        ahead: 0,
        behind: 0,
        clean: true,
        files: [],
        recentCommits: [],
      }),
    },
    repository,
  );

  await assert.rejects(
    detachedService.create(project.id, {
      environmentInstanceId: worktree.id,
    }),
    (error) =>
      error instanceof TaskContextServiceError &&
      error.code === 'TASK_CONTEXT_GIT_BRANCH_UNAVAILABLE',
  );
});

test('atualiza somente referências explícitas e preserva branch/ambiente', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'task-context-service-'));
  const repository = new TaskContextRepository(directory);
  const service = new TaskContextService(
    { findProject: () => project },
    {
      findById: () => null,
      findPrimaryByProjectId: () => primary,
    },
    { getOverview: async () => gitOverview('feature/original') },
    repository,
  );
  const created = await service.create(project.id, {
    issue: { repository: 'felipe-urgal/dev-dashboard', number: 599 },
  });

  const updated = await service.updateReferences(project.id, created.id, {
    issue: null,
    pullRequest: { repository: 'felipe-urgal/dev-dashboard', number: 999 },
  });

  assert.equal(updated.branch, 'feature/original');
  assert.equal(updated.environmentInstanceId, primary.id);
  assert.equal(updated.issue, undefined);
  assert.equal(updated.pullRequest?.number, 999);

  await service.remove(project.id, created.id);
  assert.deepEqual(service.list(project.id), []);
});
