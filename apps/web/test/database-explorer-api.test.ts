import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestJson = vi.hoisted(() => vi.fn());

vi.mock('../src/api/core', () => ({ requestJson }));

import {
  createDatabaseExplorerSession,
  deleteDatabaseExplorerSession,
  fetchDatabaseExplorerCatalog,
  fetchDatabaseExplorerTables,
  previewDatabaseExplorerTable,
  queryDatabaseExplorer,
} from '../src/api/database-explorer';

describe('Database Explorer session API', () => {
  beforeEach(() => {
    requestJson.mockReset();
  });

  it('envia credenciais somente ao criar a sessão', async () => {
    requestJson
      .mockResolvedValueOnce({
        sessionId: 'session-1',
        expiresAt: '2026-08-29T18:00:00.000Z',
      })
      .mockResolvedValueOnce({ databases: [{ name: 'app_development' }] })
      .mockResolvedValueOnce({ tables: [{ schema: 'public', name: 'users' }] })
      .mockResolvedValueOnce({
        result: { columns: ['id'], rows: [[1]], rowCount: 1, truncated: false },
      })
      .mockResolvedValueOnce({
        result: { columns: ['id'], rows: [[1]], rowCount: 1, truncated: false },
      })
      .mockResolvedValueOnce(null);

    const connection = {
      driver: 'postgresql' as const,
      host: '127.0.0.1',
      port: 5432,
      username: 'dev',
      password: 'secret',
    };

    await createDatabaseExplorerSession(connection);
    await fetchDatabaseExplorerCatalog('session-1');
    await fetchDatabaseExplorerTables('session-1', 'app_development');
    await previewDatabaseExplorerTable(
      'session-1',
      { schema: 'public', name: 'users' },
      'app_development',
    );
    await queryDatabaseExplorer(
      'session-1',
      'SELECT * FROM users',
      'app_development',
    );
    await deleteDatabaseExplorerSession('session-1');

    expect(JSON.parse(requestJson.mock.calls[0]![1].body)).toEqual(connection);

    for (const call of requestJson.mock.calls.slice(1, 5)) {
      const body = JSON.parse(call[1].body);
      expect(body.sessionId).toBe('session-1');
      expect(body).not.toHaveProperty('password');
      expect(body).not.toHaveProperty('username');
      expect(body).not.toHaveProperty('host');
      expect(body).not.toHaveProperty('port');
      expect(body).not.toHaveProperty('driver');
    }

    expect(requestJson.mock.calls[1]![0]).toBe(
      '/api/database/explorer/sessions/catalog',
    );
    expect(requestJson.mock.calls[2]![0]).toBe(
      '/api/database/explorer/sessions/tables',
    );
    expect(requestJson.mock.calls[3]![0]).toBe(
      '/api/database/explorer/sessions/preview',
    );
    expect(requestJson.mock.calls[4]![0]).toBe(
      '/api/database/explorer/sessions/query',
    );
    expect(requestJson.mock.calls[5]![0]).toBe(
      '/api/database/explorer/sessions/session-1',
    );
  });
});
