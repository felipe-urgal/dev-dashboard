import path from 'node:path';

import { browserToolsForCapabilities } from './browser-tool-policy.js';
import type {
  AgentCapability,
  AgentProvider,
  AgentProviderExecutionRequest,
  AgentProviderResult,
  AgentProviderStatus,
} from './contracts.js';

const DEFAULT_BROWSER_PORT = 43_821;
const DEFAULT_EXECUTION_TIMEOUT_MS = 45 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_HEARTBEAT_MAX_AGE_MS = 30_000;
const MAX_PROVIDER_SUMMARY_CHARS = 32_000;

export type BrowserBridgeJobState =
  | 'queued'
  | 'claimed'
  | 'running'
  | 'finished'
  | 'failed'
  | 'timed_out'
  | 'cancelled';

export type BrowserSessionState = 'available' | 'unavailable' | 'unknown';

export interface BrowserBridgeHealth {
  ok: boolean;
  paused?: boolean;
  heartbeatAt?: string | null;
  heartbeatVersion?: string | null;
  sessionState?: BrowserSessionState;
}

export interface BrowserBridgeJob {
  id: string;
  state: BrowserBridgeJobState;
  createdAt?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  errorCode?: string | null;
  browserPhase?: string | null;
}

export interface BrowserBridgeCreateJobRequest {
  prompt: string;
  cwd: string;
  agent: 'chatgpt-browser';
  taskId: string;
  timeoutMs: number;
  repositories: Record<string, string>;
  capabilities: Record<string, boolean>;
  tools: string[];
}

export interface BrowserBridgePort {
  health(): Promise<BrowserBridgeHealth>;
  createJob(request: BrowserBridgeCreateJobRequest): Promise<BrowserBridgeJob>;
  getJob(jobId: string): Promise<BrowserBridgeJob>;
  cancelJob(jobId: string, errorCode?: string): Promise<BrowserBridgeJob>;
}

export type BrowserProviderErrorCode =
  | 'bridge-token-missing'
  | 'bridge-unavailable'
  | 'invalid-bridge-response'
  | 'invalid-cwd'
  | 'invalid-request'
  | 'provider-unavailable';

export class BrowserProviderError extends Error {
  constructor(
    readonly code: BrowserProviderErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'BrowserProviderError';
  }
}

export interface HttpBrowserBridgeClientOptions {
  token?: string;
  getToken?: () => string | Promise<string>;
  host?: string;
  port?: number;
  fetchFn?: typeof fetch;
}

export interface ChatGptBrowserAgentProviderOptions {
  bridge: BrowserBridgePort;
  resolveCwd: (
    request: AgentProviderExecutionRequest,
  ) => string | Promise<string>;
  resolveRepositories?: (
    request: AgentProviderExecutionRequest,
    cwd: string,
  ) => Record<string, string> | Promise<Record<string, string>>;
  executionTimeoutMs?: number;
  pollIntervalMs?: number;
  heartbeatMaxAgeMs?: number;
  now?: () => string;
  sleep?: (ms: number) => Promise<void>;
}

interface BridgeErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertBridgeJob(value: unknown): BrowserBridgeJob {
  if (!isPlainObject(value)) {
    throw new BrowserProviderError(
      'invalid-bridge-response',
      'browser bridge returned an invalid job',
    );
  }

  const id = value.id;
  const state = value.state;
  const states: readonly BrowserBridgeJobState[] = [
    'queued',
    'claimed',
    'running',
    'finished',
    'failed',
    'timed_out',
    'cancelled',
  ];

  if (
    typeof id !== 'string' ||
    !id ||
    typeof state !== 'string' ||
    !states.includes(state as BrowserBridgeJobState)
  ) {
    throw new BrowserProviderError(
      'invalid-bridge-response',
      'browser bridge returned an invalid job',
    );
  }

  return value as unknown as BrowserBridgeJob;
}

function assertBridgeHealth(value: unknown): BrowserBridgeHealth {
  if (!isPlainObject(value) || typeof value.ok !== 'boolean') {
    throw new BrowserProviderError(
      'invalid-bridge-response',
      'browser bridge returned an invalid health response',
    );
  }
  return value as unknown as BrowserBridgeHealth;
}

export class HttpBrowserBridgeClient implements BrowserBridgePort {
  private readonly host: string;
  private readonly port: number;
  private readonly fetchFn: typeof fetch;
  private token: string | undefined;

  constructor(private readonly options: HttpBrowserBridgeClientOptions) {
    this.host = options.host ?? '127.0.0.1';
    this.port = options.port ?? DEFAULT_BROWSER_PORT;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
    this.token = options.token?.trim() || undefined;

    if (this.host !== '127.0.0.1') {
      throw new Error('Browser Bridge accepts only loopback 127.0.0.1');
    }
    if (!Number.isInteger(this.port) || this.port < 1 || this.port > 65_535) {
      throw new Error('Browser Bridge port is invalid');
    }
    if (typeof this.fetchFn !== 'function') {
      throw new Error('fetch is required for Browser Bridge');
    }
  }

  private async resolveToken(): Promise<string> {
    if (this.token) return this.token;
    const loaded = await this.options.getToken?.();
    const value = typeof loaded === 'string' ? loaded.trim() : '';
    if (!value) {
      throw new BrowserProviderError(
        'bridge-token-missing',
        'browser bridge token is unavailable',
      );
    }
    this.token = value;
    return value;
  }

  private async request(
    pathname: string,
    init: { method?: 'GET' | 'POST'; body?: unknown } = {},
  ): Promise<unknown> {
    const token = await this.resolveToken();
    let response: Response;

    try {
      response = await this.fetchFn(
        `http://${this.host}:${this.port}${pathname}`,
        {
          method: init.method ?? 'GET',
          headers: {
            'x-agent-bridge-token': token,
            ...(init.body === undefined
              ? {}
              : { 'content-type': 'application/json' }),
          },
          ...(init.body === undefined
            ? {}
            : { body: JSON.stringify(init.body) }),
        },
      );
    } catch (error) {
      throw new BrowserProviderError(
        'bridge-unavailable',
        'browser bridge is unavailable',
        { cause: error },
      );
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // Invalid payload is handled below without exposing raw response content.
    }

    if (!response.ok) {
      const bridgeError = isPlainObject(payload)
        ? (payload as BridgeErrorPayload).error
        : undefined;
      throw new BrowserProviderError(
        response.status >= 500
          ? 'bridge-unavailable'
          : 'invalid-bridge-response',
        bridgeError?.message?.slice(0, 240) ||
          `browser bridge returned HTTP ${response.status}`,
      );
    }

    return payload;
  }

  async health(): Promise<BrowserBridgeHealth> {
    return assertBridgeHealth(await this.request('/v1/health'));
  }

  async createJob(
    request: BrowserBridgeCreateJobRequest,
  ): Promise<BrowserBridgeJob> {
    return assertBridgeJob(
      await this.request('/v1/jobs', { method: 'POST', body: request }),
    );
  }

  async getJob(jobId: string): Promise<BrowserBridgeJob> {
    return assertBridgeJob(
      await this.request(`/v1/jobs/${encodeURIComponent(jobId)}`),
    );
  }

  async cancelJob(
    jobId: string,
    errorCode = 'cancelled',
  ): Promise<BrowserBridgeJob> {
    return assertBridgeJob(
      await this.request(`/v1/jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: 'POST',
        body: { errorCode },
      }),
    );
  }
}

function validateSummary(request: AgentProviderExecutionRequest): string {
  const summary = request.summary.trim();
  if (!summary) {
    throw new BrowserProviderError(
      'invalid-request',
      'provider request summary is required',
    );
  }
  if (summary.length > MAX_PROVIDER_SUMMARY_CHARS) {
    throw new BrowserProviderError(
      'invalid-request',
      'provider request summary exceeds the supported limit',
    );
  }
  return summary;
}

async function resolveOwnedCwd(
  resolver: ChatGptBrowserAgentProviderOptions['resolveCwd'],
  request: AgentProviderExecutionRequest,
): Promise<string> {
  const value = String(await resolver(request)).trim();
  if (!value || value.includes('\0') || !path.isAbsolute(value)) {
    throw new BrowserProviderError(
      'invalid-cwd',
      'provider cwd must be an absolute backend-owned path',
    );
  }
  return path.normalize(value);
}

const BROWSER_TOOL_CONTRACTS: Readonly<Record<string, string>> = {
  list_files:
    'list_files args={"path":"relative directory optional","offset":0,"limit":100}',
  read_file:
    'read_file args={"path":"relative file","startLine":1,"endLine":200}',
  search_text:
    'search_text args={"query":"text","path":"relative directory optional","limit":50,"caseSensitive":false}',
  git_status: 'git_status args={}',
  git_diff: 'git_diff args={"staged":false,"path":"relative path optional"}',
  git_log: 'git_log args={"count":20}',
  git_branch: 'git_branch args={}',
  apply_patch:
    'apply_patch args={"path":"relative file","patch":"unified diff for exactly that file"}',
  run_process:
    'run_process args={"executable":"allowed executable","argv":["..."],"timeoutMs":120000}',
};

function buildPrompt(
  request: AgentProviderExecutionRequest,
  repositories: Readonly<Record<string, string>>,
  tools: readonly string[],
): string {
  const summary = validateSummary(request);
  const capabilities =
    request.allowedCapabilities.length > 0
      ? request.allowedCapabilities.join(', ')
      : 'none';
  const aliases = Object.keys(repositories);
  const exampleRepo = aliases[0] ?? 'project';

  const requestExample = JSON.stringify({
    type: 'tool_request',
    toolCallId: 'call-1',
    tool: 'read_file',
    repo: exampleRepo,
    args: { path: 'README.md' },
  });
  const terminalExample = JSON.stringify({
    type: 'terminal_result',
    status: 'completed',
  });

  return [
    summary,
    ...(request.continuationInstruction
      ? ['', 'Continuation instruction:', request.continuationInstruction.trim()]
      : []),
    '',
    'Browser Local Tool Gateway:',
    '- Use only the structured tools exposed by the Browser Bridge.',
    '- Never request shell text, credentials, cookies or absolute host paths.',
    '- Emit exactly one executable envelope per assistant turn.',
    '- Executable envelopes must use a fenced block named agent-workflow-browser.',
    '- Granted capabilities: ' + capabilities + '.',
    '- Protected actions that are not explicitly exposed by a tool are forbidden.',
    '',
    'Repository aliases:',
    ...(aliases.length > 0 ? aliases.map((alias) => '- ' + alias) : ['- none']),
    '',
    'Available tools:',
    ...(tools.length > 0
      ? tools.map(
          (tool) => '- ' + (BROWSER_TOOL_CONTRACTS[tool] ?? tool + ' args={}'),
        )
      : ['- none']),
    '',
    'Tool request example:',
    '```agent-workflow-browser',
    requestExample,
    '```',
    '',
    'Completion example:',
    '```agent-workflow-browser',
    terminalExample,
    '```',
    '',
    'Treat tool errors and truncation as evidence. Do not invent success or local state.',
  ].join('\n');
}

function capabilityMap(
  capabilities: readonly AgentCapability[],
): Record<string, boolean> {
  return Object.fromEntries(
    capabilities.map((capability) => [capability, true]),
  );
}

function terminalResult(job: BrowserBridgeJob): AgentProviderResult | null {
  if (job.state === 'finished') {
    return {
      providerId: 'chatgpt-browser',
      outcome: 'succeeded',
      summary: 'ChatGPT Browser completed successfully',
    };
  }

  if (job.state === 'cancelled') {
    return {
      providerId: 'chatgpt-browser',
      outcome: 'cancelled',
      summary: 'ChatGPT Browser execution cancelled',
      failure: {
        kind: 'known',
        code: job.errorCode || 'cancelled',
        message: 'ChatGPT Browser execution cancelled',
      },
    };
  }

  if (job.state === 'timed_out') {
    return {
      providerId: 'chatgpt-browser',
      outcome: 'failed',
      summary: 'ChatGPT Browser execution timed out',
      failure: {
        kind: 'known',
        code: job.errorCode || 'browser-timeout',
        message: 'ChatGPT Browser execution timed out',
      },
    };
  }

  if (job.state === 'failed') {
    const ambiguous =
      job.errorCode === 'unknown_after_submit' ||
      job.errorCode === 'tool-call-ambiguous' ||
      job.errorCode === 'tool_call_ambiguous';

    return {
      providerId: 'chatgpt-browser',
      outcome: ambiguous ? 'unknown' : 'failed',
      summary: ambiguous
        ? 'ChatGPT Browser execution result is ambiguous'
        : 'ChatGPT Browser execution failed',
      failure: {
        kind: ambiguous ? 'ambiguous' : 'known',
        code: job.errorCode || 'browser-failed',
        message: ambiguous
          ? 'ChatGPT Browser may have performed work before the failure'
          : 'ChatGPT Browser execution failed',
      },
    };
  }

  return null;
}

export class ChatGptBrowserAgentProvider implements AgentProvider {
  readonly id = 'chatgpt-browser' as const;
  private readonly executionTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly heartbeatMaxAgeMs: number;
  private readonly now: () => string;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: ChatGptBrowserAgentProviderOptions) {
    if (!options.bridge) throw new Error('browser bridge is required');
    if (typeof options.resolveCwd !== 'function') {
      throw new Error('resolveCwd is required');
    }

    this.executionTimeoutMs =
      options.executionTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.heartbeatMaxAgeMs =
      options.heartbeatMaxAgeMs ?? DEFAULT_HEARTBEAT_MAX_AGE_MS;
    this.now = options.now ?? (() => new Date().toISOString());
    this.sleep =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async status(): Promise<AgentProviderStatus> {
    let health: BrowserBridgeHealth;
    try {
      health = await this.options.bridge.health();
    } catch (error) {
      const reason =
        error instanceof BrowserProviderError &&
        error.code === 'bridge-token-missing'
          ? 'browser bridge token unavailable'
          : 'browser bridge unavailable';
      return {
        providerId: this.id,
        availability: 'unavailable',
        observedAt: this.now(),
        reason,
      };
    }

    if (!health.ok) {
      return {
        providerId: this.id,
        availability: 'degraded',
        observedAt: this.now(),
        reason: 'browser bridge unhealthy',
      };
    }
    if (health.paused) {
      return {
        providerId: this.id,
        availability: 'degraded',
        observedAt: this.now(),
        reason: 'browser bridge paused',
      };
    }
    if (!health.heartbeatAt) {
      return {
        providerId: this.id,
        availability: 'degraded',
        observedAt: this.now(),
        reason: 'browser extension unavailable',
      };
    }

    const heartbeatAt = Date.parse(health.heartbeatAt);
    const observedAt = Date.parse(this.now());
    if (
      Number.isFinite(heartbeatAt) &&
      Number.isFinite(observedAt) &&
      observedAt - heartbeatAt > this.heartbeatMaxAgeMs
    ) {
      return {
        providerId: this.id,
        availability: 'degraded',
        observedAt: this.now(),
        reason: 'browser extension heartbeat stale',
      };
    }

    if (health.sessionState === 'unavailable') {
      return {
        providerId: this.id,
        availability: 'degraded',
        observedAt: this.now(),
        reason: 'ChatGPT session unavailable',
      };
    }

    return {
      providerId: this.id,
      availability: 'available',
      observedAt: this.now(),
      ...(health.heartbeatVersion ? { version: health.heartbeatVersion } : {}),
    };
  }

  supports(): boolean {
    return true;
  }

  async execute(
    request: AgentProviderExecutionRequest,
  ): Promise<AgentProviderResult> {
    const status = await this.status();
    if (status.availability !== 'available') {
      throw new BrowserProviderError(
        'provider-unavailable',
        status.reason || 'ChatGPT Browser provider is unavailable',
      );
    }

    const cwd = await resolveOwnedCwd(this.options.resolveCwd, request);
    const repositories = this.options.resolveRepositories
      ? await this.options.resolveRepositories(request, cwd)
      : { project: cwd };
    const tools = browserToolsForCapabilities(request.allowedCapabilities);
    const prompt = buildPrompt(request, repositories, tools);

    const job = await this.options.bridge.createJob({
      prompt,
      cwd,
      agent: 'chatgpt-browser',
      taskId: request.taskId,
      timeoutMs: this.executionTimeoutMs,
      repositories,
      capabilities: capabilityMap(request.allowedCapabilities),
      tools,
    });

    let cancelled = false;
    const cancel = async (code: string) => {
      if (cancelled) return;
      cancelled = true;
      try {
        await this.options.bridge.cancelJob(job.id, code);
      } catch {
        // Cancellation is best-effort; the provider still reports ambiguity below
        // if the bridge state cannot be proven.
      }
    };

    const startedAt = Date.parse(this.now());
    while (true) {
      if (request.signal?.aborted) {
        await cancel('cancelled');
        return {
          providerId: this.id,
          outcome: 'cancelled',
          summary: 'ChatGPT Browser execution cancelled',
          failure: {
            kind: 'known',
            code: 'cancelled',
            message: 'ChatGPT Browser execution cancelled',
          },
        };
      }

      let current: BrowserBridgeJob;
      try {
        current = await this.options.bridge.getJob(job.id);
      } catch {
        return {
          providerId: this.id,
          outcome: 'unknown',
          summary: 'ChatGPT Browser job state is unavailable',
          failure: {
            kind: 'ambiguous',
            code: 'browser-state-unavailable',
            message:
              'ChatGPT Browser job state could not be verified after creation',
          },
        };
      }

      const terminal = terminalResult(current);
      if (terminal) return terminal;

      const now = Date.parse(this.now());
      if (
        Number.isFinite(startedAt) &&
        Number.isFinite(now) &&
        now - startedAt >= this.executionTimeoutMs
      ) {
        await cancel('provider_timeout');
        return {
          providerId: this.id,
          outcome: 'failed',
          summary: 'ChatGPT Browser execution timed out',
          failure: {
            kind: 'known',
            code: 'provider-timeout',
            message: 'ChatGPT Browser execution timed out',
          },
        };
      }

      await this.sleep(this.pollIntervalMs);
    }
  }
}
