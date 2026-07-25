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
