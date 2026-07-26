import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Project } from '@dev-dashboard/contracts';
import { ScriptDetectionService } from '../src/services/script-detection-service.js';
import { ScriptExecutionError, ScriptExecutionService } from '../src/services/script-execution-service.js';

async function fixture(script = 'node -e "console.log(123)"'): Promise<{ root: string; project: Project; service: ScriptExecutionService }> {
  const root = await mkdtemp(path.join(tmpdir(), 'dashboard-script-'));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { lint: script, build: script } }));
  await writeFile(path.join(root, 'package-lock.json'), '{}');
  const project = { id: 'projeto-1', workspaceId: 'workspace-1', name: 'Projeto', path: root, type: 'node', capabilities: [] } as Project;
  return { root, project, service: new ScriptExecutionService(new ScriptDetectionService(), root) };
}

test('executa item atual da allowlist sem shell e disponibiliza log', async (t) => {
  const { root, project, service } = await fixture(); t.after(() => rm(root, { recursive: true, force: true }));
  const started = await service.start(project, 'package-script:lint');
  let current = started;
  for (let attempt = 0; attempt < 50 && current.status === 'running'; attempt += 1) { await new Promise((resolve) => setTimeout(resolve, 20)); current = await service.get(project.id, started.id); }
  assert.equal(current.status, 'succeeded'); assert.match((await service.log(project.id, started.id)).content, /123/);
  assert.deepEqual(await service.latest(project.id), current);
  assert.equal(await service.latest('outro-projeto'), null);
});

test('mascara credenciais no log antes de devolvê-lo', async (t) => {
  const { root, project, service } = await fixture(
    `node -e "console.log('token=segredo-do-projeto')"`,
  );
  t.after(() => rm(root, { recursive: true, force: true }));

  const started = await service.start(project, 'package-script:lint');
  let current = started;
  for (let attempt = 0; attempt < 50 && current.status === 'running'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    current = await service.get(project.id, started.id);
  }

  const log = await service.log(project.id, started.id);
  assert.equal(log.content.includes('segredo-do-projeto'), false);
  assert.equal(log.masked, true);
  assert.ok(log.redactionCount >= 1);
});

test('exige confirmação vinculada para ação mutável', async (t) => {
  const { root, project, service } = await fixture(); t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(() => service.start(project, 'package-script:build'), (error: unknown) => error instanceof ScriptExecutionError && error.code === 'SCRIPT_CONFIRMATION_REQUIRED');
  const confirmation = await service.prepareConfirmation(project, 'package-script:build');
  const started = await service.start(project, 'package-script:build', confirmation.token);
  let current = started;
  for (let attempt = 0; attempt < 50 && current.status === 'running'; attempt += 1) { await new Promise((resolve) => setTimeout(resolve, 20)); current = await service.get(project.id, started.id); }
  assert.equal(current.status, 'succeeded');
  await assert.rejects(() => service.start(project, 'package-script:build', confirmation.token), (error: unknown) => error instanceof ScriptExecutionError && error.code === 'SCRIPT_CONFIRMATION_REQUIRED');
});

test('reserva o projeto antes da detecção assíncrona', async (t) => {
  const { root, project, service } = await fixture('node -e "setTimeout(() => {}, 200)"'); t.after(() => rm(root, { recursive: true, force: true }));
  const first = service.start(project, 'package-script:lint');
  await assert.rejects(() => service.start(project, 'package-script:lint'), (error: unknown) => error instanceof ScriptExecutionError && error.code === 'SCRIPT_ALREADY_RUNNING');
  await first;
});

test('rejeita ação manipulada e lockfiles ambíguos', async (t) => {
  const { root, project, service } = await fixture(); t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(() => service.start(project, 'package-script:nao-existe'), (error: unknown) => error instanceof ScriptExecutionError && error.code === 'SCRIPT_NOT_FOUND');
  await writeFile(path.join(root, 'yarn.lock'), '');
  await assert.rejects(() => service.start(project, 'package-script:lint'), (error: unknown) => error instanceof ScriptExecutionError && error.code === 'SCRIPT_MANAGER_AMBIGUOUS');
});

test('restaura histórico terminal, pagina e mantém logs após reinício', async (t) => {
  const { root, project, service } = await fixture(); t.after(() => rm(root, { recursive: true, force: true }));
  const started = await service.start(project, 'package-script:lint');
  let current = started;
  for (let attempt = 0; attempt < 50 && current.status === 'running'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20)); current = await service.get(project.id, started.id);
  }
  const stateFile = path.join(root, 'scripts', `${started.id}.json`);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const stored = JSON.parse(await readFile(stateFile, 'utf8')) as { execution: { status: string } };
    if (stored.execution.status !== 'running') break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const restored = new ScriptExecutionService(new ScriptDetectionService(), root);
  assert.deepEqual(await restored.get(project.id, started.id), current);
  assert.equal((await restored.history(project.id, 1, 1)).total, 1);
  assert.match((await restored.log(project.id, started.id)).content, /123/);
});

test('reconcilia execução órfã e ignora registro corrompido', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dashboard-history-')); t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'scripts'); await mkdir(directory, { recursive: true });
  const execution = { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', projectId: 'projeto-1', actionId: 'package-script:lint', actionName: 'lint', risk: 'read-only', status: 'running', startedAt: new Date().toISOString() };
  await writeFile(path.join(directory, `${execution.id}.json`), JSON.stringify({ version: 1, execution }));
  await writeFile(path.join(directory, `${execution.id}.log`), 'resultado\n');
  await writeFile(path.join(directory, 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb.json'), '{inválido');
  const service = new ScriptExecutionService(new ScriptDetectionService(), root);
  const restored = await service.get('projeto-1', execution.id);
  assert.equal(restored.status, 'failed');
  assert.ok(restored.finishedAt);
  assert.equal((await service.history('projeto-1')).total, 1);
});

test('remove por idade enquanto a API permanece ativa', async (t) => {
  const { root, project } = await fixture();
  const service = new ScriptExecutionService(new ScriptDetectionService(), root, {
    retentionMs: 100,
    sweepIntervalMs: 20,
  });
  t.after(() => { service.close(); return rm(root, { recursive: true, force: true }); });

  const started = await service.start(project, 'package-script:lint');
  let current = started;
  for (let attempt = 0; attempt < 50 && current.status === 'running'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    current = await service.get(project.id, started.id);
  }
  assert.equal(current.status, 'succeeded');

  for (let attempt = 0; attempt < 30 && (await service.history(project.id)).total > 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal((await service.history(project.id)).total, 0);
  await assert.rejects(
    () => service.get(project.id, started.id),
    (error: unknown) => error instanceof ScriptExecutionError && error.code === 'SCRIPT_EXECUTION_NOT_FOUND',
  );
});
