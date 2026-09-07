import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestJson = vi.hoisted(() => vi.fn());

vi.mock('../src/api/core', () => ({ requestJson }));

import { fetchMigrationOverview } from '../src/api/migrations';

beforeEach(() => {
  requestJson.mockReset();
});

describe('Migrations API', () => {
  it('usa a rota comum e codifica project/database', async () => {
    requestJson.mockResolvedValue({
      migration: {
        provider: 'rails',
        status: 'up-to-date',
        database: 'analytics_2',
        applied: [],
        pending: [],
        observedAt: '2026-09-07T16:00:00.000Z',
        evidence: 'fixture',
        warnings: [],
      },
    });

    const result = await fetchMigrationOverview('project / 1', 'analytics_2');

    expect(requestJson).toHaveBeenCalledWith(
      '/api/projects/project%20%2F%201/migrations?database=analytics_2',
    );
    expect(result.provider).toBe('rails');
  });

  it('não envia query de database quando não informada', async () => {
    requestJson.mockResolvedValue({
      migration: {
        provider: 'none',
        status: 'unavailable',
        database: 'primary',
        applied: [],
        pending: [],
        observedAt: '2026-09-07T16:00:00.000Z',
        evidence: 'fixture',
        warnings: [],
      },
    });

    await fetchMigrationOverview('project-1');

    expect(requestJson).toHaveBeenCalledWith(
      '/api/projects/project-1/migrations',
    );
  });
});
