import http from 'node:http';
import { performance } from 'node:perf_hooks';

import type {
  ProjectServerHealth,
  ServerHealthStatus,
} from '@dev-dashboard/contracts';

const HEALTH_CHECK_TIMEOUT_MS = 2_000;

interface HealthAttempt {
  httpStatus: number;
  latencyMs: number;
}

export interface CheckServerHealthInput {
  projectId: string;
  port: number;
  healthCheckPath: string;
}

export type ServerHealthRequester = (
  port: number,
  path: string,
) => Promise<HealthAttempt>;

function classifyStatus(httpStatus: number): ServerHealthStatus {
  if (httpStatus >= 200 && httpStatus < 300) {
    return 'healthy';
  }

  if (httpStatus >= 300 && httpStatus < 400) {
    return 'degraded';
  }

  return 'unavailable';
}

function requestLocalHealth(
  port: number,
  path: string,
): Promise<HealthAttempt> {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers: {
          Accept: 'text/plain, application/json;q=0.9, */*;q=0.1',
          Host: `localhost:${port}`,
        },
        timeout: HEALTH_CHECK_TIMEOUT_MS,
      },
      (response) => {
        const httpStatus = response.statusCode ?? 0;
        response.destroy();
        resolve({
          httpStatus,
          latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        });
      },
    );

    request.once('timeout', () => {
      request.destroy(new Error('O health check excedeu o tempo limite.'));
    });
    request.once('error', reject);
    request.end();
  });
}

export class ServerHealthCheckService {
  public constructor(
    private readonly requester: ServerHealthRequester = requestLocalHealth,
  ) {}

  public async check(
    input: CheckServerHealthInput,
  ): Promise<ProjectServerHealth> {
    const checkedAt = new Date().toISOString();
    try {
      const attempt = await this.requester(input.port, input.healthCheckPath);

      return {
        projectId: input.projectId,
        path: input.healthCheckPath,
        pathSource: 'configured',
        status: classifyStatus(attempt.httpStatus),
        httpStatus: attempt.httpStatus,
        latencyMs: attempt.latencyMs,
        checkedAt,
      };
    } catch {
      // Nenhum detalhe de rede do projeto é devolvido ao navegador.
    }

    return {
      projectId: input.projectId,
      path: input.healthCheckPath,
      pathSource: 'configured',
      status: 'unavailable',
      checkedAt,
      message: 'O servidor local não respondeu ao health check.',
    };
  }
}
