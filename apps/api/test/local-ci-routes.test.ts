import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { WebSocket } from 'ws';

import type { Project } from '@dev-dashboard/contracts';

import { registerApiErrorHandling } from '../src/http/api-error.js';
import { localCiRoutes } from '../src/routes/local-ci.js';
import type { LocalCiCatalog, LocalCiJobRequest } from '../src/services/local-ci-act.js';
import {
  LocalCiExecutionError,
  type LocalCiExecutionSnapshot,
} from '../src/services/local-ci-execution-service.js';
import { ProjectStore } from '../src/store/project-store.js';

const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/projeto',
  type: 'node',
  source: 'workspace',
  workspaceId: 'workspace-1',
  enabled: true,
  capabilities: ['git'],
};

const request: LocalCiJobRequest = {
  workflowFile: '.github/workflows/ci.yml',
  jobId: 'test',
  event: 'pull_request',
};

const catalog: LocalCiCatalog = {
  provider: 'act',
  approximation: true,
  availability: {
    state: 'available',
    actVersion: '0.2.80',
    dockerVersion: '28.0.0',
  },
  jobs: [
    {
      workflowFile: request.workflowFile,
      workflow: 'CI',
      jobId: request.jobId,
      job: 'Tests',
      events: [request.event],
    },
  ],
};

function snapshot(
  overrides: Partial<LocalCiExecutionSnapshot> = {},
): LocalCiExecutionSnapshot {
  return {
    id: 'run-1',
    projectId: project.id,
    provider: 'act',
    approximation: true,
    request,
    status: 'running',
    logs: 'buffer inicial\n',
    truncated: false,
    exitCode: null,
    exitSignal: null,
    timedOut: false,
    startedAt: '2026-09-20T12:30:00.000Z',
    endedAt: null,
    ...overrides,
  };
}

function store(): ProjectStore {
  const result = new ProjectStore();
  result.saveWorkspaceScan({
    workspaceId: 'workspace-1',
    workspacePath: '/workspace',
    projects: [project],
    warnings: [],
  });
  return result;
}

function services() {
  const starts: LocalCiJobRequest[] = [];
  const cancels: Array<{ projectId: string; runId: string }> = [];
  let onData: ((chunk: string) => void) | undefined;
  let onExit: ((run: LocalCiExecutionSnapshot) => void) | undefined;

  return {
    starts,
    cancels,
    discovery: {
      discover: async () => catalog,
    },
    execution: {
      start: async (_project: Project, body: LocalCiJobRequest) => {
        starts.push({ ...body });
        return snapshot();
      },
      get: (projectId: string, runId: string) => {
        if (projectId !== project.id || runId !== 'run-1') {
          throw new LocalCiExecutionError(
            'LOCAL_CI_NOT_FOUND',
            'Execução local não encontrada para este projeto.',
          );
        }
        return snapshot();
      },
      cancel: (projectId: string, runId: string) => {
        if (projectId !== project.id || runId !== 'run-1') {
          throw new LocalCiExecutionError(
            'LOCAL_CI_NOT_FOUND',
            'Execução local não encontrada para este projeto.',
          );
        }
        cancels.push({ projectId, runId });
        return snapshot();
      },
      reattach: (
        projectId: string,
        runId: string,
        data: (chunk: string) => void,
        exit: (run: LocalCiExecutionSnapshot) => void,
      ) => {
        if (projectId !== project.id || runId !== 'run-1') {
          throw new LocalCiExecutionError(
            'LOCAL_CI_NOT_FOUND',
            'Execução local não encontrada para este projeto.',
          );
        }
        onData = data;
        onExit = exit;
        return {
          snapshot: snapshot(),
          detach: () => undefined,
        };
      },
      shutdown: () => undefined,
    },
    emitData: (chunk: string) => onData?.(chunk),
    emitExit: () =>
      onExit?.(
        snapshot({
          status: 'exited',
          exitCode: 0,
          endedAt: '2026-09-20T12:31:00.000Z',
        }),
      ),
  };
}

test('Local CI HTTP expõe catálogo e start/status/cancel sem aceitar autoridade extra do browser', async (context) => {
  const fixture = services();
  const app = Fastify();
  await app.register(websocket);
  registerApiErrorHandling(app);
  app.register(localCiRoutes, {
    prefix: '/api',
    projectStore: store(),
    localCiDiscoveryService: fixture.discovery,
    localCiExecutionService: fixture.execution,
  });
  context.after(() => app.close());

  const catalogResponse = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/local-ci/catalog',
  });
  assert.equal(catalogResponse.statusCode, 200);
  assert.equal(catalogResponse.json().catalog.approximation, true);
  assert.equal(catalogResponse.json().catalog.jobs[0].jobId, 'test');

  const invalid = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/local-ci/runs',
    payload: {
      ...request,
      cwd: '/etc',
      executable: '/bin/sh',
      args: ['-c', 'id'],
      secrets: { GITHUB_TOKEN: 'secret' },
    },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(fixture.starts.length, 0);

  const started = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/local-ci/runs',
    payload: request,
  });
  assert.equal(started.statusCode, 201);
  assert.equal(started.json().run.id, 'run-1');
  assert.equal(started.json().run.approximation, true);
  assert.deepEqual(fixture.starts, [request]);

  const status = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/local-ci/runs/run-1',
  });
  assert.equal(status.statusCode, 200);
  assert.equal(status.json().run.logs, 'buffer inicial\n');

  const cancelled = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/local-ci/runs/run-1/cancel',
    payload: {},
  });
  assert.equal(cancelled.statusCode, 200);
  assert.deepEqual(fixture.cancels, [
    { projectId: project.id, runId: 'run-1' },
  ]);

  const missing = await app.inject({
    method: 'GET',
    url: '/api/projects/missing/local-ci/catalog',
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error, 'PROJECT_NOT_FOUND');
});

test('Local CI mapeia erros de domínio para respostas HTTP determinísticas', async (context) => {
  const fixture = services();
  fixture.execution.start = async () => {
    throw new LocalCiExecutionError(
      'LOCAL_CI_INVALID_REQUEST',
      'Workflow, job ou evento não pertence ao catálogo Local CI atual.',
    );
  };

  const app = Fastify();
  await app.register(websocket);
  registerApiErrorHandling(app);
  app.register(localCiRoutes, {
    prefix: '/api',
    projectStore: store(),
    localCiDiscoveryService: fixture.discovery,
    localCiExecutionService: fixture.execution,
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/local-ci/runs',
    payload: request,
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, 'LOCAL_CI_INVALID_REQUEST');

  const unknown = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/local-ci/runs/missing',
  });
  assert.equal(unknown.statusCode, 404);
  assert.equal(unknown.json().error, 'LOCAL_CI_NOT_FOUND');
});

test('Local CI WebSocket reanexa ao mesmo run e transmite output/exit com approximation=true', async (context) => {
  const fixture = services();
  const app = Fastify();
  await app.register(websocket);
  registerApiErrorHandling(app);
  app.register(localCiRoutes, {
    prefix: '/api',
    projectStore: store(),
    localCiDiscoveryService: fixture.discovery,
    localCiExecutionService: fixture.execution,
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  context.after(() => app.close());

  const address = app.server.address();
  assert.ok(address && typeof address === 'object');
  const socket = new WebSocket(
    `ws://127.0.0.1:${address.port}/api/projects/project-1/local-ci/runs/run-1/connect`,
  );
  context.after(() => socket.close());

  const messages: Array<Record<string, unknown>> = [];
  await new Promise<void>((resolve, reject) => {
    socket.on('error', reject);
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as Record<string, unknown>;
      messages.push(message);

      if (message.type === 'ready') {
        fixture.emitData('novo chunk\n');
        fixture.emitExit();
      }

      if (message.type === 'exit') resolve();
    });
  });

  assert.equal(messages[0]?.type, 'ready');
  assert.equal(
    (messages[0]?.run as LocalCiExecutionSnapshot).approximation,
    true,
  );
  assert.deepEqual(messages[1], { type: 'output', data: 'novo chunk\n' });
  assert.equal(messages[2]?.type, 'exit');
  assert.equal(
    (messages[2]?.run as LocalCiExecutionSnapshot).exitCode,
    0,
  );
});
