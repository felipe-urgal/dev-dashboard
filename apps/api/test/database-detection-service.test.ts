import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Project } from '@dev-dashboard/contracts';
import { DatabaseDetectionService } from '../src/services/database-detection-service.js';

async function fixture(files: Record<string, string>): Promise<Project> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'database-detection-'));
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  return {
    id: 'projeto',
    name: 'Projeto',
    path: root,
    type: 'rails',
    source: 'standalone',
    enabled: true,
    capabilities: ['database'],
  };
}

test('detecta múltiplos ambientes de database.yml sem expor senha', async () => {
  const project = await fixture({
    'config/database.yml': `development:\n  adapter: postgresql\n  host: localhost\n  port: 5432\n  database: app_dev\n  username: app\n  password: segredo\ntest:\n  adapter: mysql2\n  host: 127.0.0.1\n  database: app_test\n`,
  });
  const overview = await new DatabaseDetectionService().getOverview(project);
  assert.equal(overview.total, 2);
  assert.deepEqual(
    overview.environments.map((item) => item.environment),
    ['development', 'test'],
  );
  assert.equal(overview.environments[0]?.passwordConfigured, true);
  assert.doesNotMatch(JSON.stringify(overview), /segredo/);
});

test('detecta DATABASE_URL em .env e revela somente sob chamada explícita', async () => {
  const project = await fixture({
    '.env': 'DATABASE_URL=postgresql://user:senha@localhost:5432/example\n',
  });
  const service = new DatabaseDetectionService();
  const overview = await service.getOverview(project);
  assert.equal(overview.environments[0]?.driver, 'postgresql');
  assert.doesNotMatch(JSON.stringify(overview), /senha/);
  assert.match(
    (await service.reveal(project, overview.environments[0]!.id)) ?? '',
    /senha/,
  );
});

test('retorna estado vazio para projeto sem configuração', async () => {
  const overview = await new DatabaseDetectionService().getOverview(
    await fixture({ 'package.json': '{}' }),
  );
  assert.equal(overview.supported, false);
  assert.equal(overview.total, 0);
});

test('interpola ENV.fetch do Rails sem consultar o ambiente da API', async () => {
  const variable = 'DEV_DASHBOARD_TEST_DATABASE_URL';
  process.env[variable] = 'postgresql://api:segredo@localhost/vazamento';
  try {
    const project = await fixture({
      'config/database.yml': `development:\n  url: <%= ENV.fetch("${variable}", "postgresql://local@localhost/app") %>\n`,
    });
    const service = new DatabaseDetectionService();
    const overview = await service.getOverview(project);

    assert.equal(overview.environments[0]?.database, 'app');
    assert.doesNotMatch(JSON.stringify(overview), /vazamento|segredo/);
    assert.equal(
      await service.reveal(project, 'rails-development'),
      'postgresql://local@localhost/app',
    );
  } finally {
    delete process.env[variable];
  }
});

test('não testa conectividade de hosts remotos definidos pelo projeto', async () => {
  const project = await fixture({
    '.env': 'DATABASE_URL=postgresql://user@192.0.2.10:5432/example\n',
  });
  const overview = await new DatabaseDetectionService().getOverview(project);
  assert.equal(overview.environments[0]?.reachability, 'unknown');
});

test('detecta múltiplos bancos por ambiente (Rails 6+ primary/data)', async () => {
  const project = await fixture({
    'config/database.yml': `test:\n  primary:\n    adapter: mysql2\n    host: localhost\n    database: app_test\n\n  data:\n    adapter: mysql2\n    host: localhost\n    database: app_test_data\n\ndevelopment:\n  primary:\n    adapter: mysql2\n    host: localhost\n    database: app_development\n\n  data:\n    adapter: mysql2\n    host: localhost\n    database: app_development_data\n`,
  });
  const overview = await new DatabaseDetectionService().getOverview(project);
  assert.equal(overview.total, 4);
  assert.deepEqual(
    overview.environments.map((item) => ({
      environment: item.environment,
      database: item.database,
    })),
    [
      { environment: 'test', database: 'app_test' },
      { environment: 'test/data', database: 'app_test_data' },
      { environment: 'development', database: 'app_development' },
      { environment: 'development/data', database: 'app_development_data' },
    ],
  );
});

test('oferece e inicia o serviço systemd correspondente ao banco local', async () => {
  const project = await fixture({
    '.env': 'DATABASE_URL=postgresql://user@localhost:5432/example\n',
  });
  const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
  const service = new DatabaseDetectionService(
    async (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
    },
  );

  const overview = await service.getOverview(project);
  assert.equal(overview.environments[0]?.serviceAvailable, true);
  assert.equal(
    await service.start(project, overview.environments[0]!.id),
    true,
  );
  assert.deepEqual(calls, [
    {
      command: 'pkexec',
      args: [
        '--disable-internal-agent',
        'systemctl',
        'start',
        'postgresql.service',
      ],
      cwd: project.path,
    },
  ]);
});

test('pausa e reinicia o serviço systemd correspondente ao banco local', async () => {
  const project = await fixture({
    '.env': 'DATABASE_URL=postgresql://user@localhost:5432/example\n',
  });
  const calls: Array<{ command: string; args: string[] }> = [];
  const service = new DatabaseDetectionService(async (command, args) => {
    calls.push({ command, args });
  });
  const overview = await service.getOverview(project);
  const environmentId = overview.environments[0]!.id;

  assert.equal(await service.stop(project, environmentId), true);
  assert.equal(await service.restart(project, environmentId), true);
  assert.deepEqual(calls, [
    {
      command: 'pkexec',
      args: [
        '--disable-internal-agent',
        'systemctl',
        'stop',
        'postgresql.service',
      ],
    },
    {
      command: 'pkexec',
      args: [
        '--disable-internal-agent',
        'systemctl',
        'restart',
        'postgresql.service',
      ],
    },
  ]);
});

test('seleciona o serviço mysql a partir do adapter mysql2', async () => {
  const project = await fixture({
    'config/database.yml':
      'development:\n  adapter: mysql2\n  host: localhost\n  database: example\n',
  });
  const calls: Array<{ command: string; args: string[] }> = [];
  const service = new DatabaseDetectionService(async (command, args) => {
    calls.push({ command, args });
  });
  const overview = await service.getOverview(project);

  assert.equal(overview.environments[0]?.serviceAvailable, true);
  assert.equal(
    await service.start(project, overview.environments[0]!.id),
    true,
  );
  assert.deepEqual(calls, [
    {
      command: 'pkexec',
      args: ['--disable-internal-agent', 'systemctl', 'start', 'mysql.service'],
    },
  ]);
});

test('não oferece inicialização local para host remoto', async () => {
  const project = await fixture({
    '.env': 'DATABASE_URL=postgresql://user@192.0.2.10:5432/example\n',
  });
  const service = new DatabaseDetectionService(async () =>
    assert.fail('não deveria executar comandos'),
  );
  const overview = await service.getOverview(project);

  assert.equal(overview.environments[0]?.serviceAvailable, false);
  assert.equal(await service.start(project, 'dotenv--env'), false);
  assert.equal(await service.stop(project, 'dotenv--env'), false);
  assert.equal(await service.restart(project, 'dotenv--env'), false);
});

test('informa quando não há agente polkit disponível na sessão', async () => {
  const project = await fixture({
    '.env': 'DATABASE_URL=postgresql://user@localhost:5432/example\n',
  });
  const calls: string[] = [];
  const service = new DatabaseDetectionService(async (command) => {
    calls.push(command);
    throw Object.assign(new Error('autorização indisponível'), {
      stderr: 'No authentication agent found.',
    });
  });

  await assert.rejects(() => service.start(project, 'dotenv--env'), {
    reason: 'authorization-unavailable',
  });
  assert.deepEqual(calls, ['pkexec']);
});

test('informa quando a autorização polkit é negada', async () => {
  const project = await fixture({
    '.env': 'DATABASE_URL=postgresql://user@localhost:5432/example\n',
  });
  const service = new DatabaseDetectionService(async () => {
    throw Object.assign(new Error('autorização negada'), {
      stderr: 'Not authorized',
    });
  });

  await assert.rejects(() => service.start(project, 'dotenv--env'), {
    reason: 'permission-denied',
  });
});

test('detecta serviços globais instalados, ativos e ausentes', async () => {
  const calls: string[] = [];
  const service = new DatabaseDetectionService(
    undefined,
    async (command, args) => {
      calls.push(`${command} ${args.join(' ')}`);
      if (args[1] === 'mysql.service') return { stdout: 'active\n' };
      if (args[1] === 'mariadb.service') {
        throw Object.assign(new Error('inactive'), {
          code: 3,
          stdout: 'inactive\n',
        });
      }
      throw Object.assign(new Error('unit not found'), { code: 4, stdout: '' });
    },
  );

  const services = await service.getMachineServices();
  assert.deepEqual(
    services.slice(0, 2).map(({ id, installed, active }) => ({
      id,
      installed,
      active,
    })),
    [
      { id: 'mysql', installed: true, active: true },
      { id: 'mariadb', installed: true, active: false },
    ],
  );
  assert.equal(services.filter((item) => !item.installed).length, 3);
  assert.equal(calls.length, 5);
});

test('executa ação global no serviço systemd correspondente', async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const service = new DatabaseDetectionService(
    undefined,
    async (command, args) => {
      calls.push({ command, args });
      if (command === 'systemctl') return { stdout: 'active\n' };
      return {};
    },
  );

  await service.runMachineServiceAction('postgresql', 'restart');
  assert.deepEqual(calls.at(-1), {
    command: 'pkexec',
    args: [
      '--disable-internal-agent',
      'systemctl',
      'restart',
      'postgresql.service',
    ],
  });
});

test('classifica autenticação interativa indisponível no serviço global', async () => {
  const service = new DatabaseDetectionService(undefined, async (command) => {
    if (command === 'systemctl') return { stdout: 'active\n' };
    throw Object.assign(new Error('Interactive authentication required'), {
      stderr: 'Interactive authentication required',
    });
  });

  await assert.rejects(
    () => service.runMachineServiceAction('postgresql', 'stop'),
    (error: unknown) =>
      error instanceof Error &&
      'reason' in error &&
      error.reason === 'authorization-unavailable',
  );
});

test('instala um serviço global ausente pelo gerenciador do sistema', async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const service = new DatabaseDetectionService(
    undefined,
    async (command, args) => {
      calls.push({ command, args });
      if (command === 'systemctl') {
        throw Object.assign(new Error('unit not found'), {
          code: 4,
          stdout: '',
        });
      }
      return {};
    },
  );

  await service.installMachineService('postgresql');
  assert.deepEqual(calls.at(-1), {
    command: 'pkexec',
    args: [
      '--disable-internal-agent',
      'apt-get',
      'install',
      '-y',
      'postgresql',
    ],
  });
});
