import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

const TOKEN = 'r'.repeat(64);

interface OverviewResponse { tests: { commands: Array<{ id: string; supportsFileTarget: boolean }> } }
interface FilesResponse { files: Array<{ path: string }> }
interface ProcessResponse { process: { command: string; args: string[] } }
interface ErrorResponse { error?: string; message?: string }
interface HistoryResponse {
  history: {
    items: Array<{ commandId: string; targetFile?: string; status: string }>;
    total: number;
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

test('rotas de arquivo específico de teste', async (context) => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-test-file-routes-'));
  const projectPath = path.join(fixtureRoot, 'sample');
  await mkdir(path.join(projectPath, 'src'), { recursive: true });
  await writeFile(
    path.join(projectPath, 'package.json'),
    JSON.stringify({ name: 'sample', scripts: { test: 'vitest run' }, devDependencies: { vitest: '^1.0.0' } }),
  );
  await writeFile(path.join(projectPath, 'src', 'app.test.ts'), '');

  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;
  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(fixtureRoot, 'config');
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(fixtureRoot, 'state');

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');
  const appContext = createAppContext();
  const project: Project = {
    id: 'p1', name: 'sample', path: projectPath,
    type: 'node', source: 'workspace', workspaceId: 'w1', favorite: false, capabilities: ['tests'],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'w1', workspacePath: fixtureRoot, projects: [project], warnings: [],
  });

  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(async () => {
    await app.close();
    if (previousConfigDirectory === undefined) delete process.env.DEV_DASHBOARD_CONFIG_DIR;
    else process.env.DEV_DASHBOARD_CONFIG_DIR = previousConfigDirectory;
    if (previousStateDirectory === undefined) delete process.env.DEV_DASHBOARD_STATE_DIR;
    else process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = { 'x-dev-dashboard-token': TOKEN, 'content-type': 'application/json' };
  let commandId = '';

  await context.test('overview expõe supportsFileTarget e o comando esperado', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/projects/p1/tests', headers });
    assert.equal(response.statusCode, 200);
    const { tests } = response.json<OverviewResponse>();
    assert.equal(tests.commands.length, 1);
    assert.equal(tests.commands[0]!.supportsFileTarget, true);
    commandId = tests.commands[0]!.id;
  });

  await context.test('lista arquivos de teste elegíveis ignorando node_modules', async () => {
    const response = await app.inject({
      method: 'GET', url: `/api/projects/p1/tests/${commandId}/files`, headers,
    });
    assert.equal(response.statusCode, 200);
    const { files } = response.json<FilesResponse>();
    assert.deepEqual(files.map((file) => file.path), ['src/app.test.ts']);
  });

  await context.test('lista arquivos retorna 404 para comando desconhecido', async () => {
    const response = await app.inject({
      method: 'GET', url: '/api/projects/p1/tests/does-not-exist/files', headers,
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json<ErrorResponse>().error, 'TEST_COMMAND_NOT_FOUND');
  });

  await context.test('inicia a execução de um arquivo específico', async () => {
    const response = await app.inject({
      method: 'POST', url: `/api/projects/p1/tests/${commandId}/files/start`, headers,
      payload: JSON.stringify({ path: 'src/app.test.ts' }),
    });
    assert.equal(response.statusCode, 201);
    const { process: managedProcess } = response.json<ProcessResponse>();
    assert.equal(managedProcess.command, 'npm');
    assert.deepEqual(managedProcess.args, ['run', 'test', '--', 'src/app.test.ts']);
    await app.inject({ method: 'POST', url: '/api/projects/p1/tests/process/stop', headers });
  });

  await context.test('rejeita caminho fora do projeto com 404 TEST_FILE_NOT_FOUND', async () => {
    const response = await app.inject({
      method: 'POST', url: `/api/projects/p1/tests/${commandId}/files/start`, headers,
      payload: JSON.stringify({ path: '../outside.test.ts' }),
    });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json<ErrorResponse>().error, 'TEST_FILE_NOT_FOUND');
  });

  await context.test('rota exige autenticação', async () => {
    const response = await app.inject({
      method: 'GET', url: `/api/projects/p1/tests/${commandId}/files`,
    });
    assert.equal(response.statusCode, 401);
  });

  await context.test('histórico registra a execução do arquivo e sobrevive à reconciliação', async () => {
    let history: HistoryResponse['history'] | undefined;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await app.inject({ method: 'GET', url: '/api/projects/p1/tests/history', headers });
      assert.equal(response.statusCode, 200);
      history = response.json<HistoryResponse>().history;
      if (history.items[0]?.status !== 'running' && history.items[0]?.status !== 'starting') break;
      await sleep(100);
    }
    assert.ok(history);
    assert.equal(history!.total, 1);
    assert.equal(history!.items[0]!.commandId, commandId);
    assert.equal(history!.items[0]!.targetFile, 'src/app.test.ts');
    assert.ok(['stopped', 'failed'].includes(history!.items[0]!.status));
  });
});
