import http from 'node:http';
import { performance } from 'node:perf_hooks';

import type {
  ProjectServerHealth,
  ServerHealthStatus,
} from '@dev-dashboard/contracts';

const HEALTH_CHECK_PATHS = [
  '/up',
  '/health',
  '/healthz',
  '/',
] as const;

const HEALTH_CHECK_TIMEOUT_MS = 2_000;

interface HealthAttempt {
  httpStatus: number;
  latencyMs: number;
}

export interface CheckServerHealthInput {
  projectId: string;
  port: number;
  healthCheckPath?: string;
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
          latencyMs: Math.max(
            0,
            Math.round(performance.now() - startedAt),
          ),
        });
      },
    );

    request.once('timeout', () => {
      request.destroy(
        new Error('O health check excedeu o tempo limite.'),
      );
    });
    request.once('error', reject);
    request.end();
  });
}

export class ServerHealthCheckService {
  public constructor(
    private readonly requester: ServerHealthRequester =
      requestLocalHealth,
  ) {}

  public async check(
    input: CheckServerHealthInput,
  ): Promise<ProjectServerHealth> {
    const checkedAt = new Date().toISOString();
    const paths = input.healthCheckPath
      ? [input.healthCheckPath]
      : [...HEALTH_CHECK_PATHS];
    let fallback:
      | (HealthAttempt & { path: string })
      | undefined;

    for (const path of paths) {
      try {
        const attempt = await this.requester(
          input.port,
          path,
        );
        const candidate = { ...attempt, path };
        const status = classifyStatus(attempt.httpStatus);

        fallback ??= candidate;

        if (
          input.healthCheckPath ||
          status === 'healthy' ||
          status === 'degraded'
        ) {
          return {
            projectId: input.projectId,
            path,
            pathSource: input.healthCheckPath
              ? 'configured'
              : 'detected',
            status,
            httpStatus: attempt.httpStatus,
            latencyMs: attempt.latencyMs,
            checkedAt,
          };
        }
      } catch {
        // A detecção tenta o próximo caminho conhecido. Nenhum detalhe
        // de rede do projeto é devolvido ao navegador.
      }
    }

    return {
      projectId: input.projectId,
      path: input.healthCheckPath ?? fallback?.path ?? '/',
      pathSource: input.healthCheckPath
        ? 'configured'
        : 'detected',
      status: 'unavailable',
      ...(fallback
        ? {
            httpStatus: fallback.httpStatus,
            latencyMs: fallback.latencyMs,
          }
        : {}),
      checkedAt,
      message: fallback
        ? 'Nenhum endpoint respondeu como saudável.'
        : 'O servidor local não respondeu ao health check.',
    };
  }
}
