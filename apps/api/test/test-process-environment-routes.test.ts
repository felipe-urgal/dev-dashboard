import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';

import type {
  ExecutionContext,
  ManagedProcess,
  Project,
} from '@dev-dashboard/contracts';

import { registerTestCommandRoutes } from '../src/routes/tests/command-routes.js';
import { registerTestEventsRoute } from '../src/routes/tests/events-route.js';
import { registerTestProcessRoutes } from '../src/routes/tests/process-routes.js';

const project: Project = {
  id: 'p1',
  name: 'sample',
  path: '/tmp/primary',
  type: 'node',
  source: 'standalone',
  enabled: true,
  capabilities: ['tests'],
};
const environmentInstanceId = 'environment:worktree:p1:wt-1';
const executionContext: ExecutionContext = {
  projectId: project.id,
  environmentInstanceId,
  cwd: '/tmp/worktree',
  runtime: 'host',
};

function managedProcess(status: ManagedProcess['status'] = 'running'): ManagedProcess {
  return {
    id: 'p1:worktree:test:full-suite',
    projectId: project.id,
    environmentInstanceId,
    kind: 'test',
    status,
    command: 'npm',
    args: ['test'],
    cwd: executionContext.cwd,
  };
}

function baseOptions(calls: Array<{ action: string; args: unknown[] }>) {
  return {
    projectStore: {
      findProject: (id: string) => (id === project.id ? project : undefined),
    },
    developmentEnvironmentInstanceStore: {
      resolveForProject: (
        projectId: string,
        requestedEnvironmentInstanceId?: string,
      ) =>
        projectId === project.id &&
        (requestedEnvironmentInstanceId === undefined ||
          requestedEnvironmentInstanceId === environmentInstanceId)
          ? executionContext
          : null,
    },
    processManager: {
      getTestProcess: async (...args: unknown[]) => {
        calls.push({ action: 'get', args });
        return managedProcess();
      },
      readTestLog: async (...args: unknown[]) => {
        calls.push({ action: 'read-log', args });
        return {
          projectId: project.id,
          processId: managedProcess().id,
          content: 'ok\n',
          sizeBytes: 3,
          truncated: false,
          masked: false,
          redactionCount: 0,
          readAt: '2026-09-18T14:00:00.000Z',
        };
      },
      clearTestLog: async (...args: unknown[]) => {
        calls.push({ action: 'clear-log', args });
        return {
          projectId: project.id,
          processId: managedProcess().id,
          content: '',
          sizeBytes: 0,
          truncated: false,
          masked: false,
          redactionCount: 0,
          readAt: '2026-09-18T14:00:00.000Z',
        };
      },
      stopTest: async (...args: unknown[]) => {
        calls.push({ action: 'stop', args });
        return managedProcess('stopped');
      },
      startTest: async (...args: unknown[]) => {
        calls.push({ action: 'start', args });
        return managedProcess();
      },
    },
    testDetectionService: {
      getOverview: async (scopedProject: Project) => {
        calls.push({ action: 'overview', args: [scopedProject] });
        return { supported: true, commands: [] };
      },
      invalidate: () => undefined,
      resolveCommand: async (scopedProject: Project) => {
        calls.push({ action: 'resolve-command', args: [scopedProject] });
        return { command: 'npm', args: ['test'] };
      },
    },
    testExecutionHistoryService: {
      reconcile: async (...args: unknown[]) => {
        calls.push({ action: 'reconcile', args });
      },
      recordStart: async (...args: unknown[]) => {
        calls.push({ action: 'record-start', args });
      },
      subscribe: async (...args: unknown[]) => {
        calls.push({ action: 'subscribe', args });
        return () => undefined;
      },
    },
    projectTestPtyService: {},
  };
}

test('rotas de processo de testes usam a Environment Instance selecionada', async (context) => {
  const calls: Array<{ action: string; args: unknown[] }> = [];
  const app = Fastify();
  context.after(() => app.close());
  registerTestProcessRoutes(app, baseOptions(calls) as never);

  const query = `environmentInstanceId=${encodeURIComponent(environmentInstanceId)}`;

  const overview = await app.inject({
    method: 'GET',
    url: `/projects/p1/tests?${query}`,
  });
  assert.equal(overview.statusCode, 200);
  assert.equal(
    (calls.find((call) => call.action === 'overview')?.args[0] as Project).path,
    executionContext.cwd,
  );

  const status = await app.inject({
    method: 'GET',
    url: `/projects/p1/tests/process?${query}`,
  });
  assert.equal(status.statusCode, 200);
  assert.deepEqual(calls.find((call) => call.action === 'get')?.args, [
    project.id,
    environmentInstanceId,
  ]);

  const log = await app.inject({
    method: 'GET',
    url: `/projects/p1/tests/process/logs?maxBytes=1024&${query}`,
  });
  assert.equal(log.statusCode, 200);
  assert.deepEqual(calls.find((call) => call.action === 'read-log')?.args, [
    project.id,
    { maxBytes: 1024 },
    environmentInstanceId,
  ]);

  const clear = await app.inject({
    method: 'DELETE',
    url: `/projects/p1/tests/process/logs?${query}`,
  });
  assert.equal(clear.statusCode, 200);
  assert.deepEqual(calls.find((call) => call.action === 'clear-log')?.args, [
    project.id,
    environmentInstanceId,
  ]);

  const stop = await app.inject({
    method: 'POST',
    url: `/projects/p1/tests/process/stop?${query}`,
    payload: {},
  });
  assert.equal(stop.statusCode, 200);
  assert.deepEqual(calls.find((call) => call.action === 'stop')?.args, [
    project.id,
    environmentInstanceId,
  ]);
});

test('start de suíte resolve comando no cwd da Environment Instance e preserva ownership', async (context) => {
  const calls: Array<{ action: string; args: unknown[] }> = [];
  const app = Fastify();
  context.after(() => app.close());
  registerTestCommandRoutes(app, baseOptions(calls) as never);

  const response = await app.inject({
    method: 'POST',
    url:
      '/projects/p1/tests/full-suite/start?environmentInstanceId=' +
      encodeURIComponent(environmentInstanceId),
    payload: {},
  });

  assert.equal(response.statusCode, 201);
  assert.equal(
    (calls.find((call) => call.action === 'resolve-command')?.args[0] as Project)
      .path,
    executionContext.cwd,
  );
  assert.deepEqual(calls.find((call) => call.action === 'start')?.args, [
    project,
    {
      id: 'full-suite',
      command: 'npm',
      args: ['test'],
    },
    executionContext,
  ]);
  assert.deepEqual(calls.find((call) => call.action === 'reconcile')?.args, [
    project.id,
    environmentInstanceId,
  ]);
});

test('SSE de testes assina somente a Environment Instance selecionada', async (context) => {
  const calls: Array<{ action: string; args: unknown[] }> = [];
  const app = Fastify();
  context.after(() => app.close());
  registerTestEventsRoute(app, baseOptions(calls) as never);

  const responsePromise = app.inject({
    method: 'GET',
    url:
      '/projects/p1/tests/process/events?environmentInstanceId=' +
      encodeURIComponent(environmentInstanceId),
  });

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(calls.find((call) => call.action === 'subscribe')?.args.slice(0, 1), [
    project.id,
  ]);
  const subscribeCall = calls.find((call) => call.action === 'subscribe');
  assert.equal(subscribeCall?.args[2], environmentInstanceId);

  const subscriber = subscribeCall?.args[1] as { close: () => void } | undefined;
  subscriber?.close();
  const response = await responsePromise;
  assert.equal(response.statusCode, 200);
});
