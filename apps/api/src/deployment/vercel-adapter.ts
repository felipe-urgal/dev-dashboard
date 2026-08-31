import type { DeploymentProviderState } from '@dev-dashboard/contracts';

import { DeploymentError } from './errors.js';

const DEFAULT_API_BASE_URL = 'https://api.vercel.com';
const DEFAULT_TIMEOUT_MS = 10_000;
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

type VercelFetch = (
  input: string,
  init: {
    headers: Record<string, string>;
    signal: AbortSignal;
  },
) => Promise<VercelFetchResponse>;

export interface VercelProductionDeployment {
  id: string;
  url: string;
  state: DeploymentProviderState;
  createdAt: string;
  branch?: string;
  revision?: string;
}

export interface VercelProductionSnapshot {
  projectId: string;
  projectName: string;
  deployment?: VercelProductionDeployment;
}

export interface VercelDeploymentAdapterOptions {
  token?: string;
  teamId?: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
  fetchRequest?: VercelFetch;
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
  switch (value) {
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

async function readResponseBody(response: VercelFetchResponse): Promise<string> {
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

export class VercelDeploymentAdapter {
  private readonly token: string | undefined;
  private readonly teamId: string | undefined;
  private readonly apiBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchRequest: VercelFetch;

  public constructor(options: VercelDeploymentAdapterOptions = {}) {
    this.token = options.token?.trim() || process.env.VERCEL_TOKEN?.trim();
    this.teamId = options.teamId?.trim() || process.env.VERCEL_TEAM_ID?.trim();
    this.apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchRequest =
      options.fetchRequest ??
      ((input, init) => fetch(input, init) as Promise<VercelFetchResponse>);
  }

  public async readProduction(
    externalProject: string,
  ): Promise<VercelProductionSnapshot> {
    if (!this.token) {
      throw new DeploymentError(
        'DEPLOYMENT_PROVIDER_INTEGRATION_UNAVAILABLE',
        'A integração Vercel não está configurada neste Dev Dashboard.',
      );
    }

    const project = await this.readProject(externalProject);
    const response = await this.request('/v7/deployments', {
      projectId: project.id,
      target: 'production',
      limit: '20',
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

  private async readProject(
    externalProject: string,
  ): Promise<{ id: string; name: string }> {
    const response = await this.request(
      `/v9/projects/${encodeURIComponent(externalProject)}`,
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

  private parseDeployment(
    value: Record<string, unknown>,
  ): VercelProductionDeployment {
    const id =
      boundedString(value.id, 256) ?? boundedString(value.uid, 256);
    const url = boundedString(value.url, 2048);
    const state = boundedString(value.state, 64);
    const created = value.created;
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
    const branch = boundedString(meta?.githubCommitRef, 256);
    const candidateRevision = boundedString(meta?.githubCommitSha, 64);
    const revision =
      candidateRevision && /^[0-9a-f]{40}$/i.test(candidateRevision)
        ? candidateRevision
        : undefined;

    return {
      id,
      url: normalizeUrl(url),
      state: normalizeState(state),
      createdAt: createdAt.toISOString(),
      ...(branch ? { branch } : {}),
      ...(revision ? { revision } : {}),
    };
  }

  private async request(
    pathname: string,
    params: Record<string, string> = {},
  ): Promise<unknown> {
    const url = new URL(pathname, this.apiBaseUrl);
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, value);
    }
    if (this.teamId) url.searchParams.set('teamId', this.teamId);

    let response: VercelFetchResponse;
    try {
      response = await this.fetchRequest(url.toString(), {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
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
