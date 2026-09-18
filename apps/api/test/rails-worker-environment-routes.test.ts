import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';

import type {
  ExecutionContext,
  ManagedProcess,
  ProcessLogSnapshot,
  Project,
  RailsWorkerOverview,
} from '@dev-dashboard/contracts';

import { registerApiErrorHandling } from '../src/http/api-error.js';
import { registerRailsWorkerRoutes } from '../src/routes/rails/worker-routes.js';

const project: Project = {
  id: 'p1',
  name: 'sample',
  path: '/tmp/primary',
  type: 'rails',
  source: 'standalone',
  enabled: true,
  capabilities: [],
};
const PRIMARY_ID = 'environment:primary:p1';
const WORKTREE_ID = 'environment:worktree:p1:wt-1';

function executionContext(environmentInstanceId: string): ExecutionContext {
  return {
    projectId: project.id,
    environmentInstanceId,
    cwd: environmentInstanceId === PRIMARY_ID ? project.path : '/tmp/worktree',
    runtime: 'host',
  };
}

test('rotas Rails worker resolvem primary por padrão e worktree explícito', async (context) => {
  const calls: Array<{ action: string; args: unknown[] }> = [];
  const worker: RailsWorkerOverview = {
    id: 'sidekiq',
    detected: true,
    process: null,
  };
  const managed: ManagedProcess = {
    id: 'worker-1',
    projectId: project.id,
    environmentInstanceId: WORKTREE_ID,
    kind: 'worker',
    status: 'running',
  };
  const log: ProcessLogSnapshot = {
    projectId: project.id,
    processId: managed.id,
    content: '',
    sizeBytes: 0,
    truncated: false,
    masked: false,
    redactionCount: 0,
    readAt: '2026-09-18T12:00:00.000Z',
  };

  const railsRuntimeService = {
    getWorkerOverview: async (...args: unknown[]) => {
      calls.push({ action: 'overview', args });
      return worker;
    },
    readWorkerLog: async (...args: unknown[]) => {
      calls.push({ action: 'read-log', args });
      return log;
    },
    clearWorkerLog: async (...args: unknown[]) => {
      calls.push({ action: 'clear-log', args });
      return log;
    },
    startWorker: async (...args: unknown[]) => {
      calls.push({ action: 'start', args });
      return managed;
    },
    stopWorker: async (...args: unknown[]) => {
      calls.push({ action: 'stop', args });
      return { ...managed, status: 'stopped' };
    },
    restartWorker: async (...args: unknown[]) => {
      calls.push({ action: 'restart', args });
      return managed;
    },
  };

  const app = Fastify();
  registerApiErrorHandling(app);
  context.after(() => app.close());

  registerRailsWorkerRoutes(app, {
    projectStore: {
      findProject: (id: string) => (id === project.id ? project : undefined),
    } as never,
    developmentEnvironmentInstanceStore: {
      resolveForProject: (
        projectId: string,
        environmentInstanceId?: string,
      ) => {
        if (projectId !== project.id) return null;
        if (
          environmentInstanceId !== undefined &&
          environmentInstanceId !== WORKTREE_ID &&
          environmentInstanceId !== PRIMARY_ID
        ) {
          return null;
        }
        return executionContext(environmentInstanceId ?? PRIMARY_ID);
      },
    } as never,
    railsRuntimeService: railsRuntimeService as never,
    railsInspectionService: {} as never,
    railsMigrationPtyService: {} as never,
  });

  const primary = await app.inject({
    method: 'GET',
    url: '/projects/p1/rails/workers/sidekiq',
  });
  assert.equal(primary.statusCode, 200);
  assert.deepEqual(calls.at(-1), {
    action: 'overview',
    args: [project, 'sidekiq', executionContext(PRIMARY_ID)],
  });

  const query = `environmentInstanceId=${encodeURIComponent(WORKTREE_ID)}`;

  const overview = await app.inject({
    method: 'GET',
    url: `/projects/p1/rails/workers/sidekiq?${query}`,
  });
  assert.equal(overview.statusCode, 200);
  assert.deepEqual(calls.at(-1), {
    action: 'overview',
    args: [project, 'sidekiq', executionContext(WORKTREE_ID)],
  });

  const readLog = await app.inject({
    method: 'GET',
    url: `/projects/p1/rails/workers/sidekiq/logs?maxBytes=1024&${query}`,
  });
  assert.equal(readLog.statusCode, 200);
  assert.deepEqual(calls.at(-1), {
    action: 'read-log',
    args: [project.id, 'sidekiq', { maxBytes: 1024 }, WORKTREE_ID],
  });

  const clearLog = await app.inject({
    method: 'DELETE',
    url: `/projects/p1/rails/workers/sidekiq/logs?${query}`,
  });
  assert.equal(clearLog.statusCode, 200);
  assert.deepEqual(calls.at(-1), {
    action: 'clear-log',
    args: [project.id, 'sidekiq', WORKTREE_ID],
  });

  const start = await app.inject({
    method: 'POST',
    url: `/projects/p1/rails/workers/sidekiq/start?${query}`,
  });
  assert.equal(start.statusCode, 201);
  assert.deepEqual(calls.at(-1), {
    action: 'start',
    args: [project, 'sidekiq', executionContext(WORKTREE_ID)],
  });

  const stop = await app.inject({
    method: 'POST',
    url: `/projects/p1/rails/workers/sidekiq/stop?${query}`,
  });
  assert.equal(stop.statusCode, 200);
  assert.deepEqual(calls.at(-1), {
    action: 'stop',
    args: [project.id, 'sidekiq', WORKTREE_ID],
  });

  const restart = await app.inject({
    method: 'POST',
    url: `/projects/p1/rails/workers/sidekiq/restart?${query}`,
  });
  assert.equal(restart.statusCode, 200);
  assert.deepEqual(calls.at(-1), {
    action: 'restart',
    args: [project, 'sidekiq', executionContext(WORKTREE_ID)],
  });

  const invalid = await app.inject({
    method: 'GET',
    url:
      '/projects/p1/rails/workers/sidekiq?environmentInstanceId=' +
      encodeURIComponent('environment:worktree:p1:missing'),
  });
  assert.equal(invalid.statusCode, 404);
  assert.equal(invalid.json().error, 'ENVIRONMENT_INSTANCE_NOT_FOUND');
});
