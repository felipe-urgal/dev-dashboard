import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useDatabaseQueryHistory } from '../src/composables/useDatabaseQueryHistory';
import { useDatabaseSavedConnections } from '../src/composables/useDatabaseSavedConnections';

beforeEach(() => {
  localStorage.clear();
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
  it('deduplica consultas e preserva favorito', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const queries = useDatabaseQueryHistory();
    const input = {
      query: ' SELECT * FROM users ',
      driver: 'postgresql' as const,
      database: 'app_development',
      table: 'users',
    };

    queries.remember(input);
    const firstId = queries.history.value[0]!.id;
    queries.toggleFavorite(firstId);
    queries.remember(input);

    expect(queries.history.value).toHaveLength(1);
    expect(queries.history.value[0]).toMatchObject({
      query: 'SELECT * FROM users',
      favorite: true,
      database: 'app_development',
    });
    expect(queries.recent.value).toHaveLength(1);
  });

  it('persiste no máximo 50 consultas em envelope versionado e permite remover/limpar', () => {
    const queries = useDatabaseQueryHistory();

    for (let index = 0; index < 55; index += 1) {
      queries.remember({
        query: `SELECT ${index}`,
        driver: 'postgresql',
        database: 'app_development',
        table: '',
      });
    }

    const persisted = JSON.parse(
      localStorage.getItem('dev-dashboard.database-query-history') ?? '{}',
    ) as { version?: number; value?: unknown[] };
    expect(persisted.version).toBe(1);
    expect(persisted.value).toHaveLength(50);
    expect(queries.recent.value).toHaveLength(8);

    const firstId = queries.history.value[0]!.id;
    queries.remove(firstId);
    expect(queries.history.value.some((item) => item.id === firstId)).toBe(
      false,
    );

    queries.clear();
    expect(queries.history.value).toEqual([]);
  });

  it('migra histórico legado preservando favorito', () => {
    localStorage.setItem(
      'dev-dashboard.database-query-history',
      JSON.stringify([
        {
          id: 'legacy-query',
          query: 'SELECT * FROM users',
          driver: 'postgresql',
          database: 'app_development',
          table: 'users',
          createdAt: '2026-08-30T12:00:00.000Z',
          favorite: true,
        },
      ]),
    );
    const queries = useDatabaseQueryHistory();

    queries.load();

    expect(queries.history.value).toEqual([
      expect.objectContaining({ id: 'legacy-query', favorite: true }),
    ]);
    expect(
      JSON.parse(
        localStorage.getItem('dev-dashboard.database-query-history') ?? '{}',
      ),
    ).toMatchObject({ version: 1, value: [{ id: 'legacy-query' }] });
  });

  it('ignora storage inválido ao carregar', () => {
    localStorage.setItem('dev-dashboard.database-query-history', '{invalid');
    const queries = useDatabaseQueryHistory();

    queries.load();

    expect(queries.history.value).toEqual([]);
  });
});
