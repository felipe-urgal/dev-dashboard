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
    expect(localStorage.getItem('dev-dashboard.database-connections')).not.toContain(
      'secret',
    );

    const selected = saved.select(saved.connections.value[0]!.id);
    expect(selected?.database).toBe('app_development');
    expect(saved.selectedId.value).toBe(selected?.id);

    saved.remove(selected!.id);
    expect(saved.connections.value).toEqual([]);
    expect(saved.selectedId.value).toBe('');
  });

  it('ignora storage inválido ao carregar', () => {
    localStorage.setItem('dev-dashboard.database-connections', '{invalid');

    expect(useDatabaseSavedConnections().connections.value).toEqual([]);
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

  it('persiste no máximo 50 consultas e permite remover/limpar', () => {
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
      localStorage.getItem('dev-dashboard.database-query-history') ?? '[]',
    ) as unknown[];
    expect(persisted).toHaveLength(50);
    expect(queries.recent.value).toHaveLength(8);

    const firstId = queries.history.value[0]!.id;
    queries.remove(firstId);
    expect(queries.history.value.some((item) => item.id === firstId)).toBe(false);

    queries.clear();
    expect(queries.history.value).toEqual([]);
  });

  it('ignora storage inválido ao carregar', () => {
    localStorage.setItem('dev-dashboard.database-query-history', '{invalid');

    expect(useDatabaseQueryHistory().history.value).toEqual([]);
  });
});
