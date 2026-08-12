import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

const TOKEN = 'r'.repeat(64);

interface OverviewResponse {
  tests: {
    commands: Array<{
      id: string;
      runner: string;
      supportsFileTarget: boolean;
      supportsCaseTarget: boolean;
      supportsNamePatternTarget: boolean;
    }>;
  };
}
interface FilesResponse {
  files: Array<{ path: string }>;
}
interface ProcessResponse {
  process: { command: string; args: string[] };
}
interface ErrorResponse {
  error?: string;
  message?: string;
}
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
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-test-file-routes-'),
  );
  const projectPath = path.join(fixtureRoot, 'sample');
  await mkdir(path.join(projectPath, 'src'), { recursive: true });
  await writeFile(
    path.join(projectPath, 'package.json'),
    JSON.stringify({
      name: 'sample',
      scripts: { test: 'vitest run' },
      devDependencies: { vitest: '^1.0.0' },
    }),
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
    id: 'p1',
    name: 'sample',
    path: projectPath,
    type: 'node',
    source: 'workspace',
    workspaceId: 'w1',
    enabled: true,
    capabilities: ['tests'],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'w1',
    workspacePath: fixtureRoot,
    projects: [project],
    warnings: [],
  });

  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(async () => {
    await app.close();
    if (previousConfigDirectory === undefined)
      delete process.env.DEV_DASHBOARD_CONFIG_DIR;
    else process.env.DEV_DASHBOARD_CONFIG_DIR = previousConfigDirectory;
    if (previousStateDirectory === undefined)
      delete process.env.DEV_DASHBOARD_STATE_DIR;
    else process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };
  let commandId = '';

  await context.test(
    'overview expõe supportsFileTarget e o comando esperado',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/tests',
        headers,
      });
      assert.equal(response.statusCode, 200);
      const { tests } = response.json<OverviewResponse>();
      assert.equal(tests.commands.length, 1);
      assert.equal(tests.commands[0]!.supportsFileTarget, true);
      commandId = tests.commands[0]!.id;
    },
  );

  await context.test(
    'lista arquivos de teste elegíveis ignorando node_modules',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/p1/tests/${commandId}/files`,
        headers,
      });
      assert.equal(response.statusCode, 200);
      const { files } = response.json<FilesResponse>();
      assert.deepEqual(
        files.map((file) => file.path),
        ['src/app.test.ts'],
      );
    },
  );

  await context.test(
    'lista arquivos retorna 404 para comando desconhecido',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/tests/does-not-exist/files',
        headers,
      });
      assert.equal(response.statusCode, 404);
      assert.equal(
        response.json<ErrorResponse>().error,
        'TEST_COMMAND_NOT_FOUND',
      );
    },
  );

  await context.test('inicia a execução de um arquivo específico', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/projects/p1/tests/${commandId}/files/start`,
      headers,
      payload: JSON.stringify({ path: 'src/app.test.ts' }),
    });
    assert.equal(response.statusCode, 201);
    const { process: managedProcess } = response.json<ProcessResponse>();
    assert.equal(managedProcess.command, 'npm');
    assert.deepEqual(managedProcess.args, [
      'run',
      'test',
      '--',
      'src/app.test.ts',
    ]);
    await app.inject({
      method: 'POST',
      url: '/api/projects/p1/tests/process/stop',
      headers,
      payload: JSON.stringify({}),
    });
  });

  await context.test(
    'rejeita caminho fora do projeto com 404 TEST_FILE_NOT_FOUND',
    async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/projects/p1/tests/${commandId}/files/start`,
        headers,
        payload: JSON.stringify({ path: '../outside.test.ts' }),
      });
      assert.equal(response.statusCode, 404);
      assert.equal(response.json<ErrorResponse>().error, 'TEST_FILE_NOT_FOUND');
    },
  );

  await context.test('rota exige autenticação', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/p1/tests/${commandId}/files`,
    });
    assert.equal(response.statusCode, 401);
  });

  await context.test(
    'histórico registra a execução do arquivo e sobrevive à reconciliação',
    async () => {
      let history: HistoryResponse['history'] | undefined;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const response = await app.inject({
          method: 'GET',
          url: '/api/projects/p1/tests/history',
          headers,
        });
        assert.equal(response.statusCode, 200);
        history = response.json<HistoryResponse>().history;
        if (
          history.items[0]?.status !== 'running' &&
          history.items[0]?.status !== 'starting'
        )
          break;
        await sleep(100);
      }
      assert.ok(history);
      assert.equal(history!.total, 1);
      assert.equal(history!.items[0]!.commandId, commandId);
      assert.equal(history!.items[0]!.targetFile, 'src/app.test.ts');
      assert.ok(['stopped', 'failed'].includes(history!.items[0]!.status));
    },
  );

  await context.test(
    'DELETE tests/history remove a entrada terminal registrada',
    async () => {
      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: '/api/projects/p1/tests/history',
        headers: { 'x-dev-dashboard-token': TOKEN },
      });
      assert.equal(deleteResponse.statusCode, 200);
      assert.equal(
        deleteResponse.json<{ history: { removedCount: number } }>().history
          .removedCount,
        1,
      );

      const getResponse = await app.inject({
        method: 'GET',
        url: '/api/projects/p1/tests/history',
        headers,
      });
      assert.equal(getResponse.json<HistoryResponse>().history.total, 0);
    },
  );
});

test('rotas de caso específico de teste (RSpec)', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-test-case-routes-'),
  );
  const railsProjectPath = path.join(fixtureRoot, 'rails-sample');
  await mkdir(path.join(railsProjectPath, 'spec', 'models'), {
    recursive: true,
  });
  await writeFile(
    path.join(railsProjectPath, 'Gemfile'),
    "source 'https://rubygems.org'\ngem 'rails'\ngem 'rspec-rails'\n",
  );
  await writeFile(
    path.join(railsProjectPath, 'spec', 'models', 'user_spec.rb'),
    '',
  );

  const nodeProjectPath = path.join(fixtureRoot, 'node-sample');
  await mkdir(path.join(nodeProjectPath, 'src'), { recursive: true });
  await writeFile(
    path.join(nodeProjectPath, 'package.json'),
    JSON.stringify({
      name: 'node-sample',
      scripts: { test: 'vitest run' },
      devDependencies: { vitest: '^1.0.0' },
    }),
  );
  await writeFile(path.join(nodeProjectPath, 'src', 'app.test.ts'), '');

  const binDirectory = path.join(fixtureRoot, 'bin');
  await mkdir(binDirectory, { recursive: true });
  await writeFile(
    path.join(binDirectory, 'bundle'),
    '#!/usr/bin/env bash\nexit 0\n',
  );
  await chmod(path.join(binDirectory, 'bundle'), 0o755);

  const previousConfigDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR;
  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  const previousPath = process.env.PATH;
  process.env.DEV_DASHBOARD_CONFIG_DIR = path.join(fixtureRoot, 'config');
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(fixtureRoot, 'state');
  process.env.PATH = `${binDirectory}${path.delimiter}${previousPath ?? ''}`;

  const { buildApp } = await import('../src/app.js');
  const { createAppContext } = await import('../src/app-context.js');
  const appContext = createAppContext();
  const railsProject: Project = {
    id: 'rails-p1',
    name: 'rails-sample',
    path: railsProjectPath,
    type: 'rails',
    source: 'workspace',
    workspaceId: 'w1',
    enabled: true,
    capabilities: ['tests'],
  };
  const nodeProject: Project = {
    id: 'node-p1',
    name: 'node-sample',
    path: nodeProjectPath,
    type: 'node',
    source: 'workspace',
    workspaceId: 'w1',
    enabled: true,
    capabilities: ['tests'],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'w1',
    workspacePath: fixtureRoot,
    projects: [railsProject, nodeProject],
    warnings: [],
  });

  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(async () => {
    await app.close();
    if (previousConfigDirectory === undefined)
      delete process.env.DEV_DASHBOARD_CONFIG_DIR;
    else process.env.DEV_DASHBOARD_CONFIG_DIR = previousConfigDirectory;
    if (previousStateDirectory === undefined)
      delete process.env.DEV_DASHBOARD_STATE_DIR;
    else process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
    process.env.PATH = previousPath;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };
  let rspecCommandId = '';
  let nodeCommandId = '';

  await context.test(
    'overview expõe supportsCaseTarget para rspec',
    async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/projects/rails-p1/tests',
        headers,
      });
      assert.equal(response.statusCode, 200);
      const { tests } = response.json<OverviewResponse>();
      const rspec = tests.commands.find(
        (command) => command.runner === 'rspec',
      );
      assert.ok(rspec);
      assert.equal(rspec.supportsCaseTarget, true);
      rspecCommandId = rspec.id;

      const nodeResponse = await app.inject({
        method: 'GET',
        url: '/api/projects/node-p1/tests',
        headers,
      });
      const { tests: nodeTests } = nodeResponse.json<OverviewResponse>();
      assert.equal(nodeTests.commands[0]!.supportsCaseTarget, false);
      nodeCommandId = nodeTests.commands[0]!.id;
    },
  );

  await context.test(
    'inicia a execução de um caso específico via arquivo:linha',
    async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/projects/rails-p1/tests/${rspecCommandId}/files/start`,
        headers,
        payload: JSON.stringify({
          path: 'spec/models/user_spec.rb',
          line: 42,
        }),
      });
      assert.equal(response.statusCode, 201);
      const { process: managedProcess } = response.json<ProcessResponse>();
      assert.equal(managedProcess.args.at(-1), 'spec/models/user_spec.rb:42');
      await app.inject({
        method: 'POST',
        url: '/api/projects/rails-p1/tests/process/stop',
        headers,
        payload: JSON.stringify({}),
      });
    },
  );

  await context.test(
    'rejeita linha para runner sem suporte com 400 TEST_CASE_TARGET_UNSUPPORTED',
    async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/projects/node-p1/tests/${nodeCommandId}/files/start`,
        headers,
        payload: JSON.stringify({ path: 'src/app.test.ts', line: 10 }),
      });
      assert.equal(response.statusCode, 400);
      assert.equal(
        response.json<ErrorResponse>().error,
        'TEST_CASE_TARGET_UNSUPPORTED',
      );
    },
  );

  await context.test(
    'rejeita padrão de nome para runner sem suporte com 400 TEST_NAME_PATTERN_UNSUPPORTED',
    async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/projects/rails-p1/tests/${rspecCommandId}/files/start`,
        headers,
        payload: JSON.stringify({
          path: 'spec/models/user_spec.rb',
          namePattern: 'soma valores',
        }),
      });
      assert.equal(response.statusCode, 400);
      assert.equal(
        response.json<ErrorResponse>().error,
        'TEST_NAME_PATTERN_UNSUPPORTED',
      );
    },
  );

  await context.test(
    'histórico registra o alvo "arquivo:linha" da execução do caso',
    async () => {
      let history: HistoryResponse['history'] | undefined;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const response = await app.inject({
          method: 'GET',
          url: '/api/projects/rails-p1/tests/history',
          headers,
        });
        assert.equal(response.statusCode, 200);
        history = response.json<HistoryResponse>().history;
        if (
          history.items[0]?.status !== 'running' &&
          history.items[0]?.status !== 'starting'
        )
          break;
        await sleep(100);
      }
      assert.ok(history);
      assert.equal(
        history!.items[0]!.targetFile,
        'spec/models/user_spec.rb:42',
      );
    },
  );
});

test('rotas de padrão de nome para runners Node (vitest/jest/node-test)', async (context) => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-test-name-pattern-routes-'),
  );
  const projectPath = path.join(fixtureRoot, 'sample');
  await mkdir(path.join(projectPath, 'src'), { recursive: true });
  await writeFile(
    path.join(projectPath, 'package.json'),
    JSON.stringify({
      name: 'sample',
      scripts: { test: 'vitest run' },
      devDependencies: { vitest: '^1.0.0' },
    }),
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
    id: 'p1',
    name: 'sample',
    path: projectPath,
    type: 'node',
    source: 'workspace',
    workspaceId: 'w1',
    enabled: true,
    capabilities: ['tests'],
  };
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'w1',
    workspacePath: fixtureRoot,
    projects: [project],
    warnings: [],
  });

  const app = await buildApp({ localToken: TOKEN, context: appContext });
  context.after(async () => {
    await app.close();
    if (previousConfigDirectory === undefined)
      delete process.env.DEV_DASHBOARD_CONFIG_DIR;
    else process.env.DEV_DASHBOARD_CONFIG_DIR = previousConfigDirectory;
    if (previousStateDirectory === undefined)
      delete process.env.DEV_DASHBOARD_STATE_DIR;
    else process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  const headers = {
    'x-dev-dashboard-token': TOKEN,
    'content-type': 'application/json',
  };
  let commandId = '';

  await context.test('overview expõe supportsNamePatternTarget', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/projects/p1/tests',
      headers,
    });
    assert.equal(response.statusCode, 200);
    const { tests } = response.json<OverviewResponse>();
    assert.equal(tests.commands[0]!.supportsNamePatternTarget, true);
    commandId = tests.commands[0]!.id;
  });

  await context.test(
    'inicia a execução de um arquivo com padrão de nome (-t)',
    async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/projects/p1/tests/${commandId}/files/start`,
        headers,
        payload: JSON.stringify({
          path: 'src/app.test.ts',
          namePattern: 'soma valores',
        }),
      });
      assert.equal(response.statusCode, 201);
      const { process: managedProcess } = response.json<ProcessResponse>();
      assert.deepEqual(managedProcess.args, [
        'run',
        'test',
        '--',
        'src/app.test.ts',
        '-t',
        'soma valores',
      ]);
      await app.inject({
        method: 'POST',
        url: '/api/projects/p1/tests/process/stop',
        headers,
        payload: JSON.stringify({}),
      });
    },
  );
});
