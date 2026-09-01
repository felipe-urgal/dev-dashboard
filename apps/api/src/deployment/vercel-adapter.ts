import type { DeploymentProviderState } from '@dev-dashboard/contracts';

import { DeploymentError } from './errors.js';
import type { GitHubRepositoryReference } from './github-origin.js';

const DEFAULT_API_BASE_URL = 'https://api.vercel.com';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_DEPLOY_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const QUOTA_ERROR_CODES = new Set([
  'rate_limited',
  'api-deployments-free-per-day',
]);

interface VercelBodyReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel(reason?: unknown): Promise<void>;
  releaseLock(): void;
}

interface VercelFetchResponse {
  ok: boolean;
  status: number;
  body?: {
    getReader(): VercelBodyReader;
  } | null;
  text(): Promise<string>;
}

interface VercelFetchInit {
  method: 'GET' | 'POST' | 'PATCH';
  headers: Record<string, string>;
  body?: string;
  signal: AbortSignal;
}

type VercelFetch = (
  input: string,
  init: VercelFetchInit,
) => Promise<VercelFetchResponse>;

export interface VercelProductionDeployment {
  id: string;
  url: string;
  state: DeploymentProviderState;
  createdAt: string;
  branch?: string;
  revision?: string;
}

export interface VercelResolvedProject {
  id: string;
  name: string;
}

export interface VercelProductionSnapshot {
  projectId: string;
  projectName: string;
  deployment?: VercelProductionDeployment;
}

export interface VercelProductionDeployRequest {
  repository: GitHubRepositoryReference;
  branch: string;
  revision: string;
  signal: AbortSignal;
  providerProject?: VercelResolvedProject;
  onStatus?: (message: string) => void;
}

export interface VercelProductionDeployResult {
  cancelled: boolean;
  deployment?: VercelProductionDeployment;
}

export interface VercelDeploymentAdapterOptions {
  token?: string;
  teamId?: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
  deployTimeoutMs?: number;
  pollIntervalMs?: number;
  fetchRequest?: VercelFetch;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<boolean>;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maxLength
    ? value
    : undefined;
}

function providerErrorCode(value: unknown): string | undefined {
  const error = record(record(value)?.error);
  return boundedString(error?.code, 128);
}

function normalizeState(value: string): DeploymentProviderState {
  switch (value.toUpperCase()) {
    case 'QUEUED':
    case 'INITIALIZING':
      return 'queued';
    case 'BUILDING':
      return 'building';
    case 'READY':
      return 'ready';
    case 'ERROR':
      return 'error';
    case 'CANCELED':
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

function invalidProviderResponse(message: string): DeploymentError {
  return new DeploymentError('DEPLOYMENT_PROVIDER_RESPONSE_INVALID', message);
}

function normalizeUrl(value: string): string {
  try {
    const hasExplicitScheme = /^[a-z][a-z\d+.-]*:/i.test(value);
    if (hasExplicitScheme && !/^https:\/\//i.test(value)) {
      throw new Error('Esquema de URL inválido');
    }

    const parsed = new URL(hasExplicitScheme ? value : `https://${value}`);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      throw new Error('URL inválida');
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    throw invalidProviderResponse(
      'A Vercel retornou uma URL de deployment inválida.',
    );
  }
}

function responseError(
  status: number,
  code: string | undefined,
): DeploymentError {
  if (status === 401 || status === 403) {
    return new DeploymentError(
      'DEPLOYMENT_PROVIDER_AUTH_FAILED',
      'A autenticação local com a Vercel não foi aceita.',
    );
  }
  if (status === 429 || (code && QUOTA_ERROR_CODES.has(code))) {
    return new DeploymentError(
      'DEPLOYMENT_PROVIDER_QUOTA_EXCEEDED',
      'A Vercel informou limite ou cota temporariamente indisponível.',
    );
  }
  if (status === 404) {
    return new DeploymentError(
      'DEPLOYMENT_PROVIDER_PROJECT_NOT_FOUND',
      'O projeto Vercel declarado no contrato não foi encontrado.',
    );
  }
  return new DeploymentError(
    'DEPLOYMENT_PROVIDER_UNAVAILABLE',
    'A Vercel não respondeu com um estado operacional utilizável.',
  );
}

async function readResponseBody(
  response: VercelFetchResponse,
): Promise<string> {
  if (!response.body) {
    const body = await response.text();
    if (Buffer.byteLength(body, 'utf8') > MAX_RESPONSE_BYTES) {
      throw invalidProviderResponse(
        'A resposta da Vercel excedeu o limite aceito pelo Dev Dashboard.',
      );
    }
    return body;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let body = '';

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!chunk.value) continue;

      totalBytes += chunk.value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw invalidProviderResponse(
          'A resposta da Vercel excedeu o limite aceito pelo Dev Dashboard.',
        );
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock();
  }
}

function defaultSleep(
  milliseconds: number,
  signal: AbortSignal,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve(true);
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener('abort', abort, { once: true });
  });
}

export class VercelDeploymentAdapter {
  private readonly token: string | undefined;
  private readonly teamId: string | undefined;
  private readonly apiBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly deployTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly fetchRequest: VercelFetch;
  private readonly sleep: (
    milliseconds: number,
    signal: AbortSignal,
  ) => Promise<boolean>;

  public constructor(options: VercelDeploymentAdapterOptions = {}) {
    this.token = options.token?.trim() || process.env.VERCEL_TOKEN?.trim();
    this.teamId = options.teamId?.trim() || process.env.VERCEL_TEAM_ID?.trim();
    this.apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.deployTimeoutMs = options.deployTimeoutMs ?? DEFAULT_DEPLOY_TIMEOUT_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.fetchRequest =
      options.fetchRequest ??
      ((input, init) => fetch(input, init) as Promise<VercelFetchResponse>);
    this.sleep = options.sleep ?? defaultSleep;
  }

  public async readProduction(
    externalProject: string,
    signal?: AbortSignal,
  ): Promise<VercelProductionSnapshot> {
    this.assertConfigured();
    const project = await this.readProject(externalProject, signal);
    const response = await this.request('/v7/deployments', {
      params: {
        projectId: project.id,
        target: 'production',
        limit: '20',
      },
      ...(signal ? { signal } : {}),
    });
    const parsed = record(response);
    if (!Array.isArray(parsed?.deployments)) {
      throw invalidProviderResponse(
        'A Vercel retornou uma lista de deployments inválida.',
      );
    }

    let deployment: VercelProductionDeployment | undefined;
    for (const candidate of parsed.deployments) {
      const value = record(candidate);
      if (value?.target !== 'production') continue;
      deployment = this.parseDeployment(value);
      break;
    }

    return {
      projectId: project.id,
      projectName: project.name,
      ...(deployment ? { deployment } : {}),
    };
  }

  public async deployProduction(
    externalProject: string,
    request: VercelProductionDeployRequest,
  ): Promise<VercelProductionDeployResult> {
    this.assertConfigured();
    if (request.signal.aborted) return { cancelled: true };

    const project =
      request.providerProject ??
      (await this.readProject(externalProject, request.signal));
    if (request.signal.aborted) return { cancelled: true };

    const created = await this.request('/v13/deployments', {
      method: 'POST',
      body: {
        name: project.name,
        target: 'production',
        gitSource: {
          type: 'github',
          org: request.repository.owner,
          repo: request.repository.repo,
          ref: request.branch,
          sha: request.revision,
        },
      },
      signal: request.signal,
    }).catch((error: unknown) => {
      if (request.signal.aborted) return undefined;
      throw error;
    });
    if (!created || request.signal.aborted) return { cancelled: true };

    const createdRecord = record(created);
    const deploymentId =
      boundedString(createdRecord?.id, 256) ??
      boundedString(createdRecord?.uid, 256);
    if (!deploymentId) {
      throw invalidProviderResponse(
        'A Vercel não retornou o ID do deployment recém-criado.',
      );
    }

    request.onStatus?.(`Deployment Vercel iniciado: ${deploymentId}\n`);
    const deadline = Date.now() + this.deployTimeoutMs;
    let lastState: DeploymentProviderState | undefined;

    while (Date.now() < deadline) {
      if (request.signal.aborted) {
        await this.cancelDeployment(deploymentId);
        return { cancelled: true };
      }

      let deployment: VercelProductionDeployment;
      try {
        deployment = await this.readDeployment(deploymentId, request.signal);
      } catch (error) {
        if (request.signal.aborted) {
          await this.cancelDeployment(deploymentId);
          return { cancelled: true };
        }
        throw error;
      }

      if (deployment.state !== lastState) {
        request.onStatus?.(`Vercel: ${deployment.state}\n`);
        lastState = deployment.state;
      }

      if (deployment.state === 'ready') {
        if (deployment.revision && deployment.revision !== request.revision) {
          throw invalidProviderResponse(
            'A Vercel publicou uma revisão diferente da revisão confirmada no plano.',
          );
        }
        if (deployment.branch && deployment.branch !== request.branch) {
          throw invalidProviderResponse(
            'A Vercel publicou uma branch diferente da branch confirmada no plano.',
          );
        }
        request.onStatus?.(`Vercel pronta: ${deployment.url}\n`);
        return { cancelled: false, deployment };
      }
      if (deployment.state === 'error') {
        throw new DeploymentError(
          'DEPLOYMENT_PROVIDER_UNAVAILABLE',
          'O deployment de produção terminou com erro na Vercel.',
        );
      }
      if (deployment.state === 'cancelled') {
        if (request.signal.aborted) return { cancelled: true };
        throw new DeploymentError(
          'DEPLOYMENT_PROVIDER_UNAVAILABLE',
          'O deployment de produção foi cancelado na Vercel.',
        );
      }

      const continued = await this.sleep(this.pollIntervalMs, request.signal);
      if (!continued) {
        await this.cancelDeployment(deploymentId);
        return { cancelled: true };
      }
    }

    await this.cancelDeployment(deploymentId);
    throw new DeploymentError(
      'DEPLOYMENT_PROVIDER_UNAVAILABLE',
      'A Vercel não concluiu o deployment dentro do tempo limite configurado.',
    );
  }

  private assertConfigured(): void {
    if (!this.token) {
      throw new DeploymentError(
        'DEPLOYMENT_PROVIDER_INTEGRATION_UNAVAILABLE',
        'A integração Vercel não está configurada neste Dev Dashboard.',
      );
    }
  }

  private async readProject(
    externalProject: string,
    signal?: AbortSignal,
  ): Promise<VercelResolvedProject> {
    const response = await this.request(
      `/v9/projects/${encodeURIComponent(externalProject)}`,
      signal ? { signal } : {},
    );
    const parsed = record(response);
    const id = boundedString(parsed?.id, 256);
    const name = boundedString(parsed?.name, 256);
    if (!id || !name) {
      throw invalidProviderResponse(
        'A Vercel retornou metadados de projeto inválidos.',
      );
    }
    return { id, name };
  }

  private async readDeployment(
    deploymentId: string,
    signal: AbortSignal,
  ): Promise<VercelProductionDeployment> {
    const response = await this.request(
      `/v13/deployments/${encodeURIComponent(deploymentId)}`,
      {
        params: { withGitRepoInfo: 'true' },
        signal,
      },
    );
    const parsed = record(response);
    if (!parsed) {
      throw invalidProviderResponse(
        'A Vercel retornou detalhes de deployment inválidos.',
      );
    }
    return this.parseDeployment(parsed);
  }

  private parseDeployment(
    value: Record<string, unknown>,
  ): VercelProductionDeployment {
    const id = boundedString(value.id, 256) ?? boundedString(value.uid, 256);
    const url = boundedString(value.url, 2048);
    const state =
      boundedString(value.state, 64) ?? boundedString(value.readyState, 64);
    const created = value.created ?? value.createdAt;
    if (
      !id ||
      !url ||
      !state ||
      typeof created !== 'number' ||
      !Number.isFinite(created) ||
      created <= 0
    ) {
      throw invalidProviderResponse(
        'A Vercel retornou metadados de deployment inválidos.',
      );
    }

    const createdAt = new Date(created);
    if (Number.isNaN(createdAt.getTime())) {
      throw invalidProviderResponse(
        'A Vercel retornou um timestamp de deployment inválido.',
      );
    }

    const meta = record(value.meta);
    const gitSource = record(value.gitSource);
    const gitRef = boundedString(gitSource?.ref, 256);
    const branch =
      boundedString(meta?.githubCommitRef, 256) ??
      boundedString(meta?.gitlabCommitRef, 256) ??
      boundedString(meta?.bitbucketCommitRef, 256) ??
      (gitRef && !/^[0-9a-f]{40}$/i.test(gitRef) ? gitRef : undefined);
    const revision = [
      boundedString(meta?.githubCommitSha, 64),
      boundedString(meta?.gitlabCommitSha, 64),
      boundedString(meta?.bitbucketCommitSha, 64),
      boundedString(gitSource?.sha, 64),
      gitRef,
    ].find((candidate) => candidate && /^[0-9a-f]{40}$/i.test(candidate));

    return {
      id,
      url: normalizeUrl(url),
      state: normalizeState(state),
      createdAt: createdAt.toISOString(),
      ...(branch ? { branch } : {}),
      ...(revision ? { revision } : {}),
    };
  }

  private async cancelDeployment(deploymentId: string): Promise<void> {
    await this.request(
      `/v12/deployments/${encodeURIComponent(deploymentId)}/cancel`,
      { method: 'PATCH' },
    ).catch(() => undefined);
  }

  private async request(
    pathname: string,
    options: {
      method?: 'GET' | 'POST' | 'PATCH';
      params?: Record<string, string>;
      body?: unknown;
      signal?: AbortSignal;
    } = {},
  ): Promise<unknown> {
    const url = new URL(pathname, this.apiBaseUrl);
    for (const [name, value] of Object.entries(options.params ?? {})) {
      url.searchParams.set(name, value);
    }
    if (this.teamId) url.searchParams.set('teamId', this.teamId);

    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;
    const method = options.method ?? 'GET';
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.token}`,
    };
    const init: VercelFetchInit = { method, headers, signal };
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }

    let response: VercelFetchResponse;
    try {
      response = await this.fetchRequest(url.toString(), init);
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new DeploymentError(
        'DEPLOYMENT_PROVIDER_UNAVAILABLE',
        'Não foi possível consultar a Vercel neste momento.',
      );
    }

    let body: string;
    try {
      body = await readResponseBody(response);
    } catch (error) {
      if (error instanceof DeploymentError) throw error;
      throw new DeploymentError(
        'DEPLOYMENT_PROVIDER_UNAVAILABLE',
        'Não foi possível ler a resposta da Vercel.',
      );
    }

    let parsed: unknown;
    try {
      parsed = body.length > 0 ? JSON.parse(body) : {};
    } catch {
      if (response.ok) {
        throw invalidProviderResponse(
          'A Vercel retornou uma resposta que não é JSON válido.',
        );
      }
    }

    if (!response.ok) {
      throw responseError(response.status, providerErrorCode(parsed));
    }
    if (parsed === undefined) {
      throw invalidProviderResponse(
        'A Vercel retornou uma resposta vazia ou inválida.',
      );
    }
    return parsed;
  }
}
