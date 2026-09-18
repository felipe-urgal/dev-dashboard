import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import Fastify from 'fastify';

import type {
  ExecutionContext,
  ManagedProcess,
  Project,
} from '@dev-dashboard/contracts';

import { testRelatedRoutes } from '../src/routes/test-related.js';
import { TestDetectionService } from '../src/services/test-detection-service.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd });
}

test('related/start preserva Git, detecção e processo na Environment Instance selecionada', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-related-environment-'),
  );
  const primaryPath = path.join(root, 'primary');
  const worktreePath = path.join(root, 'worktree');
  await mkdir(primaryPath, { recursive: true });
  await mkdir(path.join(worktreePath, 'src'), { recursive: true });
  await writeFile(
    path.join(worktreePath, 'package.json'),
    JSON.stringify({
      name: 'sample',
      scripts: { test: 'vitest run' },
      devDependencies: { vitest: '^1.0.0' },
    }),
  );
  await writeFile(
    path.join(worktreePath, 'src', 'app.ts'),
    'export const x = 1;\n',
  );
  await writeFile(
    path.join(worktreePath, 'src', 'app.test.ts'),
    'test("x", () => {});\n',
  );

  await git(worktreePath, ['init', '-b', 'main']);
  await git(worktreePath, ['config', 'user.email', 'test@example.com']);
  await git(worktreePath, ['config', 'user.name', 'Test']);
  await git(worktreePath, ['add', '.']);
  await git(worktreePath, ['commit', '-m', 'initial']);
  await writeFile(
    path.join(worktreePath, 'src', 'app.ts'),
    'export const x = 2;\n',
  );

  context.after(() => rm(root, { recursive: true, force: true }));

  const project: Project = {
    id: 'p1',
    name: 'sample',
    path: primaryPath,
    type: 'node',
    source: 'standalone',
    enabled: true,
    capabilities: ['tests'],
  };
  const environmentInstanceId = 'environment:worktree:p1:wt-1';
  const executionContext: ExecutionContext = {
    projectId: project.id,
    environmentInstanceId,
    cwd: worktreePath,
    runtime: 'host',
  };
  const calls: Array<{ action: string; args: unknown[] }> = [];
  const managedProcess: ManagedProcess = {
    id: 'p1:test:related',
    projectId: project.id,
    environmentInstanceId,
    kind: 'test',
    status: 'running',
    command: 'npm',
    args: ['run', 'test', '--', 'src/app.test.ts'],
    cwd: worktreePath,
  };

  const app = Fastify();
  context.after(() => app.close());

  await app.register(testRelatedRoutes, {
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
      startTest: async (...args: unknown[]) => {
        calls.push({ action: 'start', args });
        return managedProcess;
      },
    },
    testDetectionService: new TestDetectionService(),
    testExecutionHistoryService: {
      reconcile: async (...args: unknown[]) => {
        calls.push({ action: 'reconcile', args });
      },
      recordStart: async (...args: unknown[]) => {
        calls.push({ action: 'record-start', args });
      },
    },
  } as never);

  const response = await app.inject({
    method: 'POST',
    url:
      '/projects/p1/tests/node-script-test/related/start?environmentInstanceId=' +
      encodeURIComponent(environmentInstanceId),
    payload: {},
  });

  assert.equal(response.statusCode, 201);
  const startCall = calls.find((call) => call.action === 'start');
  assert.ok(startCall);
  assert.equal((startCall.args[0] as Project).path, project.path);
  assert.deepEqual(startCall.args[2], executionContext);
  assert.equal(
    (startCall.args[1] as { args: string[] }).args.includes('src/app.test.ts'),
    true,
  );
  assert.deepEqual(calls.find((call) => call.action === 'reconcile')?.args, [
    project.id,
    environmentInstanceId,
  ]);
});
