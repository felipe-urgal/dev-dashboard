import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { StoredProcess } from '../src/process-state.js';
import {
  listStoredProcessEntries,
  readStoredProcess,
  resolveLogFile,
  resolveProcessFile,
  type ProcessStoreContext,
  writeStoredProcess,
} from '../src/process-store.js';
import { clearManagedLog, readManagedLog } from '../src/process-logs.js';

function processState(
  projectId: string,
  environmentInstanceId: string | undefined,
  cwd: string,
): StoredProcess {
  return {
    id: environmentInstanceId
      ? `${projectId}:${environmentInstanceId}:server`
      : `${projectId}:server`,
    projectId,
    ...(environmentInstanceId ? { environmentInstanceId } : {}),
    kind: 'server',
    status: 'stopped',
    command: 'node',
    args: ['server.js'],
    cwd,
    logPath: '/tmp/process.log',
    startedAt: '2026-09-18T10:00:00.000Z',
    stoppedAt: '2026-09-18T10:01:00.000Z',
  };
}

test('estado e logs do mesmo projeto ficam isolados por Environment Instance', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-process-environments-'),
  );
  const store: ProcessStoreContext = {
    processDirectory: path.join(root, 'processes'),
    logDirectory: path.join(root, 'logs'),
  };
  await mkdir(store.logDirectory, { recursive: true });
  context.after(() => rm(root, { recursive: true, force: true }));

  const projectId = 'project-1';
  const primaryId = `environment:primary:${projectId}`;
  const worktreeId = `environment:worktree:${projectId}:wt-1`;
  const primary = processState(projectId, primaryId, '/tmp/project-primary');
  const worktree = processState(projectId, worktreeId, '/tmp/project-worktree');

  await writeStoredProcess(store, primary);
  await writeStoredProcess(store, worktree);
  await writeFile(
    resolveLogFile(store, projectId, 'server', primaryId),
    'primary\n',
  );
  await writeFile(
    resolveLogFile(store, projectId, 'server', worktreeId),
    'worktree\n',
  );

  assert.equal(
    (await readStoredProcess(store, projectId, 'server', primaryId))?.cwd,
    '/tmp/project-primary',
  );
  assert.equal(
    (await readStoredProcess(store, projectId, 'server', worktreeId))?.cwd,
    '/tmp/project-worktree',
  );

  const entries = await listStoredProcessEntries(store);
  assert.equal(entries.length, 2);

  const primaryLog = await readManagedLog(
    store,
    projectId,
    'server',
    {},
    primaryId,
  );
  const worktreeLog = await readManagedLog(
    store,
    projectId,
    'server',
    {},
    worktreeId,
  );
  assert.equal(primaryLog.content, 'primary\n');
  assert.equal(worktreeLog.content, 'worktree\n');

  await clearManagedLog(store, projectId, 'server', worktreeId);

  assert.equal(
    (await readManagedLog(store, projectId, 'server', {}, worktreeId)).content,
    '',
  );
  assert.equal(
    (await readManagedLog(store, projectId, 'server', {}, primaryId)).content,
    'primary\n',
  );
});

test('estado legado sem Environment Instance continua resolvendo como primary', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-process-legacy-environment-'),
  );
  const store: ProcessStoreContext = {
    processDirectory: path.join(root, 'processes'),
    logDirectory: path.join(root, 'logs'),
  };
  context.after(() => rm(root, { recursive: true, force: true }));

  const projectId = 'legacy-project';
  const legacy = processState(projectId, undefined, '/tmp/legacy-project');
  await writeStoredProcess(store, legacy);

  const resolved = await readStoredProcess(
    store,
    projectId,
    'server',
    `environment:primary:${projectId}`,
  );
  assert.equal(resolved?.id, legacy.id);

  const unrelated = await readStoredProcess(
    store,
    projectId,
    'server',
    `environment:worktree:${projectId}:wt-1`,
  );
  assert.equal(unrelated, null);
});

test('estado scoped inválido não faz fallback para estado legado', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-process-invalid-scoped-'),
  );
  const store: ProcessStoreContext = {
    processDirectory: path.join(root, 'processes'),
    logDirectory: path.join(root, 'logs'),
  };
  await mkdir(store.processDirectory, { recursive: true });
  context.after(() => rm(root, { recursive: true, force: true }));

  const projectId = 'invalid-scoped-project';
  const primaryId = `environment:primary:${projectId}`;
  const legacy = processState(projectId, undefined, '/tmp/legacy-project');
  await writeStoredProcess(store, legacy);
  await writeFile(
    resolveProcessFile(store, projectId, 'server', primaryId),
    '{invalid json',
  );

  const resolved = await readStoredProcess(
    store,
    projectId,
    'server',
    primaryId,
  );
  assert.equal(resolved, null);
});

test('estado legado com Environment Instance preserva state e log legados ao atualizar', async (context) => {
  const root = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-process-legacy-owned-'),
  );
  const store: ProcessStoreContext = {
    processDirectory: path.join(root, 'processes'),
    logDirectory: path.join(root, 'logs'),
  };
  await mkdir(store.processDirectory, { recursive: true });
  await mkdir(store.logDirectory, { recursive: true });
  context.after(() => rm(root, { recursive: true, force: true }));

  const projectId = 'legacy-owned-project';
  const worktreeId = `environment:worktree:${projectId}:wt-1`;
  const legacyLog = resolveLogFile(store, projectId, 'server');
  const legacy = {
    ...processState(projectId, worktreeId, '/tmp/legacy-worktree'),
    logPath: legacyLog,
  };
  await writeFile(
    resolveProcessFile(store, projectId, 'server'),
    JSON.stringify(legacy),
  );
  await writeFile(legacyLog, 'legacy owned log\n');

  const loaded = await readStoredProcess(
    store,
    projectId,
    'server',
    worktreeId,
  );
  assert.equal(loaded?.environmentInstanceId, worktreeId);
  assert.ok(loaded);

  await writeStoredProcess(store, {
    ...loaded,
    status: 'failed',
    stoppedAt: '2026-09-18T10:02:00.000Z',
  });

  await assert.rejects(
    access(resolveProcessFile(store, projectId, 'server', worktreeId)),
  );
  assert.equal(
    (await readManagedLog(store, projectId, 'server', {}, worktreeId)).content,
    'legacy owned log\n',
  );
});
