import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Project } from '@dev-dashboard/contracts';
import { DatabaseDetectionService } from '../src/services/database-detection-service.js';

async function fixture(files: Record<string, string>): Promise<Project> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'database-detection-'));
  for (const [name, contents] of Object.entries(files)) { const target = path.join(root, name); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, contents); }
  return { id: 'projeto', name: 'Projeto', path: root, type: 'rails', source: 'standalone', favorite: false, capabilities: ['database'] };
}

test('detecta múltiplos ambientes de database.yml sem expor senha', async () => {
  const project = await fixture({ 'config/database.yml': `development:\n  adapter: postgresql\n  host: localhost\n  port: 5432\n  database: app_dev\n  username: app\n  password: segredo\ntest:\n  adapter: mysql2\n  host: 127.0.0.1\n  database: app_test\n` });
  const overview = await new DatabaseDetectionService().getOverview(project);
  assert.equal(overview.total, 2); assert.deepEqual(overview.environments.map((item) => item.environment), ['development', 'test']);
  assert.equal(overview.environments[0]?.passwordConfigured, true);
  assert.doesNotMatch(JSON.stringify(overview), /segredo/);
});

test('detecta DATABASE_URL em .env e revela somente sob chamada explícita', async () => {
  const project = await fixture({ '.env': 'DATABASE_URL=postgresql://user:senha@localhost:5432/example\n' });
  const service = new DatabaseDetectionService(); const overview = await service.getOverview(project);
  assert.equal(overview.environments[0]?.driver, 'postgresql'); assert.doesNotMatch(JSON.stringify(overview), /senha/);
  assert.match((await service.reveal(project, overview.environments[0]!.id)) ?? '', /senha/);
});

test('retorna estado vazio para projeto sem configuração', async () => {
  const overview = await new DatabaseDetectionService().getOverview(await fixture({ 'package.json': '{}' }));
  assert.equal(overview.supported, false); assert.equal(overview.total, 0);
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
    assert.equal(await service.reveal(project, 'rails-development'), 'postgresql://local@localhost/app');
  } finally {
    delete process.env[variable];
  }
});

test('não testa conectividade de hosts remotos definidos pelo projeto', async () => {
  const project = await fixture({ '.env': 'DATABASE_URL=postgresql://user@192.0.2.10:5432/example\n' });
  const overview = await new DatabaseDetectionService().getOverview(project);
  assert.equal(overview.environments[0]?.reachability, 'unknown');
});

test('oferece e inicia o serviço systemd correspondente ao banco local', async () => {
  const project = await fixture({
    '.env': 'DATABASE_URL=postgresql://user@localhost:5432/example\n',
  });
  const calls: Array<{ command: string; args: string[]; cwd: string }> = [];
  const service = new DatabaseDetectionService(async (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd });
  });

  const overview = await service.getOverview(project);
  assert.equal(overview.environments[0]?.startAvailable, true);
  assert.equal(await service.start(project, overview.environments[0]!.id), true);
  assert.deepEqual(calls, [{
    command: 'pkexec',
    args: ['--disable-internal-agent', 'systemctl', 'start', 'postgresql.service'],
    cwd: project.path,
  }]);
});

test('seleciona o serviço mysql a partir do adapter mysql2', async () => {
  const project = await fixture({
    'config/database.yml': 'development:\n  adapter: mysql2\n  host: localhost\n  database: example\n',
  });
  const calls: Array<{ command: string; args: string[] }> = [];
  const service = new DatabaseDetectionService(async (command, args) => { calls.push({ command, args }); });
  const overview = await service.getOverview(project);

  assert.equal(overview.environments[0]?.startAvailable, true);
  assert.equal(await service.start(project, overview.environments[0]!.id), true);
  assert.deepEqual(calls, [{ command: 'pkexec', args: ['--disable-internal-agent', 'systemctl', 'start', 'mysql.service'] }]);
});

test('não oferece inicialização local para host remoto', async () => {
  const project = await fixture({
    '.env': 'DATABASE_URL=postgresql://user@192.0.2.10:5432/example\n',
  });
  const service = new DatabaseDetectionService(async () => assert.fail('não deveria executar comandos'));
  const overview = await service.getOverview(project);

  assert.equal(overview.environments[0]?.startAvailable, false);
  assert.equal(await service.start(project, 'dotenv--env'), false);
});

test('informa quando não há agente polkit disponível na sessão', async () => {
  const project = await fixture({
    '.env': 'DATABASE_URL=postgresql://user@localhost:5432/example\n',
  });
  const calls: string[] = [];
  const service = new DatabaseDetectionService(async (command) => {
    calls.push(command);
    throw Object.assign(new Error('autorização indisponível'), { stderr: 'No authentication agent found.' });
  });

  await assert.rejects(() => service.start(project, 'dotenv--env'), { reason: 'authorization-unavailable' });
  assert.deepEqual(calls, ['pkexec']);
});

test('informa quando a autorização polkit é negada', async () => {
  const project = await fixture({
    '.env': 'DATABASE_URL=postgresql://user@localhost:5432/example\n',
  });
  const service = new DatabaseDetectionService(async () => {
    throw Object.assign(new Error('autorização negada'), { stderr: 'Not authorized' });
  });

  await assert.rejects(() => service.start(project, 'dotenv--env'), { reason: 'permission-denied' });
});
