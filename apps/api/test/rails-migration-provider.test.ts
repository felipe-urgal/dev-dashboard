import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  Project,
  RailsMigrationsOverview,
} from '@dev-dashboard/contracts';

import { RailsMigrationProvider } from '../src/services/rails-migration-provider.js';

const NOW = new Date('2026-09-05T18:00:00.000Z');

function project(type: Project['type'] = 'rails'): Project {
  return {
    id: 'project-1',
    name: 'Projeto',
    path: '/workspace/projeto',
    type,
    source: 'workspace',
    enabled: true,
    capabilities: type === 'rails' ? ['database'] : [],
  };
}

function provider(overview: RailsMigrationsOverview): RailsMigrationProvider {
  return new RailsMigrationProvider({
    async getMigrationsOverview() {
      return overview;
    },
  });
}

test('normaliza migrations Rails aplicadas e pendentes', async () => {
  const result = await provider({
    supported: true,
    databases: ['primary'],
    database: 'primary',
    migrations: [
      { version: '20260901010101', name: 'Create users', status: 'up' },
      { version: '20260902020202', name: 'Add index', status: 'down' },
    ],
  }).inspect({ project: project(), now: () => NOW });

  assert.equal(result.status, 'pending');
  assert.deepEqual(result.applied, [
    { id: '20260901010101', name: 'Create users' },
  ]);
  assert.deepEqual(result.pending, [
    { id: '20260902020202', name: 'Add index' },
  ]);
  assert.equal(result.evidence, 'Rails db:migrate:status');
  assert.equal(result.observedAt, NOW.toISOString());
});

test('retorna up-to-date somente quando inspeção suportada não possui down', async () => {
  const result = await provider({
    supported: true,
    databases: ['primary'],
    migrations: [
      { version: '20260901010101', name: 'Create users', status: 'up' },
    ],
  }).inspect({ project: project(), now: () => NOW });

  assert.equal(result.status, 'up-to-date');
  assert.deepEqual(result.pending, []);
});

test('falha da inspeção vira unavailable e nunca falso up-to-date', async () => {
  const result = await provider({
    supported: false,
    databases: ['primary'],
    migrations: [],
  }).inspect({ project: project(), now: () => NOW });

  assert.equal(result.status, 'unavailable');
  assert.match(
    result.warnings[0] ?? '',
    /não equivale a zero migrations pendentes/,
  );
});

test('identidade de banco inválida não é ecoada nem repassada ao inspector', async () => {
  let inspectedDatabase = '';
  const instance = new RailsMigrationProvider({
    async getMigrationsOverview(_project, database) {
      inspectedDatabase = database ?? '';
      return { supported: true, databases: ['primary'], migrations: [] };
    },
  });

  const result = await instance.inspect({
    project: project(),
    database: '../../DATABASE_URL=secret',
    now: () => NOW,
  });

  assert.equal(inspectedDatabase, 'primary');
  assert.equal(result.database, 'primary');
  assert.equal(JSON.stringify(result).includes('DATABASE_URL'), false);
});

test('provider Rails declara suporte somente para projeto Rails', async () => {
  const instance = provider({
    supported: true,
    databases: ['primary'],
    migrations: [],
  });

  assert.equal(instance.supports(project('rails')), true);
  assert.equal(instance.supports(project('node')), false);

  const result = await instance.inspect({
    project: project('node'),
    now: () => NOW,
  });
  assert.equal(result.status, 'unavailable');
});
