import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { MigrationOverviewService } from '../src/services/migration-overview-service.js';
import type { MigrationProvider } from '../src/services/migration-provider.js';

const NOW = new Date('2026-09-07T16:00:00.000Z');

function project(): Project {
  return {
    id: 'project-1',
    name: 'Projeto',
    path: '/workspace/projeto',
    type: 'node',
    source: 'workspace',
    enabled: true,
    capabilities: ['database'],
  };
}

test('seleciona o primeiro provider compatível e normaliza database antes da inspeção', async () => {
  const calls: string[] = [];
  const first: MigrationProvider = {
    id: 'first',
    supports: () => true,
    inspect: async (context) => {
      calls.push(context.database ?? '');
      return {
        provider: 'first',
        status: 'pending',
        database: context.database ?? 'primary',
        applied: [{ id: '001' }],
        pending: [{ id: '002', name: 'Add index' }],
        observedAt: (context.now ?? (() => NOW))().toISOString(),
        evidence: 'fixture',
        warnings: [],
      };
    },
  };
  const second: MigrationProvider = {
    id: 'second',
    supports: () => true,
    inspect: async () => {
      throw new Error('não deveria executar');
    },
  };

  const service = new MigrationOverviewService([first, second], {
    now: () => NOW,
  });
  const result = await service.inspect(project(), 'analytics_2');

  assert.equal(result.provider, 'first');
  assert.equal(result.status, 'pending');
  assert.deepEqual(calls, ['analytics_2']);
});

test('sem provider compatível retorna unavailable e nunca falso up-to-date', async () => {
  const service = new MigrationOverviewService([], { now: () => NOW });

  const result = await service.inspect(project());

  assert.equal(result.provider, 'none');
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.pending, []);
  assert.equal(result.observedAt, NOW.toISOString());
});

test('falha inesperada do provider é sanitizada sem vazar mensagem sensível', async () => {
  const secret = 'DATABASE_URL=postgres://secret';
  const provider: MigrationProvider = {
    id: 'custom',
    supports: () => true,
    inspect: async () => {
      throw new Error(secret);
    },
  };
  const service = new MigrationOverviewService([provider], { now: () => NOW });

  const result = await service.inspect(project(), '../../unsafe');
  const serialized = JSON.stringify(result);

  assert.equal(result.provider, 'custom');
  assert.equal(result.status, 'unavailable');
  assert.equal(result.database, 'primary');
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes('../../unsafe'), false);
});

test('erro em supports de um provider não impede fallback seguro para o próximo', async () => {
  const broken: MigrationProvider = {
    id: 'broken',
    supports: () => {
      throw new Error('segredo');
    },
    inspect: async () => {
      throw new Error('não deveria executar');
    },
  };
  const fallback: MigrationProvider = {
    id: 'fallback',
    supports: () => true,
    inspect: async () => ({
      provider: 'fallback',
      status: 'up-to-date',
      database: 'primary',
      applied: [],
      pending: [],
      observedAt: NOW.toISOString(),
      evidence: 'fixture',
      warnings: [],
    }),
  };

  const result = await new MigrationOverviewService([broken, fallback], {
    now: () => NOW,
  }).inspect(project());

  assert.equal(result.provider, 'fallback');
  assert.equal(result.status, 'up-to-date');
});
