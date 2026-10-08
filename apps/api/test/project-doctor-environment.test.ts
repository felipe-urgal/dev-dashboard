import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ExecutionContext, Project } from '@dev-dashboard/contracts';

import { ProjectDoctorService } from '../src/services/project-doctor-service.js';

test('Project Doctor isola cache, runtime, refresh e informações de ambiente', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'doctor-environment-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'node_modules'));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'doctor-environment',
      engines: { node: '>=999' },
      packageManager: 'npm@11.4.2',
    }),
  );
  await writeFile(path.join(root, 'package-lock.json'), '{}\n');
  await writeFile(path.join(root, '.env.example'), 'PUBLIC_URL=\n');
  await writeFile(
    path.join(root, '.env'),
    'PUBLIC_URL=https://secret.example\nTOKEN=private-value\n',
  );

  const project: Project = {
    id: 'p1',
    name: 'doctor-environment',
    path: root,
    type: 'node',
    source: 'workspace',
    workspaceId: 'w1',
    enabled: true,
    capabilities: ['server'],
  };
  const host: ExecutionContext = {
    projectId: 'p1',
    environmentInstanceId: 'environment:primary:p1',
    cwd: root,
    runtime: 'host',
  };
  const container: ExecutionContext = {
    projectId: 'p1',
    environmentInstanceId: 'environment:worktree:p1:one',
    cwd: root,
    runtime: 'devcontainer',
    runtimeId: 'a'.repeat(64),
  };
  let now = Date.parse('2026-10-08T12:00:00Z');
  const calls: string[] = [];
  const service = new ProjectDoctorService({
    now: () => now,
    cacheTtlMs: 60_000,
    commandRunner: async (command, args) => {
      calls.push(`${command} ${args.join(' ')}`);
      if (command === 'npm') return { stdout: '11.4.2\n', stderr: '' };
      if (command === 'devcontainer') {
        const binary = args[args.length - 2];
        if (binary === 'node') return { stdout: 'v999.0.0\n', stderr: '' };
        if (binary === 'npm') return { stdout: '11.4.2\n', stderr: '' };
      }
      throw new Error('Comando não esperado');
    },
  });

  const hostReport = await service.getReport(project, {
    executionContext: host,
  });
  const containerReport = await service.getReport(project, {
    executionContext: container,
  });
  assert.equal(
    hostReport.checks.find((check) => check.id === 'node-runtime')?.status,
    'failed',
  );
  assert.equal(
    containerReport.checks.find((check) => check.id === 'node-runtime')?.status,
    'passed',
  );
  assert.equal(
    hostReport.checks.find((check) => check.id === 'node-dependencies')?.status,
    'passed',
  );
  assert.equal(
    containerReport.checks.find((check) => check.id === 'node-dependencies')
      ?.status,
    'skipped',
  );
  assert.equal(containerReport.overallStatus, 'healthy');
  assert.ok(
    calls.some((call) => call.startsWith('devcontainer exec --container-id ')),
  );
  assert.doesNotMatch(
    JSON.stringify(containerReport),
    /secret\.example|private-value/,
  );

  const previousCalls = calls.length;
  now += 1_000;
  assert.equal(
    await service.getReport(project, { executionContext: host }),
    hostReport,
  );
  assert.equal(
    await service.getReport(project, { executionContext: container }),
    containerReport,
  );
  assert.equal(calls.length, previousCalls);

  const refreshed = await service.getReport(project, {
    executionContext: container,
    refresh: true,
  });
  assert.notEqual(refreshed.generatedAt, containerReport.generatedAt);
  assert.equal(
    await service.getReport(project, { executionContext: host }),
    hostReport,
  );
  assert.equal(
    await service.getReport(project, { executionContext: container }),
    refreshed,
  );

  const newRuntime = await service.getReport(project, {
    executionContext: { ...container, runtimeId: 'b'.repeat(64) },
  });
  assert.notEqual(newRuntime.generatedAt, containerReport.generatedAt);
  const newLifecycle = await service.getReport(project, {
    executionContext: container,
    contextRevision: 'stopped',
  });
  assert.notEqual(newLifecycle, refreshed);

  const invalid = await service.getReport(project, {
    executionContext: { ...container, runtimeId: 'invalid' },
  });
  assert.equal(
    invalid.checks.find((check) => check.id === 'node-runtime')?.status,
    'skipped',
  );
  assert.equal(
    invalid.checks.find((check) => check.id === 'node-package-manager')?.status,
    'skipped',
  );
  assert.equal(
    invalid.checks.find((check) => check.id === 'node-dependencies')?.status,
    'skipped',
  );
  assert.equal(invalid.summary.failed, 0);
  assert.equal(invalid.summary.warnings, 0);
  assert.equal(invalid.overallStatus, 'healthy');
  assert.ok(
    invalid.checks.some((check) =>
      check.summary.includes('host não foi consultada'),
    ),
  );

  service.invalidate(project.id);
  const postInvalidate = await service.getReport(project, {
    executionContext: host,
  });
  assert.notEqual(postInvalidate, hostReport);
});
