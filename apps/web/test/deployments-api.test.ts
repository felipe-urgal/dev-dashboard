import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  cancelDeployment,
  createDeploymentConfirmation,
  fetchDeployment,
  fetchDeploymentHistory,
  fetchDeploymentLog,
  fetchDeploymentPlan,
  fetchProductionDeploymentStatus,
  startDeployment,
} from '../src/api/deployments';
import { clearApiRequestMetrics } from '../src/api/core';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('API de deployments', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearApiRequestMetrics();
  });

  it('usa rotas estruturadas para status, histórico, detalhe e log', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/status')) {
          return jsonResponse({
            status: {
              projectId: 'project-1',
              projectName: 'Projeto',
              strategy: 'git-managed',
              provider: 'vercel',
              branch: 'main',
              externalProject: 'projeto',
              providerAvailability: 'available',
              drift: 'unknown',
              localOperations: [],
              timeline: [],
            },
          });
        }
        if (url.endsWith('/deployment-1/log')) {
          return jsonResponse({
            log: {
              deploymentId: 'deployment-1',
              content: 'ok',
              truncated: false,
              masked: false,
              redactionCount: 0,
            },
          });
        }
        if (url.endsWith('/deployment-1')) {
          return jsonResponse({
            deployment: {
              id: 'deployment-1',
              projectId: 'project-1',
              projectName: 'Projeto',
              provider: 'systemd',
              branch: 'main',
              revision: 'a'.repeat(40),
              planHash: 'b'.repeat(64),
              status: 'succeeded',
              createdAt: '2026-08-31T12:00:00.000Z',
              timeline: [],
            },
          });
        }
        return jsonResponse({
          history: { items: [], page: 1, pageSize: 8, total: 0 },
        });
      });

    await fetchProductionDeploymentStatus('project/1');
    await fetchDeploymentHistory('project/1', { page: 1, pageSize: 8 });
    await fetchDeployment('project/1', 'deployment-1');
    await fetchDeploymentLog('project/1', 'deployment-1');

    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      '/api/projects/project%2F1/deployments/status',
      '/api/projects/project%2F1/deployments?page=1&pageSize=8',
      '/api/projects/project%2F1/deployments/deployment-1',
      '/api/projects/project%2F1/deployments/deployment-1/log',
    ]);
  });

  it('envia somente planHash e token de confirmação nas mutações', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/plan')) {
          return jsonResponse({
            plan: {
              projectId: 'project-1',
              projectName: 'Projeto',
              provider: 'systemd',
              branch: 'main',
              revision: 'a'.repeat(40),
              planHash: 'b'.repeat(64),
              createdAt: '2026-08-31T12:00:00.000Z',
              steps: [],
            },
          });
        }
        if (url.endsWith('/confirmations')) {
          return jsonResponse(
            {
              confirmation: {
                token: 'c'.repeat(64),
                projectId: 'project-1',
                revision: 'a'.repeat(40),
                planHash: 'b'.repeat(64),
                expiresAt: '2026-08-31T12:01:00.000Z',
              },
            },
            201,
          );
        }
        return jsonResponse(
          {
            deployment: {
              id: 'deployment-1',
              projectId: 'project-1',
              projectName: 'Projeto',
              provider: 'systemd',
              branch: 'main',
              revision: 'a'.repeat(40),
              planHash: 'b'.repeat(64),
              status: 'succeeded',
              createdAt: '2026-08-31T12:00:00.000Z',
              timeline: [],
            },
          },
          url.endsWith('/cancel') ? 200 : 202,
        );
      });

    const plan = await fetchDeploymentPlan('project-1');
    const confirmation = await createDeploymentConfirmation(
      'project-1',
      plan.planHash,
    );
    const deployment = await startDeployment(
      'project-1',
      plan.planHash,
      confirmation.token,
    );
    await cancelDeployment('project-1', deployment.id);

    const calls = fetchMock.mock.calls;
    expect(calls[0]?.[1]?.method).toBe('POST');
    expect(calls[0]?.[1]?.body).toBeUndefined();
    expect(JSON.parse(String(calls[1]?.[1]?.body))).toEqual({
      planHash: 'b'.repeat(64),
    });
    expect(JSON.parse(String(calls[2]?.[1]?.body))).toEqual({
      planHash: 'b'.repeat(64),
      confirmationToken: 'c'.repeat(64),
    });
    expect(calls[3]?.[1]?.body).toBeUndefined();
  });
});
