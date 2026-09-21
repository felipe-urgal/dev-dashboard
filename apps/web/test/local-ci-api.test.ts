import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestJson = vi.hoisted(() => vi.fn());

vi.mock('../src/api/core', () => ({ requestJson }));

import {
  cancelLocalCiRun,
  fetchLocalCiCatalog,
  fetchLocalCiRun,
  localCiWebSocketUrl,
  startLocalCiRun,
} from '../src/api/local-ci';

describe('Local CI API', () => {
  beforeEach(() => {
    requestJson.mockReset();
  });

  it('consulta o catálogo codificando o projectId', async () => {
    requestJson.mockResolvedValueOnce({
      catalog: {
        provider: 'act',
        approximation: true,
        availability: { state: 'available' },
        jobs: [],
      },
    });

    await fetchLocalCiCatalog('project / 1');

    expect(requestJson).toHaveBeenCalledWith(
      '/api/projects/project%20%2F%201/local-ci/catalog',
    );
  });

  it('envia somente workflowFile, jobId e event ao iniciar', async () => {
    requestJson.mockResolvedValueOnce({
      run: {
        id: 'run-1',
        projectId: 'project-1',
        provider: 'act',
        approximation: true,
        request: {
          workflowFile: '.github/workflows/ci.yml',
          jobId: 'test',
          event: 'push',
        },
        status: 'running',
        logs: '',
        truncated: false,
        exitCode: null,
        exitSignal: null,
        timedOut: false,
        startedAt: '2026-09-21T12:00:00.000Z',
        endedAt: null,
      },
    });

    await startLocalCiRun('project-1', {
      workflowFile: '.github/workflows/ci.yml',
      jobId: 'test',
      event: 'push',
    });

    const [url, init] = requestJson.mock.calls[0]!;
    expect(url).toBe('/api/projects/project-1/local-ci/runs');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(JSON.parse(init.body)).toEqual({
      workflowFile: '.github/workflows/ci.yml',
      jobId: 'test',
      event: 'push',
    });
  });

  it('expõe status, cancelamento e connect por runId codificado', async () => {
    requestJson
      .mockResolvedValueOnce({
        run: {
          id: 'run / 1',
          projectId: 'project-1',
          provider: 'act',
          approximation: true,
          request: {
            workflowFile: '.github/workflows/ci.yml',
            jobId: 'test',
            event: 'push',
          },
          status: 'exited',
          logs: 'ok',
          truncated: false,
          exitCode: 0,
          exitSignal: null,
          timedOut: false,
          startedAt: '2026-09-21T12:00:00.000Z',
          endedAt: '2026-09-21T12:01:00.000Z',
        },
      })
      .mockResolvedValueOnce({ ok: true });

    await fetchLocalCiRun('project-1', 'run / 1');
    await cancelLocalCiRun('project-1', 'run / 1');

    expect(requestJson).toHaveBeenNthCalledWith(
      1,
      '/api/projects/project-1/local-ci/runs/run%20%2F%201',
    );
    expect(requestJson).toHaveBeenNthCalledWith(
      2,
      '/api/projects/project-1/local-ci/runs/run%20%2F%201/cancel',
      expect.objectContaining({
        method: 'POST',
        body: '{}',
      }),
    );
    expect(localCiWebSocketUrl('project-1', 'run / 1')).toContain(
      '/api/projects/project-1/local-ci/runs/run%20%2F%201/connect',
    );
  });
});
