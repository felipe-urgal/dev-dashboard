import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import type { Project } from '@dev-dashboard/contracts';

import { registerApiErrorHandling } from '../src/http/api-error.js';
import { gitWorktreeRoutes } from '../src/routes/git-worktrees.js';
import type { CreateGitWorktreeInput } from '../src/services/git-worktree-lifecycle-service.js';
import type {
  GitWorktreeInspection,
  GitWorktreeSnapshot,
} from '../src/services/git-worktree-observer.js';
import { ProjectStore } from '../src/store/project-store.js';

const OBSERVED_AT = '2026-09-09T19:00:00.000Z';
const MAIN_HEAD = '1111111111111111111111111111111111111111';
const LINKED_HEAD = '2222222222222222222222222222222222222222';

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

function readyInspection(): GitWorktreeInspection {
  return {
    state: 'ready',
    projectId: 'project-1',
    observedAt: OBSERVED_AT,
    worktrees: [mainWorktree(), linkedWorktree()],
  };
}

test('Worktrees HTTP lista, cria e reconcilia Environment Instances sem aceitar path como autoridade', async (context) => {
  const projectStore = new ProjectStore();
  projectStore.saveWorkspaceScan({
    workspaceId: 'workspace-1',
    workspacePath: '/workspace',
    projects: [project()],
    warnings: [],
  });

  const lifecycleCalls: CreateGitWorktreeInput[] = [];
  const reconciliations: Array<{
    projectId: string;
    worktreeIds: string[];
  }> = [];

  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(gitWorktreeRoutes, {
    prefix: '/api',
    projectStore,
    gitWorktreeObserver: {
      inspect: async () => readyInspection(),
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
  assert.deepEqual(reconciliations, [
    {
      projectId: 'project-1',
      worktreeIds: ['worktree-main', 'worktree-linked'],
    },
    {
      projectId: 'project-1',
      worktreeIds: ['worktree-main', 'worktree-linked'],
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
