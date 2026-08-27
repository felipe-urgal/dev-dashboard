import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import { databaseRoutes } from '../src/routes/database.js';
import type { DatabaseDetectionService } from '../src/services/database-detection-service.js';
import type { DatabaseReadonlyService } from '../src/services/database-readonly-service.js';
import type { DatabaseSnapshotService } from '../src/services/database-snapshot-service.js';
import type { ProjectStore } from '../src/store/project-store.js';

const emptyResult = {
  columns: [],
  rows: [],
  rowCount: 0,
  truncated: false,
};

test('rotas do Database Explorer propagam AbortSignal ao serviço', async (context) => {
  const signals: AbortSignal[] = [];
  const databaseReadonlyService = {
    async listDatabases(_connection: unknown, signal?: AbortSignal) {
      if (signal) signals.push(signal);
      return [];
    },
    async listTables(_connection: unknown, signal?: AbortSignal) {
      if (signal) signals.push(signal);
      return [];
    },
    async preview(
      _connection: unknown,
      _schema: string | undefined,
      _table: string,
      signal?: AbortSignal,
    ) {
      if (signal) signals.push(signal);
      return emptyResult;
    },
    async query(
      _connection: unknown,
      _query: string,
      signal?: AbortSignal,
    ) {
      if (signal) signals.push(signal);
      return emptyResult;
    },
  } as unknown as DatabaseReadonlyService;

  const app = Fastify();
  await app.register(databaseRoutes, {
    projectStore: {} as unknown as ProjectStore,
    databaseDetectionService: {} as unknown as DatabaseDetectionService,
    databaseSnapshotService: {} as unknown as DatabaseSnapshotService,
    databaseReadonlyService,
  });
  context.after(async () => app.close());

  const requests = [
    {
      url: '/database/explorer/catalog',
      payload: { driver: 'postgresql' },
    },
    {
      url: '/database/explorer/tables',
      payload: { driver: 'postgresql' },
    },
    {
      url: '/database/explorer/preview',
      payload: { driver: 'postgresql', table: 'users' },
    },
    {
      url: '/database/explorer/query',
      payload: { driver: 'postgresql', query: 'SELECT 1' },
    },
  ];

  for (const request of requests) {
    const response = await app.inject({
      method: 'POST',
      url: request.url,
      payload: request.payload,
    });
    assert.equal(response.statusCode, 200);
  }

  assert.equal(signals.length, requests.length);
  for (const signal of signals) {
    assert.equal(signal instanceof AbortSignal, true);
    assert.equal(signal.aborted, false);
  }
});
