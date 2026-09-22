import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type {
  ExecutionContext,
  ManagedProcess,
  Project,
} from '@dev-dashboard/contracts';

import { RailsRuntimeService } from '../src/services/rails-runtime-service.js';

test('RailsRuntimeService detecta e inicia worker no cwd da Environment Instance', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-rails-worker-environment-'),
  );
  const primaryPath = path.join(root, 'primary');
  const worktreePath = path.join(root, 'worktree');
  await mkdir(primaryPath, { recursive: true });
  await mkdir(path.join(worktreePath, 'bin'), { recursive: true });
  await writeFile(path.join(primaryPath, 'Gemfile'), 'gem "rails"\n');
  await writeFile(path.join(worktreePath, 'Gemfile'), 'gem "rails"\n');
  await writeFile(path.join(worktreePath, 'bin', 'sidekiq'), '#!/bin/sh\n');

  context.after(() => rm(root, { recursive: true, force: true }));

  const project: Project = {
    id: 'p1',
    name: 'sample',
    path: primaryPath,
    type: 'rails',
    source: 'standalone',
    enabled: true,
    capabilities: [],
  };
  const executionContext: ExecutionContext = {
    projectId: project.id,
    environmentInstanceId: 'environment:worktree:p1:wt-1',
    cwd: worktreePath,
    runtime: 'host',
  };

  const calls: Array<{ action: string; args: unknown[] }> = [];
  const started: ManagedProcess = {
    id: 'worker-1',
    projectId: project.id,
    environmentInstanceId: executionContext.environmentInstanceId,
    kind: 'worker',
    status: 'running',
  };
  const processManager = {
    getWorkerProcess: async (...args: unknown[]) => {
      calls.push({ action: 'get', args });
      return null;
    },
    startWorker: async (...args: unknown[]) => {
      calls.push({ action: 'start', args });
      return started;
    },
    stopWorker: async (...args: unknown[]) => {
      calls.push({ action: 'stop', args });
      return { ...started, status: 'stopped' };
    },
    readWorkerLog: async (...args: unknown[]) => {
      calls.push({ action: 'read-log', args });
      return {
        projectId: project.id,
        processId: started.id,
        content: '',
        sizeBytes: 0,
        truncated: false,
        masked: false,
        redactionCount: 0,
        readAt: '2026-09-18T12:00:00.000Z',
      };
    },
    clearWorkerLog: async (...args: unknown[]) => {
      calls.push({ action: 'clear-log', args });
      return {
        projectId: project.id,
        processId: started.id,
        content: '',
        sizeBytes: 0,
        truncated: false,
        masked: false,
        redactionCount: 0,
        readAt: '2026-09-18T12:00:00.000Z',
      };
    },
  };

  const service = new RailsRuntimeService(processManager as never);

  const overview = await service.getWorkerOverview(
    project,
    'sidekiq',
    executionContext,
  );
  assert.equal(overview.detected, true);
  assert.deepEqual(calls.at(-1), {
    action: 'get',
    args: [project.id, 'worker', executionContext.environmentInstanceId],
  });

  await service.startWorker(project, 'sidekiq', executionContext);
  const startCall = calls.find((call) => call.action === 'start');
  assert.ok(startCall);
  assert.equal(startCall.args[0], project);
  assert.equal(startCall.args[1], 'worker');
  assert.deepEqual(startCall.args[2], {
    id: 'sidekiq',
    command: path.join(worktreePath, 'bin', 'sidekiq'),
    args: [],
  });
  assert.equal(startCall.args[3], executionContext);

  await service.readWorkerLog(
    project.id,
    'sidekiq',
    { maxBytes: 1024 },
    executionContext.environmentInstanceId,
  );
  assert.deepEqual(calls.at(-1), {
    action: 'read-log',
    args: [
      project.id,
      'worker',
      { maxBytes: 1024 },
      executionContext.environmentInstanceId,
    ],
  });

  await service.clearWorkerLog(
    project.id,
    'sidekiq',
    executionContext.environmentInstanceId,
  );
  assert.deepEqual(calls.at(-1), {
    action: 'clear-log',
    args: [project.id, 'worker', executionContext.environmentInstanceId],
  });
});

test('restart do Sidekiq mantém ownership na mesma Environment Instance', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-rails-worker-restart-environment-'),
  );
  const primaryPath = path.join(root, 'primary');
  const worktreePath = path.join(root, 'worktree');
  await mkdir(primaryPath, { recursive: true });
  await mkdir(path.join(worktreePath, 'bin'), { recursive: true });
  await writeFile(path.join(worktreePath, 'bin', 'sidekiq'), '#!/bin/sh\n');
  context.after(() => rm(root, { recursive: true, force: true }));

  const project: Project = {
    id: 'p1',
    name: 'sample',
    path: primaryPath,
    type: 'rails',
    source: 'standalone',
    enabled: true,
    capabilities: [],
  };
  const executionContext: ExecutionContext = {
    projectId: project.id,
    environmentInstanceId: 'environment:worktree:p1:wt-2',
    cwd: worktreePath,
    runtime: 'host',
  };

  const calls: Array<{ action: string; args: unknown[] }> = [];
  const processManager = {
    getWorkerProcess: async (...args: unknown[]) => {
      calls.push({ action: 'get', args });
      return {
        id: 'worker-1',
        projectId: project.id,
        environmentInstanceId: executionContext.environmentInstanceId,
        kind: 'worker',
        status: 'running',
      };
    },
    stopWorker: async (...args: unknown[]) => {
      calls.push({ action: 'stop', args });
      return {
        id: 'worker-1',
        projectId: project.id,
        kind: 'worker',
        status: 'stopped',
      };
    },
    startWorker: async (...args: unknown[]) => {
      calls.push({ action: 'start', args });
      return {
        id: 'worker-2',
        projectId: project.id,
        environmentInstanceId: executionContext.environmentInstanceId,
        kind: 'worker',
        status: 'running',
      };
    },
  };
  const service = new RailsRuntimeService(processManager as never);

  await service.restartWorker(project, 'sidekiq', executionContext);

  assert.deepEqual(calls[0], {
    action: 'get',
    args: [project.id, 'worker', executionContext.environmentInstanceId],
  });
  assert.deepEqual(calls[1], {
    action: 'stop',
    args: [project.id, 'worker', executionContext.environmentInstanceId],
  });
  assert.equal(calls[2]?.action, 'start');
  assert.deepEqual(calls[2]?.args[2], {
    id: 'sidekiq',
    command: path.join(worktreePath, 'bin', 'sidekiq'),
    args: [],
  });
  assert.equal(calls[2]?.args[3], executionContext);
});

test('webpack recebe variáveis de package manager resolvidas no cwd da Environment Instance', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-rails-webpack-package-env-'),
  );
  const primaryPath = path.join(root, 'primary');
  const worktreePath = path.join(root, 'worktree');
  await mkdir(primaryPath, { recursive: true });
  await mkdir(path.join(worktreePath, 'bin'), { recursive: true });
  await writeFile(path.join(primaryPath, 'Gemfile'), 'gem "rails"\n');
  await writeFile(path.join(worktreePath, 'Gemfile'), 'gem "rails"\n');
  await writeFile(
    path.join(worktreePath, 'bin', 'webpack-dev-server'),
    '#!/bin/sh\n',
  );
  context.after(() => rm(root, { recursive: true, force: true }));

  const project: Project = {
    id: 'p1',
    name: 'sample',
    path: primaryPath,
    type: 'rails',
    source: 'standalone',
    enabled: true,
    capabilities: [],
  };
  const executionContext: ExecutionContext = {
    projectId: project.id,
    environmentInstanceId: 'environment:worktree:p1:wt-webpack',
    cwd: worktreePath,
    runtime: 'host',
  };

  const calls: Array<{ action: string; args: unknown[] }> = [];
  const processManager = {
    startWorker: async (...args: unknown[]) => {
      calls.push({ action: 'start', args });
      return {
        id: 'webpack-1',
        projectId: project.id,
        environmentInstanceId: executionContext.environmentInstanceId,
        kind: 'webpack',
        status: 'running',
      };
    },
  };

  const service = new RailsRuntimeService(processManager as never, {
    resolvePackageManagerEnvironment: async (projectPath) => {
      assert.equal(projectPath, worktreePath);
      return { FONTAWESOME_TOKEN: 'token-from-shell' };
    },
  });

  await service.startWorker(project, 'webpack', executionContext);

  assert.deepEqual(calls.at(-1), {
    action: 'start',
    args: [
      project,
      'webpack',
      {
        id: 'webpack',
        command: path.join(worktreePath, 'bin', 'webpack-dev-server'),
        args: [],
        environment: {
          FONTAWESOME_TOKEN: 'token-from-shell',
        },
      },
      executionContext,
    ],
  });
});

