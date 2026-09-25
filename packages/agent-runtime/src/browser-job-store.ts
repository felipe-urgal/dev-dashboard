import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { AgentCapability } from './contracts.js';
import { sanitizeAgentConversationContent } from './conversation-store.js';
import type {
  BrowserBridgeCreateJobRequest,
  BrowserBridgeJobState,
} from './browser-provider.js';
import {
  BROWSER_TOOL_NAMES,
  type BrowserToolName,
} from './browser-tool-policy.js';

export interface BrowserStoredJob {
  id: string;
  state: BrowserBridgeJobState;
  taskId: string;
  agent: 'chatgpt-browser';
  cwd: string;
  prompt: string;
  repositories: Record<string, string>;
  capabilities: Partial<Record<AgentCapability, boolean>>;
  tools: BrowserToolName[];
  createdAt: string;
  deadlineAt: string;
  claimedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  leaseId: string | null;
  errorCode: string | null;
  browserPhase: string | null;
  responseText?: string | null;
}

export type BrowserJobStoreErrorCode =
  | 'active-job-exists'
  | 'invalid-job-id'
  | 'invalid-job-request'
  | 'invalid-transition'
  | 'job-not-found'
  | 'lease-mismatch'
  | 'terminal-state';

export class BrowserJobStoreError extends Error {
  constructor(
    readonly code: BrowserJobStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BrowserJobStoreError';
  }
}

export interface BrowserJobStoreOptions {
  stateDir: string;
  now?: () => number;
  randomUUID?: () => string;
}

const ACTIVE_STATES = new Set<BrowserBridgeJobState>([
  'queued',
  'claimed',
  'running',
]);
const TERMINAL_STATES = new Set<BrowserBridgeJobState>([
  'finished',
  'failed',
  'timed_out',
  'cancelled',
]);
const TRANSITIONS: Partial<
  Record<BrowserBridgeJobState, ReadonlySet<BrowserBridgeJobState>>
> = {
  queued: new Set(['claimed', 'failed', 'timed_out', 'cancelled']),
  claimed: new Set(['running', 'failed', 'timed_out', 'cancelled']),
  running: new Set(['finished', 'failed', 'timed_out', 'cancelled']),
};
const JOB_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REPO_ALIAS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const MAX_PROVIDER_RESPONSE_CHARS = 16_000;
const TOOL_SET = new Set<string>(BROWSER_TOOL_NAMES);
const CAPABILITY_SET = new Set<AgentCapability>([
  'workspace:write',
  'git:commit',
  'git:push',
  'github:pull-request',
  'github:merge',
  'deployment:run',
  'release:run',
]);

function fail(
  code: BrowserJobStoreErrorCode,
  message: string,
): BrowserJobStoreError {
  return new BrowserJobStoreError(code, message);
}

function hasCode(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function normalizeResponseText(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = sanitizeAgentConversationContent(value).trim();
  if (!normalized) return null;
  return normalized.slice(0, MAX_PROVIDER_RESPONSE_CHARS);
}

function safeJobId(value: string): string {
  if (typeof value !== 'string' || !JOB_ID_PATTERN.test(value)) {
    throw fail('invalid-job-id', 'browser job id is invalid');
  }
  return value;
}

function assertTransition(
  from: BrowserBridgeJobState,
  to: BrowserBridgeJobState,
): void {
  if (TERMINAL_STATES.has(from)) {
    throw fail(
      'terminal-state',
      `terminal browser job state ${from} is immutable`,
    );
  }
  if (!TRANSITIONS[from]?.has(to)) {
    throw fail(
      'invalid-transition',
      `invalid browser job transition: ${from} -> ${to}`,
    );
  }
}

function assertLease(job: BrowserStoredJob, leaseId: unknown): void {
  if (
    !job.leaseId ||
    typeof leaseId !== 'string' ||
    !leaseId ||
    job.leaseId !== leaseId
  ) {
    throw fail('lease-mismatch', 'browser job lease does not match');
  }
}

function normalizeRepositories(
  repositories: Record<string, string>,
): Record<string, string> {
  const entries = Object.entries(repositories);
  if (entries.length === 0 || entries.length > 16) {
    throw fail('invalid-job-request', 'browser repositories are invalid');
  }

  const normalized: Record<string, string> = {};
  for (const [alias, root] of entries) {
    if (
      !REPO_ALIAS_PATTERN.test(alias) ||
      typeof root !== 'string' ||
      !root ||
      root.includes('\0') ||
      !path.isAbsolute(root)
    ) {
      throw fail('invalid-job-request', 'browser repository is invalid');
    }
    normalized[alias] = path.resolve(root);
  }
  return normalized;
}

function normalizeCapabilities(
  capabilities: Record<string, boolean>,
): Partial<Record<AgentCapability, boolean>> {
  const entries = Object.entries(capabilities);
  if (entries.length > CAPABILITY_SET.size) {
    throw fail('invalid-job-request', 'browser capabilities are invalid');
  }

  const normalized: Partial<Record<AgentCapability, boolean>> = {};
  for (const [name, enabled] of entries) {
    if (
      !CAPABILITY_SET.has(name as AgentCapability) ||
      typeof enabled !== 'boolean'
    ) {
      throw fail('invalid-job-request', 'browser capability is invalid');
    }
    normalized[name as AgentCapability] = enabled;
  }
  return normalized;
}

function normalizeTools(tools: string[]): BrowserToolName[] {
  if (!Array.isArray(tools) || tools.length > BROWSER_TOOL_NAMES.length) {
    throw fail('invalid-job-request', 'browser tools are invalid');
  }

  const seen = new Set<string>();
  const normalized: BrowserToolName[] = [];
  for (const tool of tools) {
    if (typeof tool !== 'string' || !TOOL_SET.has(tool) || seen.has(tool)) {
      throw fail(
        'invalid-job-request',
        'browser tool is invalid or duplicated',
      );
    }
    seen.add(tool);
    normalized.push(tool as BrowserToolName);
  }
  return normalized;
}

export class BrowserJobStore {
  private readonly jobsDir: string;
  private readonly now: () => number;
  private readonly randomUUID: () => string;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: BrowserJobStoreOptions) {
    if (!options.stateDir?.trim()) throw new Error('stateDir is required');
    this.jobsDir = path.join(path.resolve(options.stateDir), 'browser', 'jobs');
    this.now = options.now ?? Date.now;
    this.randomUUID = options.randomUUID ?? crypto.randomUUID;
  }

  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.queue = previous.then(() => current);

    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async ensure(): Promise<void> {
    await fs.mkdir(this.jobsDir, { recursive: true, mode: 0o700 });
    try {
      await fs.chmod(this.jobsDir, 0o700);
    } catch {
      // Best effort on filesystems without chmod support.
    }
  }

  private file(id: string): string {
    return path.join(this.jobsDir, `${safeJobId(id)}.json`);
  }

  private async write(job: BrowserStoredJob): Promise<BrowserStoredJob> {
    await this.ensure();
    const target = this.file(job.id);
    const temp = `${target}.${process.pid}.${this.randomUUID()}.tmp`;

    await fs.writeFile(temp, `${JSON.stringify(job, null, 2)}\n`, {
      mode: 0o600,
    });
    await fs.rename(temp, target);
    try {
      await fs.chmod(target, 0o600);
    } catch {
      // Best effort on filesystems without chmod support.
    }
    return clone(job);
  }

  private async listRaw(): Promise<BrowserStoredJob[]> {
    await this.ensure();
    const entries = await fs.readdir(this.jobsDir, { withFileTypes: true });
    const jobs: BrowserStoredJob[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        const value: unknown = JSON.parse(
          await fs.readFile(path.join(this.jobsDir, entry.name), 'utf8'),
        );
        if (
          value &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          typeof (value as BrowserStoredJob).id === 'string'
        ) {
          jobs.push(value as BrowserStoredJob);
        }
      } catch {
        // Ignore unrelated/corrupt files here; direct reads still fail closed.
      }
    }
    return jobs;
  }

  private async expire(job: BrowserStoredJob): Promise<BrowserStoredJob> {
    if (
      ACTIVE_STATES.has(job.state) &&
      Date.parse(job.deadlineAt) <= this.now()
    ) {
      assertTransition(job.state, 'timed_out');
      job.state = 'timed_out';
      job.finishedAt = new Date(this.now()).toISOString();
      job.errorCode = 'deadline_exceeded';
      job.browserPhase = 'timed_out';
      return this.write(job);
    }
    return clone(job);
  }

  async get(id: string): Promise<BrowserStoredJob> {
    const safe = safeJobId(id);
    try {
      const value: unknown = JSON.parse(
        await fs.readFile(this.file(safe), 'utf8'),
      );
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        (value as BrowserStoredJob).id !== safe
      ) {
        throw fail('job-not-found', 'browser job record is invalid');
      }
      return clone(value as BrowserStoredJob);
    } catch (error) {
      if (hasCode(error, 'ENOENT')) {
        throw fail('job-not-found', 'browser job was not found');
      }
      if (error instanceof BrowserJobStoreError) throw error;
      throw error;
    }
  }

  async create(
    request: BrowserBridgeCreateJobRequest,
  ): Promise<BrowserStoredJob> {
    return this.exclusive(async () => {
      const prompt = request.prompt.trim();
      if (
        !prompt ||
        Buffer.byteLength(prompt, 'utf8') > 24 * 1024 ||
        request.agent !== 'chatgpt-browser' ||
        !request.taskId?.trim() ||
        !Number.isFinite(request.timeoutMs) ||
        request.timeoutMs < 1_000
      ) {
        throw fail('invalid-job-request', 'browser job request is invalid');
      }

      for (const candidate of await this.listRaw()) {
        const current = await this.expire(candidate);
        if (ACTIVE_STATES.has(current.state)) {
          throw fail(
            'active-job-exists',
            'an active browser job already exists',
          );
        }
      }

      const timestamp = new Date(this.now()).toISOString();
      const job: BrowserStoredJob = {
        id: this.randomUUID(),
        state: 'queued',
        taskId: request.taskId,
        agent: 'chatgpt-browser',
        cwd: path.resolve(request.cwd),
        prompt,
        repositories: normalizeRepositories(request.repositories),
        capabilities: normalizeCapabilities(request.capabilities),
        tools: normalizeTools(request.tools),
        createdAt: timestamp,
        deadlineAt: new Date(this.now() + request.timeoutMs).toISOString(),
        claimedAt: null,
        startedAt: null,
        finishedAt: null,
        leaseId: null,
        errorCode: null,
        browserPhase: 'queued',
        responseText: null,
      };

      if (!path.isAbsolute(request.cwd) || request.cwd.includes('\0')) {
        throw fail('invalid-job-request', 'browser cwd is invalid');
      }

      return this.write(job);
    });
  }

  async next(): Promise<BrowserStoredJob | null> {
    return this.exclusive(async () => {
      const jobs = (await this.listRaw()).sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
      for (const candidate of jobs) {
        const job = await this.expire(candidate);
        if (job.state === 'queued') return job;
      }
      return null;
    });
  }

  async claim(id: string): Promise<BrowserStoredJob> {
    return this.exclusive(async () => {
      const job = await this.expire(await this.get(id));
      assertTransition(job.state, 'claimed');
      job.state = 'claimed';
      job.leaseId = this.randomUUID();
      job.claimedAt = new Date(this.now()).toISOString();
      job.browserPhase = 'claimed';
      return this.write(job);
    });
  }

  async markRunning(id: string, leaseId: string): Promise<BrowserStoredJob> {
    return this.exclusive(async () => {
      const job = await this.expire(await this.get(id));
      assertLease(job, leaseId);
      assertTransition(job.state, 'running');
      job.state = 'running';
      job.startedAt = new Date(this.now()).toISOString();
      job.browserPhase = 'running';
      return this.write(job);
    });
  }

  async finish(
    id: string,
    leaseId: string,
    responseText?: string,
  ): Promise<BrowserStoredJob> {
    return this.exclusive(async () => {
      const job = await this.expire(await this.get(id));
      assertLease(job, leaseId);
      assertTransition(job.state, 'finished');
      job.state = 'finished';
      job.finishedAt = new Date(this.now()).toISOString();
      job.browserPhase = 'finished';
      job.responseText = normalizeResponseText(responseText);
      return this.write(job);
    });
  }

  async fail(
    id: string,
    leaseId: string | null,
    options: { errorCode?: string; browserPhase?: string } = {},
  ): Promise<BrowserStoredJob> {
    return this.exclusive(async () => {
      const job = await this.expire(await this.get(id));
      if (TERMINAL_STATES.has(job.state)) {
        throw fail(
          'terminal-state',
          `terminal browser job state ${job.state} is immutable`,
        );
      }
      if (job.leaseId) assertLease(job, leaseId);
      assertTransition(job.state, 'failed');
      job.state = 'failed';
      job.finishedAt = new Date(this.now()).toISOString();
      job.errorCode = String(options.errorCode ?? 'browser_failure').slice(
        0,
        120,
      );
      job.browserPhase = String(options.browserPhase ?? 'failed').slice(0, 120);
      return this.write(job);
    });
  }

  async cancel(
    id: string,
    leaseId: string | null = null,
    options: { errorCode?: string } = {},
  ): Promise<BrowserStoredJob> {
    return this.exclusive(async () => {
      const job = await this.expire(await this.get(id));
      if (TERMINAL_STATES.has(job.state)) return job;
      if (job.leaseId && leaseId) assertLease(job, leaseId);
      assertTransition(job.state, 'cancelled');
      job.state = 'cancelled';
      job.finishedAt = new Date(this.now()).toISOString();
      job.errorCode = String(options.errorCode ?? 'cancelled').slice(0, 120);
      job.browserPhase = 'cancelled';
      return this.write(job);
    });
  }

  async active(): Promise<BrowserStoredJob | null> {
    return this.exclusive(async () => {
      for (const candidate of await this.listRaw()) {
        const job = await this.expire(candidate);
        if (ACTIVE_STATES.has(job.state)) return job;
      }
      return null;
    });
  }

  async recover(): Promise<BrowserStoredJob[]> {
    return this.exclusive(async () => {
      const recovered: BrowserStoredJob[] = [];
      for (const candidate of await this.listRaw()) {
        const job = await this.expire(candidate);
        if (job.state === 'running') {
          job.state = 'failed';
          job.finishedAt = new Date(this.now()).toISOString();
          job.errorCode = 'unknown_after_submit';
          job.browserPhase = 'restart_recovery';
          recovered.push(await this.write(job));
        } else if (job.state === 'claimed') {
          job.state = 'failed';
          job.finishedAt = new Date(this.now()).toISOString();
          job.errorCode = 'claim_interrupted';
          job.browserPhase = 'restart_recovery';
          recovered.push(await this.write(job));
        }
      }
      return recovered;
    });
  }
}
