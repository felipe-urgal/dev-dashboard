import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type {
  DevelopmentEnvironmentInstance,
  GitOpenPullRequest,
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
      findById: (id) => (id === primary.id ? primary : null),
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
      findById: (id) => (id === primary.id ? primary : null),
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

test('hidrata evidência Git somente quando a branch observada corresponde ao contexto', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'task-context-evidence-'),
  );
  const repository = new TaskContextRepository(directory);
  const service = new TaskContextService(
    { findProject: () => project },
    {
      findById: (id) => (id === worktree.id ? worktree : null),
      findPrimaryByProjectId: () => primary,
    },
    {
      getOverview: async () => ({
        ...gitOverview('feature/task-context'),
        latestCommit: {
          hash: 'abc123',
          shortHash: 'abc123',
          subject: 'Task context',
          authorName: 'Dev',
          authorEmail: 'dev@example.com',
          authoredAt: '2026-09-19T10:00:00.000Z',
        },
      }),
    },
    repository,
    () => new Date('2026-09-19T10:10:00.000Z'),
  );
  const context = await service.create(project.id, {
    environmentInstanceId: worktree.id,
  });

  const snapshot = await service.snapshot(project.id, context.id);

  assert.equal(snapshot.evidence?.observedAt, '2026-09-19T10:10:00.000Z');
  assert.equal(snapshot.evidence?.currentBranch, 'feature/task-context');
  assert.equal(snapshot.evidence?.branchMatches, true);
  assert.equal(snapshot.evidence?.headSha, 'abc123');
});

test('não associa HEAD de outra branch ao Task Context', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'task-context-evidence-'),
  );
  const repository = new TaskContextRepository(directory);
  let branch = 'feature/original';
  const service = new TaskContextService(
    { findProject: () => project },
    {
      findById: (id) => (id === primary.id ? primary : null),
      findPrimaryByProjectId: () => primary,
    },
    {
      getOverview: async () => ({
        ...gitOverview(branch),
        latestCommit: {
          hash: 'def456',
          shortHash: 'def456',
          subject: 'Other branch',
          authorName: 'Dev',
          authorEmail: 'dev@example.com',
          authoredAt: '2026-09-19T10:00:00.000Z',
        },
      }),
    },
    repository,
  );
  const context = await service.create(project.id);
  branch = 'feature/other';

  const snapshot = await service.snapshot(project.id, context.id);

  assert.equal(snapshot.context.branch, 'feature/original');
  assert.equal(snapshot.evidence?.currentBranch, 'feature/other');
  assert.equal(snapshot.evidence?.branchMatches, false);
  assert.equal(snapshot.evidence?.headSha, undefined);
});

test('degrada evidência Git sem perder o contexto quando a leitura falha', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'task-context-evidence-'),
  );
  const repository = new TaskContextRepository(directory);
  let fail = false;
  const service = new TaskContextService(
    { findProject: () => project },
    {
      findById: (id) => (id === primary.id ? primary : null),
      findPrimaryByProjectId: () => primary,
    },
    {
      getOverview: async () => {
        if (fail) throw new Error('git unavailable');
        return gitOverview('main');
      },
    },
    repository,
    () => new Date('2026-09-19T10:11:00.000Z'),
  );
  const context = await service.create(project.id);
  fail = true;

  const snapshot = await service.snapshot(project.id, context.id);

  assert.equal(snapshot.context.id, context.id);
  assert.deepEqual(snapshot.evidence, {
    observedAt: '2026-09-19T10:11:00.000Z',
  });
});

test('reutiliza Cockpit do PR explícito e anexa Readiness apenas no ambiente primário', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'task-context-remote-evidence-'),
  );
  const repository = new TaskContextRepository(directory);
  const pullRequest: GitOpenPullRequest = {
    provider: 'github',
    number: 900,
    title: 'Task Context',
    url: 'https://github.com/felipe-urgal/dev-dashboard/pull/900',
    sourceBranch: 'feature/task-context',
    baseBranch: 'main',
  };
  let enrichCalls = 0;
  let readinessCalls = 0;
  const service = new TaskContextService(
    { findProject: () => project },
    {
      findById: (id) => (id === primary.id ? primary : null),
      findPrimaryByProjectId: () => primary,
    },
    {
      getOverview: async () => ({
        ...gitOverview('feature/task-context'),
        latestCommit: {
          hash: 'abc900',
          shortHash: 'abc900',
          subject: 'Task Context',
          authorName: 'Dev',
          authorEmail: 'dev@example.com',
          authoredAt: '2026-09-19T11:00:00.000Z',
        },
      }),
    },
    repository,
    () => new Date('2026-09-19T11:05:00.000Z'),
    {
      pullRequestLookup: {
        findOpenPullRequest: async () => ({
          checked: true,
          existing: pullRequest,
        }),
      },
      pullRequestStatus: {
        enrich: async (_projectPath, candidate) => {
          enrichCalls += 1;
          return {
            ...candidate,
            ciStatus: 'success',
            cockpit: {
              remoteStatus: 'available',
              headSha: 'abc900',
              reviewState: 'approved',
              requestedReviewers: [],
              checks: [{ name: 'CI', status: 'success' }],
            },
          };
        },
      },
      readiness: {
        getSnapshot: async () => {
          readinessCalls += 1;
          return {
            state: 'warning',
            generatedAt: '2026-09-19T11:04:00.000Z',
          };
        },
      },
    },
  );
  const context = await service.create(project.id, {
    pullRequest: {
      repository: 'felipe-urgal/dev-dashboard',
      number: 900,
    },
  });

  const snapshot = await service.snapshot(project.id, context.id);

  assert.equal(enrichCalls, 1);
  assert.equal(readinessCalls, 1);
  assert.equal(snapshot.evidence?.pullRequest?.number, 900);
  assert.equal(
    snapshot.evidence?.pullRequest?.cockpit?.remoteStatus,
    'available',
  );
  assert.equal(
    snapshot.evidence?.pullRequest?.cockpit?.reviewState,
    'approved',
  );
  assert.equal(
    snapshot.evidence?.pullRequestObservedAt,
    '2026-09-19T11:05:00.000Z',
  );
  assert.deepEqual(snapshot.evidence?.readiness, {
    status: 'warning',
    observedAt: '2026-09-19T11:04:00.000Z',
  });
});

test('não anexa Cockpit de outro PR e falha remota não remove evidência local', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'task-context-remote-evidence-'),
  );
  const repository = new TaskContextRepository(directory);
  let lookupShouldFail = false;
  let enrichCalls = 0;
  const service = new TaskContextService(
    { findProject: () => project },
    {
      findById: (id) => (id === primary.id ? primary : null),
      findPrimaryByProjectId: () => primary,
    },
    {
      getOverview: async () => ({
        ...gitOverview('feature/task-context'),
        latestCommit: {
          hash: 'local-head',
          shortHash: 'local',
          subject: 'Local head',
          authorName: 'Dev',
          authorEmail: 'dev@example.com',
          authoredAt: '2026-09-19T11:00:00.000Z',
        },
      }),
    },
    repository,
    () => new Date('2026-09-19T11:10:00.000Z'),
    {
      pullRequestLookup: {
        findOpenPullRequest: async () => {
          if (lookupShouldFail) throw new Error('rate limited');
          return {
            checked: true,
            existing: {
              provider: 'github',
              number: 901,
              title: 'Outro PR',
              url: 'https://github.com/felipe-urgal/dev-dashboard/pull/901',
              sourceBranch: 'feature/task-context',
              baseBranch: 'main',
            },
          };
        },
      },
      pullRequestStatus: {
        enrich: async (_projectPath, candidate) => {
          enrichCalls += 1;
          return candidate;
        },
      },
      readiness: {
        getSnapshot: async () => ({
          state: 'pass',
          generatedAt: '2026-09-19T11:09:00.000Z',
        }),
      },
    },
  );
  const context = await service.create(project.id, {
    pullRequest: {
      repository: 'felipe-urgal/dev-dashboard',
      number: 900,
    },
  });

  const mismatched = await service.snapshot(project.id, context.id);
  assert.equal(enrichCalls, 0);
  assert.equal(mismatched.evidence?.pullRequest, undefined);
  assert.equal(mismatched.evidence?.headSha, 'local-head');

  lookupShouldFail = true;
  const degraded = await service.snapshot(project.id, context.id);
  assert.equal(degraded.evidence?.pullRequest, undefined);
  assert.equal(degraded.evidence?.headSha, 'local-head');
  assert.equal(degraded.evidence?.readiness?.status, 'pass');
});

test('não atribui Readiness do checkout primário a Task Context de worktree', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'task-context-worktree-readiness-'),
  );
  const repository = new TaskContextRepository(directory);
  let readinessCalls = 0;
  const service = new TaskContextService(
    { findProject: () => project },
    {
      findById: (id) => (id === worktree.id ? worktree : null),
      findPrimaryByProjectId: () => primary,
    },
    { getOverview: async () => gitOverview('feature/task-context') },
    repository,
    () => new Date('2026-09-19T11:15:00.000Z'),
    {
      readiness: {
        getSnapshot: async () => {
          readinessCalls += 1;
          return {
            state: 'pass',
            generatedAt: '2026-09-19T11:14:00.000Z',
          };
        },
      },
    },
  );
  const context = await service.create(project.id, {
    environmentInstanceId: worktree.id,
  });

  const snapshot = await service.snapshot(project.id, context.id);

  assert.equal(readinessCalls, 0);
  assert.equal(snapshot.evidence?.readiness, undefined);
});


test('não anexa readiness quando a branch atual diverge do Task Context', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'task-context-readiness-branch-'),
  );
  const repository = new TaskContextRepository(directory);
  let branch = 'feature/context';
  let readinessReads = 0;
  const service = new TaskContextService(
    { findProject: () => project },
    {
      findById: (id) => (id === primary.id ? primary : null),
      findPrimaryByProjectId: () => primary,
    },
    {
      getOverview: async () => gitOverview(branch),
    },
    repository,
    () => new Date('2026-09-19T13:00:00.000Z'),
    {
      readiness: {
        getSnapshot: async () => {
          readinessReads += 1;
          return {
            state: 'pass',
            generatedAt: '2026-09-19T13:00:00.000Z',
          };
        },
      },
    },
  );
  const context = await service.create(project.id);
  branch = 'feature/other';

  const snapshot = await service.snapshot(project.id, context.id);

  assert.equal(snapshot.evidence?.branchMatches, false);
  assert.equal(snapshot.evidence?.readiness, undefined);
  assert.equal(readinessReads, 0);
});
