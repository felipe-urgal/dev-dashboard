import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import type { Project } from '@dev-dashboard/contracts';

import { registerApiErrorHandling } from '../src/http/api-error.js';
import { gitWorktreeRoutes } from '../src/routes/git-worktrees.js';
import type {
  CreateGitWorktreeInput,
  RemoveGitWorktreeInput,
} from '../src/services/git-worktree-lifecycle-service.js';
import type {
  GitWorktreeInspection,
  GitWorktreeSnapshot,
} from '../src/services/git-worktree-observer.js';
import { ProjectStore } from '../src/store/project-store.js';

const OBSERVED_AT = '2026-09-09T19:00:00.000Z';
const MAIN_HEAD = '1111111111111111111111111111111111111111';
const LINKED_HEAD = '2222222222222222222222222222222222222222';
const CONFIRMATION_TOKEN = 'a'.repeat(64);

function project(): Project {
  return {
    id: 'project-1',
    name: 'Projeto',
    path: '/workspace/projeto',
    type: 'node',
    source: 'workspace',
    workspaceId: 'workspace-1',
    enabled: true,
    capabilities: ['git'],
  };
}

function mainWorktree(): GitWorktreeSnapshot {
  return {
    id: 'worktree-main',
    path: '/workspace/projeto',
    head: MAIN_HEAD,
    branch: 'main',
    detached: false,
    bare: false,
    kind: 'main',
    locked: false,
    prunable: false,
  };
}

function linkedWorktree(): GitWorktreeSnapshot {
  return {
    id: 'worktree-linked',
    path: '/workspace/projeto-demo',
    head: LINKED_HEAD,
    branch: 'feature/demo',
    detached: false,
    bare: false,
    kind: 'linked',
    locked: false,
    prunable: false,
  };
}

function readyInspection(includeLinked = true): GitWorktreeInspection {
  return {
    state: 'ready',
    projectId: 'project-1',
    observedAt: OBSERVED_AT,
    worktrees: includeLinked
      ? [mainWorktree(), linkedWorktree()]
      : [mainWorktree()],
  };
}

test('Worktrees HTTP lista, cria, remove e reconcilia Environment Instances sem aceitar path como autoridade', async (context) => {
  const projectStore = new ProjectStore();
  projectStore.saveWorkspaceScan({
    workspaceId: 'workspace-1',
    workspacePath: '/workspace',
    projects: [project()],
    warnings: [],
  });

  const lifecycleCalls: CreateGitWorktreeInput[] = [];
  const prepareRemovalCalls: string[] = [];
  const removalCalls: RemoveGitWorktreeInput[] = [];
  const reconciliations: Array<{
    projectId: string;
    worktreeIds: string[];
  }> = [];
  let removed = false;

  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(gitWorktreeRoutes, {
    prefix: '/api',
    projectStore,
    gitWorktreeObserver: {
      inspect: async () => readyInspection(!removed),
    },
    gitWorktreeLifecycleService: {
      create: async (_project, input) => {
        lifecycleCalls.push(input);
        return {
          state: 'created',
          path: '/workspace/projeto-demo',
          branch: 'feature/demo',
          worktree: linkedWorktree(),
        };
      },
      prepareRemoval: async (_project, worktreeId) => {
        prepareRemovalCalls.push(worktreeId);
        return {
          state: 'ready',
          worktreeId,
          environmentInstanceId:
            'environment:worktree:project-1:worktree-linked',
          path: '/workspace/projeto-demo',
          branch: 'feature/demo',
          confirmationToken: CONFIRMATION_TOKEN,
          expiresAt: '2026-09-09T19:01:00.000Z',
        };
      },
      remove: async (_project, input) => {
        removalCalls.push(input);
        removed = true;
        return {
          state: 'removed',
          worktreeId: input.worktreeId,
          environmentInstanceId:
            'environment:worktree:project-1:worktree-linked',
          path: '/workspace/projeto-demo',
          branch: 'feature/demo',
        };
      },
    },
    developmentEnvironmentInstanceStore: {
      reconcileWorktrees: (projectId, worktrees) => {
        reconciliations.push({
          projectId,
          worktreeIds: worktrees.map((worktree) => worktree.id),
        });
        return [];
      },
    },
  });
  context.after(() => app.close());

  const listed = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/worktrees',
  });
  assert.equal(listed.statusCode, 200);
  const listing = listed.json<{
    inspection: {
      state: string;
      worktrees: Array<{ id: string; environmentInstanceId?: string }>;
    };
  }>();
  assert.equal(listing.inspection.state, 'ready');
  assert.equal(
    listing.inspection.worktrees[0]?.environmentInstanceId,
    'environment:primary:project-1',
  );
  assert.equal(
    listing.inspection.worktrees[1]?.environmentInstanceId,
    'environment:worktree:project-1:worktree-linked',
  );

  const created = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/worktrees',
    payload: {
      branch: 'feature/demo',
      directoryName: 'projeto-demo',
      createBranch: true,
      path: '/tmp/fora',
    },
  });
  assert.equal(created.statusCode, 200);
  const creation = created.json<{
    result: {
      state: string;
      environmentInstanceId?: string;
      worktree?: { environmentInstanceId?: string };
    };
  }>();
  assert.equal(creation.result.state, 'created');
  assert.equal(
    creation.result.environmentInstanceId,
    'environment:worktree:project-1:worktree-linked',
  );
  assert.equal(
    creation.result.worktree?.environmentInstanceId,
    creation.result.environmentInstanceId,
  );
  assert.deepEqual(lifecycleCalls, [
    {
      branch: 'feature/demo',
      directoryName: 'projeto-demo',
      createBranch: true,
    },
  ]);

  const confirmation = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/worktrees/worktree-linked/removal/confirmations',
  });
  assert.equal(confirmation.statusCode, 200);
  assert.equal(
    confirmation.json<{ result: { confirmationToken?: string } }>().result
      .confirmationToken,
    CONFIRMATION_TOKEN,
  );
  assert.deepEqual(prepareRemovalCalls, ['worktree-linked']);

  const invalidRemoval = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/worktrees/worktree-linked/removal',
    payload: {
      confirmationToken: CONFIRMATION_TOKEN,
      path: '/tmp/fora',
    },
  });
  assert.equal(invalidRemoval.statusCode, 400);
  assert.deepEqual(removalCalls, []);

  const removal = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/worktrees/worktree-linked/removal',
    payload: { confirmationToken: CONFIRMATION_TOKEN },
  });
  assert.equal(removal.statusCode, 200);
  assert.equal(removal.json<{ result: { state: string } }>().result.state, 'removed');
  assert.deepEqual(removalCalls, [
    {
      worktreeId: 'worktree-linked',
      confirmationToken: CONFIRMATION_TOKEN,
    },
  ]);

  assert.deepEqual(reconciliations, [
    {
      projectId: 'project-1',
      worktreeIds: ['worktree-main', 'worktree-linked'],
    },
    {
      projectId: 'project-1',
      worktreeIds: ['worktree-main', 'worktree-linked'],
    },
    {
      projectId: 'project-1',
      worktreeIds: ['worktree-main', 'worktree-linked'],
    },
    {
      projectId: 'project-1',
      worktreeIds: ['worktree-main'],
    },
  ]);

  const missing = await app.inject({
    method: 'GET',
    url: '/api/projects/missing/worktrees',
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json<{ error: string }>().error, 'PROJECT_NOT_FOUND');
});

test('Worktrees HTTP não reconcilia snapshot não confiável', async (context) => {
  const projectStore = new ProjectStore();
  projectStore.saveWorkspaceScan({
    workspaceId: 'workspace-1',
    workspacePath: '/workspace',
    projects: [project()],
    warnings: [],
  });
  let reconciled = false;

  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(gitWorktreeRoutes, {
    prefix: '/api',
    projectStore,
    gitWorktreeObserver: {
      inspect: async () => ({
        state: 'invalid-output',
        projectId: 'project-1',
        observedAt: OBSERVED_AT,
        worktrees: [],
        diagnostic: 'Git retornou dados de worktree sem estrutura confiável.',
      }),
    },
    gitWorktreeLifecycleService: {
      create: async () => ({
        state: 'blocked',
        path: '/workspace',
        branch: 'feature/demo',
      }),
      prepareRemoval: async (_project, worktreeId) => ({
        state: 'blocked',
        worktreeId,
      }),
      remove: async (_project, input) => ({
        state: 'blocked',
        worktreeId: input.worktreeId,
      }),
    },
    developmentEnvironmentInstanceStore: {
      reconcileWorktrees: () => {
        reconciled = true;
        return [];
      },
    },
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/worktrees',
  });
  assert.equal(response.statusCode, 200);
  assert.equal(
    response.json<{ inspection: { state: string } }>().inspection.state,
    'invalid-output',
  );
  assert.equal(reconciled, false);
});
