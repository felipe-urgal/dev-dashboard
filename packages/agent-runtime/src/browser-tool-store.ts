import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  assertBrowserToolRequest,
  type BrowserToolRequest,
} from './browser-tool-protocol.js';
import { isMutatingBrowserTool } from './browser-tool-policy.js';

export type BrowserToolCallState =
  'pending' | 'executing' | 'succeeded' | 'failed' | 'ambiguous';

export interface BrowserToolCallFailure {
  code: string;
  message: string;
}

export interface BrowserToolCallRecord {
  jobId: string;
  toolCallId: string;
  state: BrowserToolCallState;
  mutable: boolean;
  payloadHash: string;
  request: BrowserToolRequest;
  result: unknown;
  error: BrowserToolCallFailure | null;
  createdAt: string;
  updatedAt: string;
}

export type BrowserToolCallStoreErrorCode =
  | 'invalid-job-id'
  | 'invalid-tool-call-id'
  | 'tool-call-not-found'
  | 'tool-call-integrity-error'
  | 'tool-call-terminal'
  | 'tool-call-invalid-transition'
  | 'tool-store-corrupt';

export class BrowserToolCallStoreError extends Error {
  constructor(
    readonly code: BrowserToolCallStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BrowserToolCallStoreError';
  }
}

export interface BrowserToolCallStoreOptions {
  stateDir: string;
  now?: () => number;
  randomUUID?: () => string;
}

const TERMINAL_TOOL_STATES = new Set<BrowserToolCallState>([
  'succeeded',
  'failed',
  'ambiguous',
]);
const TOOL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function fail(
  code: BrowserToolCallStoreErrorCode,
  message: string,
): BrowserToolCallStoreError {
  return new BrowserToolCallStoreError(code, message);
}

function hasCode(error: unknown, code: string): boolean {
  return (
    Boolean(error) &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function safeId(value: string, label: 'jobId' | 'toolCallId'): string {
  if (typeof value !== 'string' || !TOOL_ID_PATTERN.test(value)) {
    throw fail(
      label === 'jobId' ? 'invalid-job-id' : 'invalid-tool-call-id',
      `${label} is invalid`,
    );
  }

  return value;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [
          key,
          canonicalize((value as Record<string, unknown>)[key]),
        ]),
    );
  }
  return value;
}

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function payloadHash(request: BrowserToolRequest, mutable: boolean): string {
  return hash(JSON.stringify(canonicalize({ mutable, request })));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class BrowserToolCallStore {
  private readonly toolsDir: string;
  private readonly now: () => number;
  private readonly randomUUID: () => string;
  private readonly locks = new Map<string, Promise<void>>();

  constructor(options: BrowserToolCallStoreOptions) {
    if (!options.stateDir?.trim()) {
      throw new Error('stateDir is required');
    }

    this.toolsDir = path.join(
      path.resolve(options.stateDir),
      'browser',
      'tools',
    );
    this.now = options.now ?? Date.now;
    this.randomUUID = options.randomUUID ?? crypto.randomUUID;
  }

  private async ensure(): Promise<void> {
    await fs.mkdir(this.toolsDir, { recursive: true, mode: 0o700 });
    try {
      await fs.chmod(this.toolsDir, 0o700);
    } catch {
      // Best effort on filesystems that do not support chmod.
    }
  }

  private jobDir(jobId: string): string {
    return path.join(this.toolsDir, hash(safeId(jobId, 'jobId')));
  }

  private file(jobId: string, toolCallId: string): string {
    return path.join(
      this.jobDir(jobId),
      `${hash(safeId(toolCallId, 'toolCallId'))}.json`,
    );
  }

  private async ensureJob(jobId: string): Promise<string> {
    await this.ensure();
    const dir = this.jobDir(jobId);
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    try {
      await fs.chmod(dir, 0o700);
    } catch {
      // Best effort on filesystems that do not support chmod.
    }
    return dir;
  }

  private async withLock<T>(
    jobId: string,
    toolCallId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = `${safeId(jobId, 'jobId')}:${safeId(toolCallId, 'toolCallId')}`;
    const previous = this.locks.get(key) ?? Promise.resolve();

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => gate);
    this.locks.set(key, queued);

    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.locks.get(key) === queued) this.locks.delete(key);
    }
  }

  private async read(
    jobId: string,
    toolCallId: string,
  ): Promise<BrowserToolCallRecord> {
    try {
      const value: unknown = JSON.parse(
        await fs.readFile(this.file(jobId, toolCallId), 'utf8'),
      );

      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw fail('tool-store-corrupt', 'browser tool record is invalid');
      }

      const record = value as BrowserToolCallRecord;
      if (
        record.jobId !== jobId ||
        record.toolCallId !== toolCallId ||
        !record.request
      ) {
        throw fail('tool-store-corrupt', 'browser tool record is inconsistent');
      }

      assertBrowserToolRequest(record.request);
      return record;
    } catch (error) {
      if (hasCode(error, 'ENOENT')) {
        throw fail('tool-call-not-found', 'browser tool call was not found');
      }
      if (error instanceof BrowserToolCallStoreError) throw error;
      if (error instanceof SyntaxError) {
        throw fail('tool-store-corrupt', 'browser tool record is corrupt');
      }
      throw error;
    }
  }

  private async write(
    record: BrowserToolCallRecord,
  ): Promise<BrowserToolCallRecord> {
    const dir = await this.ensureJob(record.jobId);
    const target = this.file(record.jobId, record.toolCallId);
    const temp = path.join(
      dir,
      `${path.basename(target)}.${process.pid}.${this.randomUUID()}.tmp`,
    );

    await fs.writeFile(temp, `${JSON.stringify(record, null, 2)}\n`, {
      mode: 0o600,
    });
    await fs.rename(temp, target);

    try {
      await fs.chmod(target, 0o600);
    } catch {
      // Best effort on filesystems that do not support chmod.
    }

    return clone(record);
  }

  async get(jobId: string, toolCallId: string): Promise<BrowserToolCallRecord> {
    return clone(
      await this.read(safeId(jobId, 'jobId'), safeId(toolCallId, 'toolCallId')),
    );
  }

  async prepare(input: {
    jobId: string;
    request: BrowserToolRequest;
  }): Promise<BrowserToolCallRecord> {
    const jobId = safeId(input.jobId, 'jobId');
    const request = assertBrowserToolRequest(input.request);
    const toolCallId = safeId(request.toolCallId, 'toolCallId');
    const mutable = isMutatingBrowserTool(request.tool);
    const expectedHash = payloadHash(request, mutable);

    return this.withLock(jobId, toolCallId, async () => {
      try {
        const existing = await this.read(jobId, toolCallId);
        if (existing.payloadHash !== expectedHash) {
          throw fail(
            'tool-call-integrity-error',
            'toolCallId was reused with a different payload',
          );
        }
        return clone(existing);
      } catch (error) {
        if (
          !(error instanceof BrowserToolCallStoreError) ||
          error.code !== 'tool-call-not-found'
        ) {
          throw error;
        }
      }

      const timestamp = new Date(this.now()).toISOString();
      return this.write({
        jobId,
        toolCallId,
        state: 'pending',
        mutable,
        payloadHash: expectedHash,
        request: clone(request),
        result: null,
        error: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    });
  }

  async markExecuting(
    jobId: string,
    toolCallId: string,
  ): Promise<BrowserToolCallRecord> {
    return this.withLock(jobId, toolCallId, async () => {
      const record = await this.read(jobId, toolCallId);

      if (record.state === 'executing') return clone(record);
      if (TERMINAL_TOOL_STATES.has(record.state)) {
        throw fail(
          'tool-call-terminal',
          `terminal browser tool state ${record.state} is immutable`,
        );
      }
      if (record.state !== 'pending') {
        throw fail(
          'tool-call-invalid-transition',
          `browser tool cannot execute from ${record.state}`,
        );
      }

      record.state = 'executing';
      record.updatedAt = new Date(this.now()).toISOString();
      return this.write(record);
    });
  }

  private async transition(
    jobId: string,
    toolCallId: string,
    change: (record: BrowserToolCallRecord) => void,
  ): Promise<BrowserToolCallRecord> {
    return this.withLock(jobId, toolCallId, async () => {
      const record = await this.read(jobId, toolCallId);
      if (TERMINAL_TOOL_STATES.has(record.state)) {
        throw fail(
          'tool-call-terminal',
          `terminal browser tool state ${record.state} is immutable`,
        );
      }

      change(record);
      record.updatedAt = new Date(this.now()).toISOString();
      return this.write(record);
    });
  }

  async succeed(
    jobId: string,
    toolCallId: string,
    result: unknown,
  ): Promise<BrowserToolCallRecord> {
    return this.transition(jobId, toolCallId, (record) => {
      if (record.mutable && record.state !== 'executing') {
        throw fail(
          'tool-call-invalid-transition',
          'mutable browser tool must be executing before success',
        );
      }

      record.state = 'succeeded';
      record.result = clone(result ?? null);
      record.error = null;
    });
  }

  async fail(
    jobId: string,
    toolCallId: string,
    error: { code?: string; message?: string } = {},
  ): Promise<BrowserToolCallRecord> {
    return this.transition(jobId, toolCallId, (record) => {
      record.state = 'failed';
      record.result = null;
      record.error = {
        code: String(error.code ?? 'tool-failed').slice(0, 120),
        message: String(error.message ?? 'browser tool failed').slice(0, 240),
      };
    });
  }

  async markAmbiguous(
    jobId: string,
    toolCallId: string,
    reason = 'browser tool result is ambiguous',
  ): Promise<BrowserToolCallRecord> {
    return this.transition(jobId, toolCallId, (record) => {
      record.state = 'ambiguous';
      record.result = null;
      record.error = {
        code: 'tool-call-ambiguous',
        message: reason.slice(0, 240),
      };
    });
  }

  async list(jobId: string): Promise<BrowserToolCallRecord[]> {
    const safeJobId = safeId(jobId, 'jobId');
    await this.ensure();

    let entries;
    try {
      entries = await fs.readdir(this.jobDir(safeJobId), {
        withFileTypes: true,
      });
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return [];
      throw error;
    }

    const records: BrowserToolCallRecord[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !/^[0-9a-f]{64}\.json$/i.test(entry.name)) {
        continue;
      }

      let value: unknown;
      try {
        value = JSON.parse(
          await fs.readFile(
            path.join(this.jobDir(safeJobId), entry.name),
            'utf8',
          ),
        );
      } catch {
        throw fail('tool-store-corrupt', 'browser tool record is corrupt');
      }

      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        (value as BrowserToolCallRecord).jobId !== safeJobId
      ) {
        throw fail('tool-store-corrupt', 'browser tool record is inconsistent');
      }

      records.push(clone(value as BrowserToolCallRecord));
    }

    return records;
  }

  async unresolved(jobId: string): Promise<BrowserToolCallRecord[]> {
    return (await this.list(jobId)).filter((record) =>
      ['pending', 'executing', 'ambiguous'].includes(record.state),
    );
  }

  async recover(): Promise<BrowserToolCallRecord[]> {
    await this.ensure();
    const recovered: BrowserToolCallRecord[] = [];
    const jobDirs = await fs.readdir(this.toolsDir, { withFileTypes: true });

    for (const jobDir of jobDirs) {
      if (!jobDir.isDirectory() || !/^[0-9a-f]{64}$/i.test(jobDir.name)) {
        continue;
      }

      const files = await fs.readdir(path.join(this.toolsDir, jobDir.name), {
        withFileTypes: true,
      });

      for (const file of files) {
        if (!file.isFile() || !/^[0-9a-f]{64}\.json$/i.test(file.name)) {
          continue;
        }

        let record: BrowserToolCallRecord;
        try {
          record = JSON.parse(
            await fs.readFile(
              path.join(this.toolsDir, jobDir.name, file.name),
              'utf8',
            ),
          ) as BrowserToolCallRecord;
        } catch {
          throw fail('tool-store-corrupt', 'browser tool record is corrupt');
        }

        if (record.state !== 'executing') continue;

        const next = await this.withLock(
          record.jobId,
          record.toolCallId,
          async () => {
            const current = await this.read(record.jobId, record.toolCallId);
            if (current.state !== 'executing') return current;

            current.updatedAt = new Date(this.now()).toISOString();
            if (current.mutable) {
              current.state = 'ambiguous';
              current.result = null;
              current.error = {
                code: 'tool-call-ambiguous',
                message:
                  'runtime restarted during a mutable browser tool call; effect cannot be proven',
              };
            } else {
              current.state = 'pending';
              current.result = null;
              current.error = null;
            }

            return this.write(current);
          },
        );

        recovered.push(next);
      }
    }

    return recovered;
  }
}
