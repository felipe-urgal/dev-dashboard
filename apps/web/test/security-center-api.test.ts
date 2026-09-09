import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestJson = vi.hoisted(() => vi.fn());

vi.mock('../src/api/core', () => ({ requestJson }));

import {
  fetchSecurityCenterAvailability,
  scanProjectSecurityCenter,
} from '../src/api/security-center';

describe('Security Center API', () => {
  beforeEach(() => {
    requestJson.mockReset();
  });

  it('consulta availability sem ampliar a autoridade do browser', async () => {
    requestJson.mockResolvedValueOnce({
      provider: 'trivy',
      availability: {
        state: 'available',
        observedAt: '2026-09-09T12:00:00.000Z',
        version: '0.66.0',
      },
    });

    await fetchSecurityCenterAvailability();

    expect(requestJson).toHaveBeenCalledWith(
      '/api/security-center/availability',
    );
  });

  it('envia somente projectId e body vazio ao iniciar scan', async () => {
    requestJson.mockResolvedValueOnce({
      provider: 'trivy',
      execution: {
        state: 'completed',
        observedAt: '2026-09-09T12:00:00.000Z',
        result: {
          provider: 'trivy',
          observedAt: '2026-09-09T12:00:00.000Z',
          findings: [],
        },
      },
    });

    await scanProjectSecurityCenter('project / 1');

    expect(requestJson).toHaveBeenCalledTimes(1);
    const [url, init] = requestJson.mock.calls[0]!;
    expect(url).toBe('/api/projects/project%20%2F%201/security-center/scan');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(JSON.parse(init.body)).toEqual({});
  });
});
