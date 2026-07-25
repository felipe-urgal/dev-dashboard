import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Project } from '@dev-dashboard/contracts';
import { ScriptDetectionService } from '../src/services/script-detection-service.js';

async function fixture(scripts: Record<string, string>): Promise<Project> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dashboard-scripts-'));
  await writeFile(path.join(directory, 'package.json'), JSON.stringify({ scripts }));
  return { id: path.basename(directory), name: 'demo', path: directory, type: 'node', source: 'standalone', favorite: false, capabilities: ['scripts'] };
}

test('cataloga scripts Node sem executar seu conteúdo', async () => {
  const project = await fixture({ test: 'touch NAO_EXECUTAR', 'db:drop': 'rm -rf /' });
  try {
    const catalog = await new ScriptDetectionService().getCatalog(project);
    assert.deepEqual(catalog.items.map((item) => item.name), ['db:drop', 'test']);
    assert.equal(catalog.items[0]?.enabled, false);
    assert.equal(await import('node:fs/promises').then(({ access }) => access(path.join(project.path, 'NAO_EXECUTAR')).then(() => true, () => false)), false);
  } finally { await rm(project.path, { recursive: true, force: true }); }
});

test('aplica filtros e paginação em ordem reproduzível', async () => {
  const project = await fixture({ lint: 'eslint .', test: 'vitest', build: 'vite build' });
  try {
    const catalog = await new ScriptDetectionService().getCatalog(project, { risk: 'read-only', page: 2, pageSize: 1 });
    assert.equal(catalog.total, 2); assert.equal(catalog.totalPages, 2); assert.equal(catalog.items[0]?.name, 'test');
  } finally { await rm(project.path, { recursive: true, force: true }); }
});

test('inclui apenas executáveis conhecidos de bin', async () => {
  const project = await fixture({});
  try {
    await mkdir(path.join(project.path, 'bin'));
    await writeFile(path.join(project.path, 'bin', 'setup'), '#!/bin/sh');
    await writeFile(path.join(project.path, 'bin', 'comando-livre'), '#!/bin/sh');
    const catalog = await new ScriptDetectionService().getCatalog(project);
    assert.equal(catalog.items.some((item) => item.name === 'bin/setup'), true);
    assert.equal(catalog.items.some((item) => item.name.includes('comando-livre')), false);
  } finally { await rm(project.path, { recursive: true, force: true }); }
});

test('encerra todo o grupo do Rails quando a listagem atinge o timeout', { timeout: 8_000, skip: process.platform === 'win32' }, async () => {
  const project = await fixture({});
  const rails = path.join(project.path, 'bin', 'rails');
  let descendantPid: number | undefined;
  try {
    project.type = 'rails';
    await mkdir(path.dirname(rails));
    await writeFile(rails, '#!/bin/sh\nsleep 30 &\necho "$!" > descendant.pid\nwait\n');
    await chmod(rails, 0o755);

    const startedAt = Date.now();
    await new ScriptDetectionService().getCatalog(project);
    assert.ok(Date.now() - startedAt < 7_000, 'a detecção deve retornar logo após o timeout');

    descendantPid = Number.parseInt(await readFile(path.join(project.path, 'descendant.pid'), 'utf8'), 10);
    const descendantState = await readFile(`/proc/${descendantPid}/stat`, 'utf8').then(
      (stat) => stat.slice(stat.lastIndexOf(') ') + 2, stat.lastIndexOf(') ') + 3),
      (error: NodeJS.ErrnoException) => error.code === 'ENOENT' ? undefined : Promise.reject(error),
    );
    assert.ok(descendantState === undefined || descendantState === 'Z', 'o descendente não pode permanecer em execução');
  } finally {
    if (descendantPid !== undefined) {
      try { process.kill(descendantPid, 'SIGKILL'); } catch { /* O grupo já foi encerrado como esperado. */ }
    }
    await rm(project.path, { recursive: true, force: true });
  }
});
