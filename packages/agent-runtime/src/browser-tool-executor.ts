import { spawn as nodeSpawn } from 'node:child_process';
import fsDefault from 'node:fs/promises';
import path from 'node:path';

import type { BrowserToolRequest } from './browser-tool-protocol.js';
import {
  authorizeBrowserToolCall,
  isSensitiveBrowserToolPath,
  normalizeBrowserToolPath,
  type BrowserToolPolicy,
} from './browser-tool-policy.js';

export type BrowserToolMutationEffect = 'none' | 'unknown';

export class BrowserToolExecutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly mutationEffect: BrowserToolMutationEffect = 'none',
  ) {
    super(message);
    this.name = 'BrowserToolExecutionError';
  }
}

export interface BrowserToolExecutor {
  execute(
    request: BrowserToolRequest & { signal?: AbortSignal | null },
  ): Promise<unknown>;
}

export interface CreateBrowserToolExecutorOptions {
  repoRoots: Record<string, string>;
  policy: BrowserToolPolicy;
  spawn?: typeof nodeSpawn;
  fs?: typeof fsDefault;
  env?: NodeJS.ProcessEnv;
}

const SECRET_PATTERNS = [
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi,
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
];

function redact(value: string): string {
  let next = value;
  for (const pattern of SECRET_PATTERNS) {
    next = next.replace(pattern, '[REDACTED]');
  }
  return next.replace(
    /\b(api[_-]?key|access[_-]?token|auth[_-]?token|secret|password)\b(\s*[:=]\s*)(["']?)([^\s"']{8,})\3/gi,
    (_match, name: string, separator: string) =>
      `${name}${separator}[REDACTED]`,
  );
}

function fail(
  code: string,
  message: string,
  mutationEffect: BrowserToolMutationEffect = 'none',
): BrowserToolExecutionError {
  return new BrowserToolExecutionError(code, redact(message), mutationEffect);
}

function hasCode(error: unknown, code: string): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

function clip(
  text: string,
  maxBytes: number,
): {
  text: string;
  truncated: boolean;
} {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
    return { text, truncated: false };
  }

  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (Buffer.byteLength(text.slice(0, middle), 'utf8') <= maxBytes) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return { text: text.slice(0, low), truncated: true };
}

export function sanitizeBrowserToolResult(
  result: unknown,
  maxOutputBytes = 64 * 1024,
): unknown {
  let redacted = false;
  let truncated = false;
  let remainingBytes = maxOutputBytes;

  const visit = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const safe = redact(value);
      redacted ||= safe !== value;
      if (remainingBytes <= 0) {
        truncated ||= safe.length > 0;
        return '';
      }
      const limited = clip(safe, remainingBytes);
      remainingBytes -= Buffer.byteLength(limited.text, 'utf8');
      truncated ||= limited.truncated;
      return limited.text;
    }

    if (Array.isArray(value)) return value.map(visit);

    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, child]) => [
          key,
          visit(child),
        ]),
      );
    }

    return value;
  };

  const safe = visit(result);
  if (safe && typeof safe === 'object' && !Array.isArray(safe)) {
    const record = safe as Record<string, unknown>;
    if (redacted) record.redacted = true;
    if (truncated) record.truncated = true;
  }
  return safe;
}

function inside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function binary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 8192);
  if (sample.includes(0)) return true;
  if (!sample.length) return false;

  let controls = 0;
  for (const byte of sample) {
    if (byte < 9 || (byte > 13 && byte < 32)) controls += 1;
  }
  return controls / sample.length > 0.05;
}

function integer(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value == null) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw fail('invalid-tool-request', 'browser tool integer is invalid');
  }
  return Math.min(max, Math.max(min, value));
}

function assertKnownArgs(
  args: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const unknown = Object.keys(args).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw fail(
      'invalid-tool-request',
      `unknown browser tool argument: ${unknown[0]}`,
    );
  }
}

function requiredString(value: unknown, label: string, max = 4096): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > max ||
    value.includes('\0')
  ) {
    throw fail('invalid-tool-request', `${label} is invalid`);
  }
  return value;
}

function safeProcessEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const allowed = [
    'PATH',
    'Path',
    'SYSTEMROOT',
    'SystemRoot',
    'WINDIR',
    'TEMP',
    'TMP',
    'TMPDIR',
    'LANG',
    'LC_ALL',
    'TERM',
  ];
  const env: NodeJS.ProcessEnv = {};

  for (const key of allowed) {
    if (typeof source[key] === 'string') env[key] = source[key];
  }

  env.CI = '1';
  env.NO_COLOR = '1';
  env.NPM_CONFIG_AUDIT = 'false';
  env.NPM_CONFIG_FUND = 'false';
  env.NPM_CONFIG_UPDATE_NOTIFIER = 'false';
  return env;
}

function parseNumstat(stdout: string, expectedPath: string): void {
  const records = stdout.split('\0').filter(Boolean);
  if (records.length !== 1) {
    throw fail('invalid-patch', 'patch must affect exactly one file');
  }

  const fields = records[0]?.split('\t') ?? [];
  if (fields.length !== 3) {
    throw fail('invalid-patch', 'patch numstat is invalid');
  }

  const [added, removed, changedPath] = fields;
  if (changedPath !== expectedPath) {
    throw fail('path-forbidden', 'patch references a different path');
  }
  if (added === '-' || removed === '-') {
    throw fail('binary-file', 'binary patch is not allowed');
  }
}

async function collect(
  child: ReturnType<typeof nodeSpawn>,
  maxBytes: number,
  timeoutMs = 30_000,
  abortSignal: AbortSignal | null = null,
): Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
}> {
  return new Promise((resolve, reject) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let totalBytes = 0;
    let truncated = false;
    let settled = false;
    let termination: { code: string; message: string } | null = null;
    let forceTimer: NodeJS.Timeout | null = null;

    const finish = <T>(callback: (value: T) => void, value: T): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceTimer) clearTimeout(forceTimer);
      abortSignal?.removeEventListener('abort', onAbort);
      callback(value);
    };

    const beginTermination = (code: string, message: string): void => {
      if (settled || termination) return;
      termination = { code, message };
      try {
        child.kill('SIGTERM');
      } catch {
        // Best effort.
      }
      forceTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // Best effort.
        }
        finish(reject, fail(code, message, 'unknown'));
      }, 1_000);
    };

    const onAbort = (): void => {
      beginTermination('process-cancelled', 'browser process was cancelled');
    };

    const timer = setTimeout(() => {
      beginTermination('process-timeout', 'browser process exceeded timeout');
    }, timeoutMs);

    const append = (target: Buffer[], chunk: Buffer | string): void => {
      const buffer = Buffer.from(chunk);
      const room = Math.max(0, maxBytes - totalBytes);
      const accepted = Math.min(buffer.length, room);
      if (accepted > 0) target.push(buffer.subarray(0, accepted));
      totalBytes += accepted;
      truncated ||= accepted < buffer.length;
    };

    child.stdout?.on('data', (chunk) => append(stdout, chunk));
    child.stderr?.on('data', (chunk) => append(stderr, chunk));
    child.once('error', (error) => {
      if (termination) {
        finish(reject, fail(termination.code, termination.message));
        return;
      }
      finish(reject, fail('process-failed', error.message, 'unknown'));
    });
    child.once('close', (code, signal) => {
      if (termination) {
        finish(reject, fail(termination.code, termination.message));
        return;
      }
      finish(resolve, {
        code,
        signal,
        stdout: Buffer.concat(stdout).toString(),
        stderr: Buffer.concat(stderr).toString(),
        truncated,
      });
    });

    if (abortSignal?.aborted) onAbort();
    else abortSignal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function createBrowserToolExecutor(
  options: CreateBrowserToolExecutorOptions,
): BrowserToolExecutor {
  if (
    !options.repoRoots ||
    typeof options.repoRoots !== 'object' ||
    Array.isArray(options.repoRoots)
  ) {
    throw new Error('repoRoots is required');
  }
  if (!options.policy) throw new Error('policy is required');

  const roots = Object.freeze({ ...options.repoRoots });
  const policy = options.policy;
  const spawn = options.spawn ?? nodeSpawn;
  const fs = options.fs ?? fsDefault;
  const env = options.env ?? process.env;
  const realRoots = new Map<string, string>();

  async function rootFor(repo: string): Promise<string> {
    if (!Object.hasOwn(roots, repo)) {
      throw fail('repo-not-allowed', 'browser repository is not allowed');
    }
    const cached = realRoots.get(repo);
    if (cached) return cached;

    let root: string;
    try {
      root = await fs.realpath(roots[repo] as string);
    } catch {
      throw fail('repo-not-allowed', 'browser repository root is unavailable');
    }
    realRoots.set(repo, root);
    return root;
  }

  async function resolveExisting(
    repo: string,
    input: unknown = '.',
  ): Promise<{ root: string; real: string; relative: string }> {
    const relative = normalizeBrowserToolPath(input);
    if (!relative) {
      throw fail('path-forbidden', 'browser path is invalid or absolute');
    }
    if (isSensitiveBrowserToolPath(relative)) {
      throw fail('sensitive-path', 'browser path is sensitive');
    }

    const root = await rootFor(repo);
    const candidate = path.resolve(root, relative === '.' ? '' : relative);
    if (!inside(root, candidate)) {
      throw fail('path-forbidden', 'browser path escapes repository root');
    }

    let real: string;
    try {
      real = await fs.realpath(candidate);
    } catch (error) {
      if (hasCode(error, 'ENOENT')) {
        throw fail('path-not-found', 'browser path was not found');
      }
      throw fail('path-forbidden', 'browser path could not be resolved');
    }

    if (!inside(root, real)) {
      throw fail('path-forbidden', 'browser symlink escapes repository root');
    }
    return { root, real, relative };
  }

  async function writeTarget(
    repo: string,
    input: unknown,
  ): Promise<{ root: string; candidate: string; relative: string }> {
    const relative = normalizeBrowserToolPath(input);
    if (!relative) {
      throw fail('path-forbidden', 'browser path is invalid or absolute');
    }
    if (relative === '.' || isSensitiveBrowserToolPath(relative)) {
      throw fail('sensitive-path', 'browser path is sensitive');
    }

    const root = await rootFor(repo);
    const candidate = path.resolve(root, relative);
    if (!inside(root, candidate)) {
      throw fail('path-forbidden', 'browser path escapes repository root');
    }

    try {
      const stat = await fs.lstat(candidate);
      if (stat.isSymbolicLink()) {
        throw fail('path-forbidden', 'browser writes cannot target symlinks');
      }
      const real = await fs.realpath(candidate);
      if (!inside(root, real)) {
        throw fail('path-forbidden', 'browser path escapes repository root');
      }
    } catch (error) {
      if (error instanceof BrowserToolExecutionError) throw error;
      if (!hasCode(error, 'ENOENT')) {
        throw fail('path-forbidden', 'browser write target is invalid');
      }
      try {
        const parent = await fs.realpath(path.dirname(candidate));
        if (!inside(root, parent)) {
          throw fail(
            'path-forbidden',
            'browser write parent escapes repository root',
          );
        }
      } catch (parentError) {
        if (parentError instanceof BrowserToolExecutionError) throw parentError;
        throw fail('path-not-found', 'browser write parent was not found');
      }
    }

    return { root, candidate, relative };
  }

  async function safeFile(
    repo: string,
    input: unknown,
  ): Promise<{ relative: string; text: string }> {
    const resolved = await resolveExisting(repo, input);
    const stat = await fs.stat(resolved.real);
    if (!stat.isFile()) {
      throw fail('path-forbidden', 'browser path is not a file');
    }
    if (stat.size > policy.limits.maxFileBytes) {
      throw fail('file-too-large', 'browser file exceeds the size limit');
    }

    const buffer = await fs.readFile(resolved.real);
    if (binary(buffer)) {
      throw fail('binary-file', 'binary browser file is not allowed');
    }
    return { relative: resolved.relative, text: buffer.toString('utf8') };
  }

  async function git(
    repo: string,
    argv: string[],
  ): Promise<Awaited<ReturnType<typeof collect>>> {
    const root = await rootFor(repo);
    const child = spawn('git', argv, {
      cwd: root,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const result = await collect(child, policy.limits.maxOutputBytes);
    if (result.code !== 0) {
      throw fail(
        'git-failed',
        result.stderr || `git exited with code ${String(result.code)}`,
      );
    }
    return result;
  }

  async function gitInput(
    repo: string,
    argv: string[],
    input: string,
  ): Promise<Awaited<ReturnType<typeof collect>>> {
    const root = await rootFor(repo);
    const child = spawn('git', argv, {
      cwd: root,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin?.on('error', () => {});
    child.stdin?.end(input);

    const result = await collect(child, policy.limits.maxOutputBytes);
    if (result.code !== 0) {
      throw fail(
        'git-failed',
        result.stderr || `git exited with code ${String(result.code)}`,
      );
    }
    return result;
  }

  async function listFiles(
    repo: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    assertKnownArgs(args, ['path', 'offset', 'limit']);
    const base = await resolveExisting(repo, args.path ?? '.');
    if (!(await fs.stat(base.real)).isDirectory()) {
      throw fail('path-forbidden', 'browser path is not a directory');
    }

    const offset = integer(args.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const limit = integer(args.limit, 100, 1, policy.limits.maxListEntries);
    const entries: Array<Record<string, unknown>> = [];

    const children = await fs.readdir(base.real, { withFileTypes: true });
    children.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of children) {
      const relative =
        base.relative === '.' ? entry.name : `${base.relative}/${entry.name}`;
      if (isSensitiveBrowserToolPath(relative)) continue;

      if (entry.isSymbolicLink()) {
        try {
          const real = await fs.realpath(path.join(base.real, entry.name));
          if (!inside(base.root, real)) continue;
        } catch {
          continue;
        }
      }

      entries.push({
        name: entry.name,
        path: relative.split(path.sep).join('/'),
        type: entry.isDirectory()
          ? 'directory'
          : entry.isFile()
            ? 'file'
            : entry.isSymbolicLink()
              ? 'symlink'
              : 'other',
      });
    }

    const page = entries.slice(offset, offset + limit);
    return sanitizeBrowserToolResult(
      {
        entries: page,
        offset,
        nextOffset:
          offset + page.length < entries.length ? offset + page.length : null,
        total: entries.length,
      },
      policy.limits.maxOutputBytes,
    );
  }

  async function readFile(
    repo: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    assertKnownArgs(args, ['path', 'startLine', 'endLine']);
    const file = await safeFile(repo, requiredString(args.path, 'path'));
    const lines = file.text.split(/\r?\n/);
    const startLine = integer(args.startLine, 1, 1, Math.max(1, lines.length));
    const endLine = integer(
      args.endLine,
      Math.min(lines.length, startLine + 199),
      startLine,
      Math.min(lines.length, startLine + 999),
    );
    const selected = clip(
      redact(lines.slice(startLine - 1, endLine).join('\n')),
      policy.limits.maxOutputBytes,
    );

    return sanitizeBrowserToolResult(
      {
        path: file.relative,
        content: selected.text,
        startLine,
        endLine,
        totalLines: lines.length,
        truncated: selected.truncated || endLine < lines.length,
      },
      policy.limits.maxOutputBytes,
    );
  }

  async function searchText(
    repo: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    assertKnownArgs(args, ['query', 'path', 'caseSensitive', 'limit']);
    const query = requiredString(args.query, 'query', 512);
    const base = await resolveExisting(repo, args.path ?? '.');
    if (!(await fs.stat(base.real)).isDirectory()) {
      throw fail('path-forbidden', 'browser search path is not a directory');
    }

    const limit = integer(args.limit, 50, 1, policy.limits.maxSearchResults);
    const caseSensitive = args.caseSensitive === true;
    const needle = caseSensitive ? query : query.toLowerCase();
    const queue: Array<{ real: string; relative: string }> = [
      { real: base.real, relative: base.relative },
    ];
    const matches: Array<{ path: string; line: number; text: string }> = [];
    let scannedFiles = 0;

    while (
      queue.length > 0 &&
      matches.length < limit &&
      scannedFiles < policy.limits.maxSearchFiles
    ) {
      const current = queue.shift();
      if (!current) break;

      let currentReal: string;
      try {
        currentReal = await fs.realpath(current.real);
      } catch {
        continue;
      }
      if (!inside(base.root, currentReal)) continue;

      const children = await fs.readdir(currentReal, { withFileTypes: true });
      for (const entry of children) {
        const relative =
          current.relative === '.'
            ? entry.name
            : `${current.relative}/${entry.name}`;
        if (isSensitiveBrowserToolPath(relative) || entry.isSymbolicLink()) {
          continue;
        }

        const absolute = path.join(currentReal, entry.name);
        if (entry.isDirectory()) {
          queue.push({ real: absolute, relative });
          continue;
        }
        if (!entry.isFile()) continue;

        let real: string;
        try {
          real = await fs.realpath(absolute);
        } catch {
          continue;
        }
        if (!inside(base.root, real)) continue;

        const stat = await fs.stat(real);
        if (stat.size > policy.limits.maxFileBytes) continue;

        const buffer = await fs.readFile(real);
        scannedFiles += 1;
        if (binary(buffer)) continue;

        const lines = buffer.toString('utf8').split(/\r?\n/);
        for (
          let index = 0;
          index < lines.length && matches.length < limit;
          index += 1
        ) {
          const line = lines[index] ?? '';
          const haystack = caseSensitive ? line : line.toLowerCase();
          if (haystack.includes(needle)) {
            matches.push({
              path: relative.split(path.sep).join('/'),
              line: index + 1,
              text: line,
            });
          }
        }
        if (scannedFiles >= policy.limits.maxSearchFiles) break;
      }
    }

    return sanitizeBrowserToolResult(
      {
        matches,
        scannedFiles,
        truncated:
          queue.length > 0 ||
          matches.length >= limit ||
          scannedFiles >= policy.limits.maxSearchFiles,
      },
      policy.limits.maxOutputBytes,
    );
  }

  async function gitStatus(repo: string): Promise<unknown> {
    const result = await git(repo, ['status', '--short', '--branch']);
    return sanitizeBrowserToolResult(
      { output: result.stdout, truncated: result.truncated },
      policy.limits.maxOutputBytes,
    );
  }

  async function gitDiff(
    repo: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    assertKnownArgs(args, ['staged', 'path']);
    const argv = ['diff'];
    if (args.staged === true) argv.push('--cached');
    if (args.path != null) {
      argv.push('--', (await resolveExisting(repo, args.path)).relative);
    }
    const result = await git(repo, argv);
    return sanitizeBrowserToolResult(
      { output: result.stdout, truncated: result.truncated },
      policy.limits.maxOutputBytes,
    );
  }

  async function gitLog(
    repo: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    assertKnownArgs(args, ['count']);
    const count = integer(args.count, 20, 1, 100);
    const result = await git(repo, [
      'log',
      `-${count}`,
      '--date=iso-strict',
      '--pretty=format:%H%x09%ad%x09%s',
    ]);
    return sanitizeBrowserToolResult(
      { output: result.stdout, truncated: result.truncated },
      policy.limits.maxOutputBytes,
    );
  }

  async function gitBranch(repo: string): Promise<unknown> {
    const current = await git(repo, ['branch', '--show-current']);
    const branches = await git(repo, ['branch', '--format=%(refname:short)']);
    return sanitizeBrowserToolResult(
      {
        current: current.stdout.trim() || null,
        branches: branches.stdout
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean),
        truncated: current.truncated || branches.truncated,
      },
      policy.limits.maxOutputBytes,
    );
  }

  async function applyPatch(
    repo: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    assertKnownArgs(args, ['path', 'patch']);
    const target = await writeTarget(
      repo,
      requiredString(args.path, 'path', 4096),
    );
    const patchText = requiredString(
      args.patch,
      'patch',
      policy.limits.maxPatchBytes,
    );

    if (
      Buffer.byteLength(patchText, 'utf8') > policy.limits.maxPatchBytes ||
      /^(?:old mode|rename from|rename to|copy from|copy to|GIT binary patch|Binary files )/m.test(
        patchText,
      ) ||
      /^new file mode (?!100644$|100755$)/m.test(patchText)
    ) {
      throw fail('invalid-patch', 'browser patch is not supported');
    }

    try {
      const numstat = await gitInput(
        repo,
        ['apply', '--numstat', '-z', '-'],
        patchText,
      );
      parseNumstat(numstat.stdout, target.relative);
      await gitInput(
        repo,
        ['apply', '--check', '--whitespace=nowarn', '-'],
        patchText,
      );
      await writeTarget(repo, target.relative);
    } catch (error) {
      if (
        error instanceof BrowserToolExecutionError &&
        [
          'path-forbidden',
          'sensitive-path',
          'binary-file',
          'invalid-patch',
        ].includes(error.code)
      ) {
        throw error;
      }
      throw fail(
        'patch-failed',
        error instanceof Error ? error.message : 'browser patch failed',
      );
    }

    try {
      await gitInput(repo, ['apply', '--whitespace=nowarn', '-'], patchText);
    } catch (error) {
      throw fail(
        'patch-failed',
        error instanceof Error ? error.message : 'browser patch failed',
        'unknown',
      );
    }

    let after;
    try {
      after = await git(repo, ['status', '--short', '--', target.relative]);
    } catch (error) {
      throw fail(
        'patch-verification-failed',
        error instanceof Error
          ? error.message
          : 'browser patch verification failed',
        'unknown',
      );
    }
    return sanitizeBrowserToolResult(
      {
        path: target.relative,
        status: after.stdout.trim(),
        applied: true,
      },
      policy.limits.maxOutputBytes,
    );
  }

  async function runProcess(
    repo: string,
    args: Record<string, unknown>,
    signal: AbortSignal | null,
  ): Promise<unknown> {
    assertKnownArgs(args, ['executable', 'argv', 'timeoutMs']);
    const executable = requiredString(args.executable, 'executable', 80);
    const argv = args.argv ?? [];
    if (
      !Array.isArray(argv) ||
      argv.some((value) => typeof value !== 'string')
    ) {
      throw fail('invalid-tool-request', 'browser process argv is invalid');
    }

    const root = await rootFor(repo);
    const timeoutMs = integer(
      args.timeoutMs,
      policy.limits.maxProcessTimeoutMs,
      1,
      policy.limits.maxProcessTimeoutMs,
    );
    const child = spawn(executable, argv as string[], {
      cwd: root,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: safeProcessEnv(env),
    });
    const result = await collect(
      child,
      policy.limits.maxOutputBytes,
      timeoutMs,
      signal,
    );
    return sanitizeBrowserToolResult(
      {
        exitCode: result.code,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
        truncated: result.truncated,
      },
      policy.limits.maxOutputBytes,
    );
  }

  const handlers: Record<
    string,
    (
      repo: string,
      args: Record<string, unknown>,
      signal: AbortSignal | null,
    ) => Promise<unknown>
  > = {
    list_files: (repo, args) => listFiles(repo, args),
    read_file: (repo, args) => readFile(repo, args),
    search_text: (repo, args) => searchText(repo, args),
    git_status: (repo) => gitStatus(repo),
    git_diff: (repo, args) => gitDiff(repo, args),
    git_log: (repo, args) => gitLog(repo, args),
    git_branch: (repo) => gitBranch(repo),
    apply_patch: (repo, args) => applyPatch(repo, args),
    run_process: (repo, args, signal) => runProcess(repo, args, signal),
  };

  return Object.freeze({
    async execute(
      request: BrowserToolRequest & { signal?: AbortSignal | null },
    ): Promise<unknown> {
      const decision = authorizeBrowserToolCall({
        policy,
        tool: request.tool,
        repo: request.repo,
        args: request.args,
      });
      if (!decision.allowed) {
        throw fail(
          decision.code ?? 'tool-not-allowed',
          decision.message ?? 'browser tool is not allowed',
        );
      }

      const handler = handlers[request.tool];
      if (!handler) {
        throw fail('tool-not-allowed', 'browser tool is not implemented');
      }

      try {
        return await handler(
          request.repo,
          request.args,
          request.signal ?? null,
        );
      } catch (error) {
        if (error instanceof BrowserToolExecutionError) throw error;
        throw fail(
          'tool-execution-failed',
          error instanceof Error
            ? error.message
            : 'browser tool execution failed',
        );
      }
    },
  });
}
