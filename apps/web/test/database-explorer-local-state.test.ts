import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDatabaseQueryHistory } from '../src/composables/useDatabaseQueryHistory';
import { useDatabaseSavedConnections } from '../src/composables/useDatabaseSavedConnections';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('useDatabaseSavedConnections', () => {
  it('salva somente metadados, deduplica e permite selecionar/remover', () => {
    const saved = useDatabaseSavedConnections();

    saved.save({
      driver: 'postgresql',
      host: '127.0.0.1',
      port: 5432,
      username: 'app',
      password: 'secret',
      database: 'app_development',
    });
    saved.save({
      driver: 'postgresql',
      host: '127.0.0.1',
      port: 5432,
      username: 'app',
      password: 'new-secret',
      database: 'app_development',
    });

    expect(saved.connections.value).toHaveLength(1);
    expect(saved.connections.value[0]).not.toHaveProperty('password');
    const raw = localStorage.getItem('dev-dashboard.database-connections');
    expect(raw).not.toContain('secret');
    expect(JSON.parse(raw ?? '{}')).toMatchObject({
      version: 1,
      value: [{ database: 'app_development' }],
    });

    const selected = saved.select(saved.connections.value[0]!.id);
    expect(selected?.database).toBe('app_development');
    expect(saved.selectedId.value).toBe(selected?.id);

    saved.remove(selected!.id);
    expect(saved.connections.value).toEqual([]);
    expect(saved.selectedId.value).toBe('');
  });

  it('migra legado, sanitiza segredos e entradas incompatíveis ao carregar', () => {
    localStorage.setItem(
      'dev-dashboard.database-connections',
      JSON.stringify([
        {
          id: 'postgresql|127.0.0.1|5432|app|app_development',
          label: 'PostgreSQL local',
          driver: 'postgresql',
          host: '127.0.0.1',
          port: 5432,
          username: 'app',
          password: 'legacy-secret',
          database: 'app_development',
        },
        {
          id: 'unsupported',
          label: 'Inválida',
          driver: 'mongodb',
          password: 'other-secret',
        },
      ]),
    );
    const saved = useDatabaseSavedConnections();

    saved.load();

    expect(saved.connections.value).toHaveLength(1);
    expect(saved.connections.value[0]).toMatchObject({
      driver: 'postgresql',
      database: 'app_development',
    });
    expect(saved.connections.value[0]).not.toHaveProperty('password');

    const migrated = localStorage.getItem('dev-dashboard.database-connections');
    expect(migrated).not.toContain('secret');
    expect(JSON.parse(migrated ?? '{}')).toMatchObject({
      version: 1,
      value: [{ driver: 'postgresql', database: 'app_development' }],
    });
  });

  it('ignora storage inválido ao carregar', () => {
    localStorage.setItem('dev-dashboard.database-connections', '{invalid');
    const saved = useDatabaseSavedConnections();

    saved.load();

    expect(saved.connections.value).toEqual([]);
  });
});

describe('useDatabaseQueryHistory', () => {
  const input = {
    query: 'SELECT * FROM users WHERE email = \'private@example.com\'',
    driver: 'postgresql' as const,
    database: 'app_development',
    table: 'users',
  };

  it('não persiste SQL recente em localStorage e limita recentes a 50', () => {
    const queries = useDatabaseQueryHistory();
    for (let index = 0; index < 55; index += 1) {
      queries.remember({ ...input, query: `SELECT ${index}` });
    }
    expect(queries.history.value).toHaveLength(50);
    expect(queries.recent.value).toHaveLength(8);
    expect(localStorage.getItem('dev-dashboard.database-query-history')).toBeNull();
    expect(localStorage.getItem('dev-dashboard.database-saved-queries')).toBeNull();
    expect(JSON.parse(sessionStorage.getItem('dev-dashboard.database-recent-queries') ?? '[]')).toHaveLength(50);
    sessionStorage.clear(); // a new browser session
    const nextSession = useDatabaseQueryHistory();
    nextSession.load();
    expect(nextSession.history.value).toEqual([]);
  });

  it('salva SQL somente após ação explícita, deduplica e permite removê-lo', () => {
    const queries = useDatabaseQueryHistory();
    queries.remember(input);
    const id = queries.history.value[0]!.id;
    expect(localStorage.length).toBe(0);
    queries.toggleFavorite(id);
    expect(queries.savedQueries.value).toHaveLength(1);
    expect(localStorage.getItem('dev-dashboard.database-saved-queries')).toContain(input.query);
    sessionStorage.clear();
    const nextSession = useDatabaseQueryHistory();
    nextSession.load();
    expect(nextSession.recent.value).toEqual([]);
    expect(nextSession.savedQueries.value).toHaveLength(1);
    nextSession.toggleFavorite(id);
    expect(nextSession.savedQueries.value).toEqual([]);
  });

  it('limita consultas explicitamente salvas a 50', () => {
    const queries = useDatabaseQueryHistory();
    for (let index = 0; index < 55; index += 1) {
      queries.remember({ ...input, query: `SELECT ${index}` });
      queries.toggleFavorite(queries.history.value[0]!.id);
    }
    expect(queries.savedQueries.value).toHaveLength(50);
  });

  it('descarta legado automaticamente, sem reapresentar SQL ou copiar segredos', () => {
    localStorage.setItem('dev-dashboard.database-query-history', JSON.stringify({
      version: 1,
      value: [{ ...input, password: 'legacy-secret', favorite: true }],
    }));
    const queries = useDatabaseQueryHistory();
    queries.load();
    expect(queries.history.value).toEqual([]);
    expect(queries.savedQueries.value).toEqual([]);
    expect(localStorage.getItem('dev-dashboard.database-query-history')).toBeNull();
    expect(localStorage.getItem('dev-dashboard.database-saved-queries')).toBeNull();
  });

  it('ignora storage inválido', () => {
    sessionStorage.setItem('dev-dashboard.database-recent-queries', '{invalid');
    localStorage.setItem('dev-dashboard.database-saved-queries', '{invalid');
    const queries = useDatabaseQueryHistory();
    queries.load();
    expect(queries.history.value).toEqual([]);
    expect(queries.savedQueries.value).toEqual([]);
  });
});
