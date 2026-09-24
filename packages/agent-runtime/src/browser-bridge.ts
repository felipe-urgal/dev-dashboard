import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import {
  BrowserJobStore,
  BrowserJobStoreError,
  type BrowserStoredJob,
} from './browser-job-store.js';
import type {
  BrowserBridgeCreateJobRequest,
  BrowserSessionState,
} from './browser-provider.js';
import {
  BrowserToolExecutionError,
  createBrowserToolExecutor,
  type BrowserToolExecutor,
} from './browser-tool-executor.js';
import {
  BrowserToolProtocolError,
  assertBrowserTerminalResult,
  assertBrowserToolRequest,
} from './browser-tool-protocol.js';
import {
  authorizeBrowserToolCall,
  buildBrowserToolPolicy,
  isMutatingBrowserTool,
  type BrowserToolPolicy,
} from './browser-tool-policy.js';
import {
  BrowserToolCallStore,
  BrowserToolCallStoreError,
  type BrowserToolCallRecord,
} from './browser-tool-store.js';
import type { AgentCapability } from './contracts.js';

const MAX_BODY_BYTES = 32 * 1024;
const MAX_TOOL_BODY_BYTES = 256 * 1024;
const MAX_PROMPT_BYTES = 24 * 1024;

export interface BrowserBridgeOptions {
  stateDir: string;
  host?: string;
  port?: number;
  token?: string;
  now?: () => number;
  jobStore?: BrowserJobStore;
  toolStore?: BrowserToolCallStore;
  toolExecutorFactory?: (input: {
    job: BrowserStoredJob;
    policy: BrowserToolPolicy;
  }) => BrowserToolExecutor;
}

export class BrowserBridgeHttpError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 409,
  ) {
    super(message);
    this.name = 'BrowserBridgeHttpError';
  }
}

interface ActiveToolExecution {
  jobId: string;
  toolCallId: string;
  controller: AbortController;
  promise: Promise<unknown>;
}

function fail(
  code: string,
  message: string,
  statusCode = 409,
): BrowserBridgeHttpError {
  return new BrowserBridgeHttpError(code, message, statusCode);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertKnownFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) {
    throw fail(
      'unknown-field',
      `unknown browser bridge field: ${unknown}`,
      400,
    );
  }
}

function headerString(value: string | string[] | undefined): string | null {
  return typeof value === 'string' && value ? value : null;
}

function isAllowedOrigin(origin: string | null): boolean {
  return (
    origin === null ||
    origin === 'https://chatgpt.com' ||
    origin.startsWith('chrome-extension://')
  );
}

function safeMessage(value: unknown, fallback: string): string {
  return String(value || fallback).slice(0, 240);
}

function publicJob(
  job: BrowserStoredJob | null,
): Record<string, unknown> | null {
  if (!job) return null;
  return {
    id: job.id,
    state: job.state,
    taskId: job.taskId,
    agent: job.agent,
    createdAt: job.createdAt,
    deadlineAt: job.deadlineAt,
    claimedAt: job.claimedAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    errorCode: job.errorCode,
    browserPhase: job.browserPhase,
    repositories: Object.keys(job.repositories),
    capabilities: { ...job.capabilities },
    tools: [...job.tools],
  };
}

function claimedJob(job: BrowserStoredJob): Record<string, unknown> {
  return {
    ...publicJob(job),
    prompt: job.prompt,
    leaseId: job.leaseId,
  };
}

function publicToolCall(call: BrowserToolCallRecord): Record<string, unknown> {
  return {
    jobId: call.jobId,
    toolCallId: call.toolCallId,
    state: call.state,
    mutable: call.mutable,
    result: call.result,
    error: call.error,
    createdAt: call.createdAt,
    updatedAt: call.updatedAt,
  };
}

function storedToolEnvelope(
  call: BrowserToolCallRecord,
): Record<string, unknown> | null {
  if (call.state === 'succeeded') {
    return {
      type: 'tool_result',
      toolCallId: call.toolCallId,
      ok: true,
      result: call.result,
    };
  }

  if (call.state === 'failed') {
    return {
      type: 'tool_error',
      toolCallId: call.toolCallId,
      code: call.error?.code ?? 'tool-failed',
      message: call.error?.message ?? 'browser tool failed',
    };
  }

  if (call.state === 'ambiguous') {
    return {
      type: 'tool_error',
      toolCallId: call.toolCallId,
      code: 'tool-call-ambiguous',
      message: call.error?.message ?? 'browser tool result is ambiguous',
    };
  }

  return null;
}

function enabledCapabilities(job: BrowserStoredJob): AgentCapability[] {
  return Object.entries(job.capabilities)
    .filter((entry): entry is [AgentCapability, true] => entry[1] === true)
    .map(([capability]) => capability);
}

function policyForJob(job: BrowserStoredJob): BrowserToolPolicy {
  return buildBrowserToolPolicy({
    repositories: job.repositories,
    capabilities: enabledCapabilities(job),
    tools: job.tools,
  });
}

function translateError(error: unknown): BrowserBridgeHttpError {
  if (error instanceof BrowserBridgeHttpError) return error;

  if (error instanceof BrowserJobStoreError) {
    const statusCode =
      error.code === 'job-not-found'
        ? 404
        : error.code === 'invalid-job-id' ||
            error.code === 'invalid-job-request'
          ? 400
          : 409;
    return fail(error.code, error.message, statusCode);
  }

  if (error instanceof BrowserToolProtocolError) {
    return fail(error.code, error.message, 400);
  }

  if (error instanceof BrowserToolCallStoreError) {
    const statusCode =
      error.code === 'tool-call-not-found'
        ? 404
        : error.code === 'invalid-job-id' ||
            error.code === 'invalid-tool-call-id'
          ? 400
          : 409;
    return fail(error.code, error.message, statusCode);
  }

  return fail('internal-error', 'internal browser bridge error', 500);
}

async function readJson(
  request: IncomingMessage,
  maxBytes = MAX_BODY_BYTES,
): Promise<Record<string, unknown>> {
  let bytes = 0;
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBytes) {
      throw fail('body-too-large', 'browser bridge body exceeds limit', 413);
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) return {};

  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw fail('invalid-json', 'browser bridge JSON is invalid', 400);
  }

  if (!isPlainObject(value)) {
    throw fail('invalid-body', 'browser bridge body must be an object', 400);
  }
  return value;
}

function assertCreateJobRequest(
  body: Record<string, unknown>,
): BrowserBridgeCreateJobRequest {
  assertKnownFields(body, [
    'prompt',
    'cwd',
    'agent',
    'taskId',
    'timeoutMs',
    'repositories',
    'capabilities',
    'tools',
  ]);

  if (
    typeof body.prompt !== 'string' ||
    !body.prompt.trim() ||
    Buffer.byteLength(body.prompt, 'utf8') > MAX_PROMPT_BYTES ||
    typeof body.cwd !== 'string' ||
    !path.isAbsolute(body.cwd) ||
    body.cwd.includes('\0') ||
    body.agent !== 'chatgpt-browser' ||
    typeof body.taskId !== 'string' ||
    !body.taskId ||
    typeof body.timeoutMs !== 'number' ||
    !Number.isFinite(body.timeoutMs) ||
    body.timeoutMs < 1_000 ||
    !isPlainObject(body.repositories) ||
    !isPlainObject(body.capabilities) ||
    !Array.isArray(body.tools)
  ) {
    throw fail('invalid-job-request', 'browser job request is invalid', 400);
  }

  const repositories: Record<string, string> = {};
  for (const [alias, root] of Object.entries(body.repositories)) {
    if (typeof root !== 'string') {
      throw fail('invalid-job-request', 'browser repository is invalid', 400);
    }
    repositories[alias] = root;
  }

  const capabilities: Record<string, boolean> = {};
  for (const [capability, enabled] of Object.entries(body.capabilities)) {
    if (typeof enabled !== 'boolean') {
      throw fail('invalid-job-request', 'browser capability is invalid', 400);
    }
    capabilities[capability] = enabled;
  }

  if (body.tools.some((tool) => typeof tool !== 'string')) {
    throw fail('invalid-job-request', 'browser tool is invalid', 400);
  }

  return {
    prompt: body.prompt,
    cwd: body.cwd,
    agent: 'chatgpt-browser',
    taskId: body.taskId,
    timeoutMs: body.timeoutMs,
    repositories,
    capabilities,
    tools: body.tools as string[],
  };
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw fail('invalid-path', 'browser bridge path is invalid', 400);
  }
}

export function browserBridgeTokenPath(stateDir: string): string {
  return path.join(path.resolve(stateDir), 'browser', 'token');
}

export async function readBrowserBridgeToken(
  stateDir: string,
): Promise<string> {
  const token = (
    await fs.readFile(browserBridgeTokenPath(stateDir), 'utf8')
  ).trim();
  if (!token) throw new Error('browser bridge token is unavailable');
  return token;
}

export class BrowserBridge {
  private readonly stateDir: string;
  private readonly host: string;
  private readonly port: number;
  private readonly now: () => number;
  private readonly jobStore: BrowserJobStore;
  private readonly toolStore: BrowserToolCallStore;
  private readonly toolExecutorFactory: NonNullable<
    BrowserBridgeOptions['toolExecutorFactory']
  >;
  private readonly toolExecutions = new Map<string, ActiveToolExecution>();
  private token: string | null;
  private server: Server | null = null;
  private paused = false;
  private heartbeatAt: string | null = null;
  private heartbeatVersion: string | null = null;
  private sessionState: BrowserSessionState = 'unknown';

  constructor(options: BrowserBridgeOptions) {
    if (!options.stateDir?.trim()) throw new Error('stateDir is required');
    this.host = options.host ?? '127.0.0.1';
    if (this.host !== '127.0.0.1') {
      throw new Error('Browser Bridge accepts only loopback 127.0.0.1');
    }

    this.port = options.port ?? 43_821;
    if (!Number.isInteger(this.port) || this.port < 0 || this.port > 65_535) {
      throw new Error('Browser Bridge port is invalid');
    }

    this.stateDir = path.resolve(options.stateDir);
    this.now = options.now ?? Date.now;
    this.token = options.token?.trim() || null;
    this.jobStore =
      options.jobStore ??
      new BrowserJobStore({ stateDir: this.stateDir, now: this.now });
    this.toolStore =
      options.toolStore ??
      new BrowserToolCallStore({ stateDir: this.stateDir, now: this.now });
    this.toolExecutorFactory =
      options.toolExecutorFactory ??
      (({ job, policy }) =>
        createBrowserToolExecutor({
          repoRoots: job.repositories,
          policy,
        }));
  }

  private async prepareToken(): Promise<void> {
    const browserDir = path.dirname(browserBridgeTokenPath(this.stateDir));
    const tokenPath = browserBridgeTokenPath(this.stateDir);
    await fs.mkdir(browserDir, { recursive: true, mode: 0o700 });

    if (!this.token) {
      try {
        const existing = (await fs.readFile(tokenPath, 'utf8')).trim();
        if (/^[a-f0-9]{64}$/i.test(existing)) {
          this.token = existing;
        }
      } catch (error) {
        if (
          !error ||
          typeof error !== 'object' ||
          !('code' in error) ||
          error.code !== 'ENOENT'
        ) {
          throw error;
        }
      }
    }

    this.token ||= crypto.randomBytes(32).toString('hex');
    await fs.writeFile(tokenPath, `${this.token}\n`, { mode: 0o600 });
    try {
      await fs.chmod(browserDir, 0o700);
      await fs.chmod(tokenPath, 0o600);
    } catch {
      // Best effort on filesystems without chmod support.
    }
  }

  async start(): Promise<{ host: string; port: number }> {
    if (this.server) {
      const address = this.server.address() as AddressInfo | null;
      if (!address) throw new Error('Browser Bridge address is unavailable');
      return { host: this.host, port: address.port };
    }

    await this.prepareToken();
    await this.jobStore.recover();
    await this.toolStore.recover();

    const server = http.createServer((request, response) => {
      void this.handle(request, response).catch((error) => {
        this.writeError(response, translateError(error));
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.port, this.host, () => {
        server.off('error', reject);
        resolve();
      });
    });

    this.server = server;
    const address = server.address() as AddressInfo | null;
    if (!address) throw new Error('Browser Bridge address is unavailable');
    return { host: this.host, port: address.port };
  }

  async close(): Promise<void> {
    this.abortToolExecutions(null, 'bridge-closed');
    if (!this.server) return;

    const server = this.server;
    this.server = null;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  private tokenMatches(candidate: string | null): boolean {
    if (!this.token || !candidate) return false;
    const expected = Buffer.from(this.token);
    const actual = Buffer.from(candidate);
    return (
      expected.length === actual.length &&
      crypto.timingSafeEqual(expected, actual)
    );
  }

  private abortToolExecutions(jobId: string | null, reason: string): void {
    for (const active of this.toolExecutions.values()) {
      if (jobId && active.jobId !== jobId) continue;
      if (!active.controller.signal.aborted) {
        active.controller.abort(reason);
      }
    }
  }

  private json(
    response: ServerResponse,
    statusCode: number,
    value: unknown,
    origin: string | null,
  ): void {
    if (origin) {
      response.setHeader('access-control-allow-origin', origin);
    }
    response.writeHead(statusCode, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(`${JSON.stringify(value)}\n`);
  }

  private writeError(
    response: ServerResponse,
    error: BrowserBridgeHttpError,
  ): void {
    if (response.headersSent) {
      response.end();
      return;
    }

    const origin = response.getHeader('access-control-allow-origin');
    this.json(
      response,
      error.statusCode,
      {
        error: {
          code: error.code,
          message:
            error.statusCode >= 500
              ? 'internal browser bridge error'
              : safeMessage(error.message, error.code),
        },
      },
      typeof origin === 'string' ? origin : null,
    );
  }

  private async activeToolJob(
    id: string,
    leaseId: string | null,
  ): Promise<BrowserStoredJob> {
    if (this.paused) {
      throw fail('bridge-paused', 'browser bridge is paused', 423);
    }

    const job = await this.jobStore.get(id);
    if (!job.leaseId || !leaseId || job.leaseId !== leaseId) {
      throw fail('lease-mismatch', 'browser job lease does not match', 409);
    }
    if (job.state !== 'running') {
      throw fail('job-not-active', 'browser job is not active for tools', 409);
    }
    return job;
  }

  private async executeTool(
    job: BrowserStoredJob,
    request: ReturnType<typeof assertBrowserToolRequest>,
  ): Promise<Record<string, unknown>> {
    const key = `${job.id}:${request.toolCallId}`;
    const existing = this.toolExecutions.get(key);
    if (existing) {
      return (await existing.promise) as Record<string, unknown>;
    }

    const controller = new AbortController();
    const execution = (async (): Promise<Record<string, unknown>> => {
      const mutable = isMutatingBrowserTool(request.tool);
      const prepared = await this.toolStore.prepare({
        jobId: job.id,
        request,
      });

      const stored = storedToolEnvelope(prepared);
      if (stored) return stored;

      if (prepared.state === 'executing' && prepared.mutable) {
        const ambiguous = await this.toolStore.markAmbiguous(
          job.id,
          request.toolCallId,
          'mutable browser tool was already executing without a tracked local execution',
        );
        return storedToolEnvelope(ambiguous) as Record<string, unknown>;
      }

      const policy = policyForJob(job);
      const decision = authorizeBrowserToolCall({
        policy,
        tool: request.tool,
        repo: request.repo,
        args: request.args,
      });
      if (!decision.allowed) {
        const failed = await this.toolStore.fail(job.id, request.toolCallId, {
          code: decision.code ?? 'tool-not-allowed',
          message: decision.message ?? 'browser tool is not allowed',
        });
        return storedToolEnvelope(failed) as Record<string, unknown>;
      }

      await this.toolStore.markExecuting(job.id, request.toolCallId);
      const executor = this.toolExecutorFactory({ job, policy });

      try {
        const result = await executor.execute({
          ...request,
          signal: controller.signal,
        });
        const succeeded = await this.toolStore.succeed(
          job.id,
          request.toolCallId,
          result,
        );
        return storedToolEnvelope(succeeded) as Record<string, unknown>;
      } catch (error) {
        const knownNoEffect =
          error instanceof BrowserToolExecutionError &&
          error.mutationEffect === 'none';

        if (mutable && !knownNoEffect) {
          const ambiguous = await this.toolStore.markAmbiguous(
            job.id,
            request.toolCallId,
            controller.signal.aborted
              ? 'mutable browser tool was interrupted; final effect cannot be proven'
              : 'mutable browser tool failed after execution began; final effect cannot be proven',
          );
          return storedToolEnvelope(ambiguous) as Record<string, unknown>;
        }

        const failed = await this.toolStore.fail(job.id, request.toolCallId, {
          code:
            error instanceof BrowserToolExecutionError
              ? error.code
              : 'tool-execution-failed',
          message:
            error instanceof Error
              ? error.message
              : 'browser tool execution failed',
        });
        return storedToolEnvelope(failed) as Record<string, unknown>;
      }
    })();

    const active: ActiveToolExecution = {
      jobId: job.id,
      toolCallId: request.toolCallId,
      controller,
      promise: execution,
    };
    this.toolExecutions.set(key, active);

    try {
      return await execution;
    } finally {
      if (this.toolExecutions.get(key) === active) {
        this.toolExecutions.delete(key);
      }
    }
  }

  private async handleToolRoute(
    request: IncomingMessage,
    response: ServerResponse,
    origin: string | null,
    pathname: string,
  ): Promise<boolean> {
    const match = pathname.match(
      /^\/v1\/jobs\/([^/]+)\/tools\/([^/]+)(?:\/(execute))?$/,
    );
    if (!match) return false;

    const id = decodeSegment(match[1] ?? '');
    const toolCallId = decodeSegment(match[2] ?? '');
    const action = match[3] ?? null;
    const leaseId = headerString(request.headers['x-agent-job-lease']);
    const job = await this.activeToolJob(id, leaseId);

    if (request.method === 'GET' && !action) {
      const call = await this.toolStore.get(job.id, toolCallId);
      this.json(response, 200, publicToolCall(call), origin);
      return true;
    }

    if (request.method !== 'POST' || action !== 'execute') {
      throw fail(
        'method-not-allowed',
        'browser bridge method is not allowed',
        405,
      );
    }

    const body = await readJson(request, MAX_TOOL_BODY_BYTES);
    const toolRequest = assertBrowserToolRequest(body);
    if (toolRequest.toolCallId !== toolCallId) {
      throw fail(
        'tool-call-integrity-error',
        'toolCallId path differs from payload',
        409,
      );
    }

    const envelope = await this.executeTool(job, toolRequest);
    this.json(response, 200, envelope, origin);
    return true;
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const origin = headerString(request.headers.origin);
    if (!isAllowedOrigin(origin)) {
      throw fail(
        'origin-forbidden',
        'browser bridge origin is not allowed',
        403,
      );
    }
    if (origin) response.setHeader('access-control-allow-origin', origin);

    if (request.method === 'OPTIONS') {
      response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      response.setHeader(
        'access-control-allow-headers',
        'content-type, x-agent-bridge-token, x-agent-job-lease',
      );
      response.writeHead(204);
      response.end();
      return;
    }

    const token = headerString(request.headers['x-agent-bridge-token']);
    if (!this.tokenMatches(token)) {
      throw fail('unauthorized', 'browser bridge token is invalid', 401);
    }

    const url = new URL(request.url ?? '/', `http://${this.host}`);
    const pathname = url.pathname;

    if (request.method === 'GET' && pathname === '/v1/health') {
      const active = await this.jobStore.active();
      this.json(
        response,
        200,
        {
          ok: true,
          paused: this.paused,
          activeJob: active
            ? { id: active.id, state: active.state, agent: active.agent }
            : null,
          heartbeatAt: this.heartbeatAt,
          heartbeatVersion: this.heartbeatVersion,
          sessionState: this.sessionState,
        },
        origin,
      );
      return;
    }

    if (request.method === 'POST' && pathname === '/v1/heartbeat') {
      const body = await readJson(request);
      assertKnownFields(body, ['version', 'sessionState']);
      if (
        body.version != null &&
        (typeof body.version !== 'string' || body.version.length > 80)
      ) {
        throw fail(
          'invalid-heartbeat',
          'browser heartbeat version is invalid',
          400,
        );
      }
      if (
        body.sessionState != null &&
        !['available', 'unavailable', 'unknown'].includes(
          String(body.sessionState),
        )
      ) {
        throw fail(
          'invalid-heartbeat',
          'browser heartbeat session state is invalid',
          400,
        );
      }

      this.heartbeatAt = new Date(this.now()).toISOString();
      this.heartbeatVersion =
        typeof body.version === 'string' ? body.version : null;
      this.sessionState =
        typeof body.sessionState === 'string'
          ? (body.sessionState as BrowserSessionState)
          : 'unknown';

      this.json(
        response,
        200,
        { ok: true, heartbeatAt: this.heartbeatAt },
        origin,
      );
      return;
    }

    if (request.method === 'POST' && pathname === '/v1/control/pause') {
      assertKnownFields(await readJson(request), []);
      this.paused = true;
      const active = await this.jobStore.active();
      if (active) {
        this.abortToolExecutions(active.id, 'bridge-paused');
        await this.jobStore.cancel(active.id, null, {
          errorCode: 'bridge_paused',
        });
      }
      this.json(response, 200, { ok: true, paused: true }, origin);
      return;
    }

    if (request.method === 'POST' && pathname === '/v1/control/resume') {
      assertKnownFields(await readJson(request), []);
      this.paused = false;
      this.json(response, 200, { ok: true, paused: false }, origin);
      return;
    }

    if (request.method === 'POST' && pathname === '/v1/jobs') {
      if (this.paused) {
        throw fail('bridge-paused', 'browser bridge is paused', 423);
      }
      const job = await this.jobStore.create(
        assertCreateJobRequest(await readJson(request)),
      );
      this.json(response, 201, publicJob(job), origin);
      return;
    }

    if (request.method === 'GET' && pathname === '/v1/jobs/next') {
      if (this.paused) {
        throw fail('bridge-paused', 'browser bridge is paused', 423);
      }
      this.json(response, 200, publicJob(await this.jobStore.next()), origin);
      return;
    }

    if (pathname.includes('/tools/')) {
      if (await this.handleToolRoute(request, response, origin, pathname)) {
        return;
      }
    }

    const match = pathname.match(
      /^\/v1\/jobs\/([^/]+)(?:\/(claim|running|finish|fail|cancel))?$/,
    );
    if (!match) {
      throw fail('not-found', 'browser bridge endpoint was not found', 404);
    }

    const id = decodeSegment(match[1] ?? '');
    const action = match[2] ?? null;

    if (request.method === 'GET' && !action) {
      this.json(response, 200, publicJob(await this.jobStore.get(id)), origin);
      return;
    }

    if (request.method !== 'POST' || !action) {
      throw fail(
        'method-not-allowed',
        'browser bridge method is not allowed',
        405,
      );
    }
    if (this.paused && action === 'claim') {
      throw fail('bridge-paused', 'browser bridge is paused', 423);
    }

    const body = await readJson(request);
    const allowedFields: Record<string, readonly string[]> = {
      claim: [],
      running: ['leaseId'],
      finish: ['leaseId', 'terminalResult'],
      fail: ['leaseId', 'errorCode', 'browserPhase'],
      cancel: ['leaseId', 'errorCode'],
    };
    assertKnownFields(body, allowedFields[action] ?? []);

    let job: BrowserStoredJob;
    if (action === 'claim') {
      job = await this.jobStore.claim(id);
      this.json(response, 200, claimedJob(job), origin);
      return;
    }

    if (action === 'running') {
      if (typeof body.leaseId !== 'string') {
        throw fail('lease-mismatch', 'browser job lease is required', 409);
      }
      job = await this.jobStore.markRunning(id, body.leaseId);
    } else if (action === 'finish') {
      if (typeof body.leaseId !== 'string') {
        throw fail('lease-mismatch', 'browser job lease is required', 409);
      }

      const current = await this.jobStore.get(id);
      if (current.tools.length > 0) {
        assertBrowserTerminalResult(body.terminalResult);
        const unresolved = await this.toolStore.unresolved(id);
        if (unresolved.length > 0) {
          throw fail(
            'tool-call-unresolved',
            'browser job has unreconciled tool calls',
            409,
          );
        }
      }
      job = await this.jobStore.finish(id, body.leaseId);
    } else if (action === 'fail') {
      job = await this.jobStore.fail(
        id,
        typeof body.leaseId === 'string' ? body.leaseId : null,
        {
          ...(typeof body.errorCode === 'string'
            ? { errorCode: body.errorCode }
            : {}),
          ...(typeof body.browserPhase === 'string'
            ? { browserPhase: body.browserPhase }
            : {}),
        },
      );
    } else {
      this.abortToolExecutions(
        id,
        typeof body.errorCode === 'string' ? body.errorCode : 'cancelled',
      );
      job = await this.jobStore.cancel(
        id,
        typeof body.leaseId === 'string' ? body.leaseId : null,
        {
          ...(typeof body.errorCode === 'string'
            ? { errorCode: body.errorCode }
            : {}),
        },
      );
    }

    this.json(response, 200, publicJob(job), origin);
  }
}
