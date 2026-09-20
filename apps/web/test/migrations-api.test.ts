import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestJson = vi.hoisted(() => vi.fn());

vi.mock('../src/api/core', () => ({ requestJson }));

import {
  cancelMigrationMutation,
  fetchMigrationMutationStatus,
  fetchMigrationOverview,
  migrationMutationWebSocketUrl,
  planMigrationMutation,
  prepareMigrationMutation,
  startMigrationMutation,
} from '../src/api/migrations';

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

  it('encadeia plan, confirmation e start sem enviar comando/cwd pelo browser', async () => {
    const plan = {
      projectId: 'project-1',
      provider: 'rails',
      operation: 'apply' as const,
      database: 'primary',
      environmentInstanceId: 'environment:primary:project-1',
      runtime: 'host' as const,
      createdAt: '2026-09-20T10:00:00.000Z',
      planHash: 'a'.repeat(64),
      preflight: {
        state: 'ready' as const,
        reason: 'ready' as const,
        observedAt: '2026-09-20T09:59:00.000Z',
        evidence: 'Rails db:migrate:status',
      },
    };

    requestJson
      .mockResolvedValueOnce({ plan })
      .mockResolvedValueOnce({
        confirmation: {
          token: 'confirmation-token',
          planHash: plan.planHash,
          expiresAt: '2026-09-20T10:01:00.000Z',
        },
      })
      .mockResolvedValueOnce({
        snapshot: {
          provider: 'rails',
          operation: 'apply',
          database: 'primary',
          environmentInstanceId: plan.environmentInstanceId,
          planHash: plan.planHash,
          status: 'running',
          buffer: '',
          truncated: false,
          exitCode: null,
          exitSignal: null,
          startedAt: '2026-09-20T10:00:05.000Z',
          endedAt: null,
        },
      });

    const planned = await planMigrationMutation('project-1', 'primary');
    const confirmation = await prepareMigrationMutation('project-1', planned);
    await startMigrationMutation(
      'project-1',
      planned,
      confirmation.token,
    );

    expect(requestJson).toHaveBeenNthCalledWith(
      1,
      '/api/projects/project-1/migrations/mutations/plan',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ operation: 'apply', database: 'primary' }),
      }),
    );
    expect(requestJson).toHaveBeenNthCalledWith(
      2,
      '/api/projects/project-1/migrations/mutations/confirmation',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          operation: 'apply',
          database: 'primary',
          environmentInstanceId: plan.environmentInstanceId,
          planHash: plan.planHash,
        }),
      }),
    );
    expect(requestJson).toHaveBeenNthCalledWith(
      3,
      '/api/projects/project-1/migrations/mutations/start',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          operation: 'apply',
          database: 'primary',
          environmentInstanceId: plan.environmentInstanceId,
          confirmationToken: 'confirmation-token',
        }),
      }),
    );
  });

  it('expõe status/cancel/connect por environment instance', async () => {
    requestJson.mockResolvedValueOnce({ snapshot: null }).mockResolvedValueOnce({
      ok: true,
    });

    await fetchMigrationMutationStatus(
      'project-1',
      'environment:primary:project-1',
    );
    await cancelMigrationMutation(
      'project-1',
      'environment:primary:project-1',
    );

    expect(requestJson).toHaveBeenNthCalledWith(
      1,
      '/api/projects/project-1/migrations/mutations/status?environmentInstanceId=environment%3Aprimary%3Aproject-1',
    );
    expect(requestJson).toHaveBeenNthCalledWith(
      2,
      '/api/projects/project-1/migrations/mutations/cancel?environmentInstanceId=environment%3Aprimary%3Aproject-1',
      expect.objectContaining({ method: 'POST' }),
    );

    expect(
      migrationMutationWebSocketUrl(
        'project-1',
        'environment:primary:project-1',
      ),
    ).toContain(
      '/api/projects/project-1/migrations/mutations/connect?environmentInstanceId=environment%3Aprimary%3Aproject-1',
    );
  });
});
