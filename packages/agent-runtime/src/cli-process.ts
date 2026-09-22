import { spawn } from 'node:child_process';

export const DEFAULT_AGENT_CLI_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
export const DEFAULT_AGENT_CLI_TERMINATION_GRACE_MS = 2_000;

export type AgentCliProcessErrorCode =
  | 'cancelled'
  | 'output-limit'
  | 'spawn-failed'
  | 'termination-timeout'
  | 'timeout';

export class AgentCliProcessError extends Error {
  constructor(
    readonly code: AgentCliProcessErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AgentCliProcessError';
  }
}

export interface AgentCliProcessRequest {
  command: string;
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
  label: string;
  env?: NodeJS.ProcessEnv;
  maxOutputBytes?: number;
  terminationGraceMs?: number;
  signal?: AbortSignal;
}

export interface AgentCliProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  startedAt: string;
  finishedAt: string;
}

export type AgentCliProcessRunner = (
  request: AgentCliProcessRequest,
) => Promise<AgentCliProcessResult>;

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(label + ' must be a positive integer');
  }
}

export async function runAgentCliProcess(
  request: AgentCliProcessRequest,
): Promise<AgentCliProcessResult> {
  if (!request.command.trim()) throw new Error('command is required');
  if (!request.cwd.trim()) throw new Error('cwd is required');
  if (!request.label.trim()) throw new Error('label is required');
  if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0) {
    throw new Error('timeoutMs must be positive');
  }

  const maxOutputBytes =
    request.maxOutputBytes ?? DEFAULT_AGENT_CLI_MAX_OUTPUT_BYTES;
  const terminationGraceMs =
    request.terminationGraceMs ?? DEFAULT_AGENT_CLI_TERMINATION_GRACE_MS;

  assertPositiveInteger(maxOutputBytes, 'maxOutputBytes');
  assertPositiveInteger(terminationGraceMs, 'terminationGraceMs');

  if (request.signal?.aborted) {
    throw new AgentCliProcessError(
      'cancelled',
      request.label + ' execution cancelled',
    );
  }

  const startedAt = new Date().toISOString();
  let child;
  try {
    child = spawn(request.command, [...request.args], {
      cwd: request.cwd,
      env: request.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new AgentCliProcessError(
      'spawn-failed',
      request.label + ' failed to start',
      { cause: error },
    );
  }

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let capturedBytes = 0;
  let terminationError: AgentCliProcessError | null = null;
  let settled = false;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let forceKillTimer: ReturnType<typeof setTimeout> | undefined;
  let finalSettleTimer: ReturnType<typeof setTimeout> | undefined;

  const exit = await new Promise<{
    exitCode: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    const clearTimer = (
      timer: ReturnType<typeof setTimeout> | undefined,
    ): void => {
      if (timer !== undefined) clearTimeout(timer);
    };

    const cleanup = (): void => {
      clearTimer(timeoutTimer);
      clearTimer(forceKillTimer);
      clearTimer(finalSettleTimer);
      child.stdout.off('data', onStdout);
      child.stderr.off('data', onStderr);
      child.off('error', onError);
      child.off('close', onClose);
      request.signal?.removeEventListener('abort', onAbort);
    };

    const settleResolve = (value: {
      exitCode: number | null;
      signal: NodeJS.Signals | null;
    }): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const settleReject = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      child.stdout.destroy();
      child.stderr.destroy();
      reject(error);
    };

    const requestTermination = (error: AgentCliProcessError): void => {
      if (settled || terminationError) return;
      terminationError = error;

      try {
        child.kill('SIGTERM');
      } catch {
        // Escalation below still attempts SIGKILL.
      }

      forceKillTimer = setTimeout(() => {
        if (settled) return;

        try {
          child.kill('SIGKILL');
        } catch {
          // The bounded final wait below prevents an infinite pending promise.
        }

        finalSettleTimer = setTimeout(() => {
          if (settled) return;
          settleReject(
            new AgentCliProcessError(
              'termination-timeout',
              request.label + ' did not terminate after SIGKILL',
              { cause: terminationError },
            ),
          );
        }, terminationGraceMs);
      }, terminationGraceMs);
    };

    const append = (target: Buffer[], chunk: unknown): void => {
      if (settled || terminationError) return;

      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(String(chunk));
      const remaining = maxOutputBytes - capturedBytes;

      if (buffer.length <= remaining) {
        target.push(buffer);
        capturedBytes += buffer.length;
        return;
      }

      if (remaining > 0) {
        target.push(buffer.subarray(0, remaining));
        capturedBytes += remaining;
      }

      requestTermination(
        new AgentCliProcessError(
          'output-limit',
          request.label +
            ' output exceeded the limit of ' +
            maxOutputBytes +
            ' bytes',
        ),
      );
    };

    function onStdout(chunk: unknown): void {
      append(stdoutChunks, chunk);
    }

    function onStderr(chunk: unknown): void {
      append(stderrChunks, chunk);
    }

    function onError(error: Error): void {
      if (terminationError) {
        settleReject(terminationError);
        return;
      }

      settleReject(
        new AgentCliProcessError(
          'spawn-failed',
          request.label + ' failed to start',
          { cause: error },
        ),
      );
    }

    function onClose(code: number | null, signal: NodeJS.Signals | null): void {
      if (terminationError) {
        settleReject(terminationError);
        return;
      }

      settleResolve({ exitCode: code, signal });
    }

    function onAbort(): void {
      requestTermination(
        new AgentCliProcessError(
          'cancelled',
          request.label + ' execution cancelled',
        ),
      );
    }

    child.stdout.on('data', onStdout);
    child.stderr.on('data', onStderr);
    child.once('error', onError);
    child.once('close', onClose);
    request.signal?.addEventListener('abort', onAbort, { once: true });

    if (request.signal?.aborted) {
      onAbort();
    }

    timeoutTimer = setTimeout(() => {
      requestTermination(
        new AgentCliProcessError(
          'timeout',
          request.label + ' timed out after ' + request.timeoutMs + 'ms',
        ),
      );
    }, request.timeoutMs);
  });

  return {
    ...exit,
    stdout: Buffer.concat(stdoutChunks).toString(),
    stderr: Buffer.concat(stderrChunks).toString(),
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
