import { spawn } from 'node:child_process';
import path from 'node:path';

const PROCESS_TIMEOUT_MS = 60_000;
const SHUTDOWN_TIMEOUT_MS = 15_000;
const READINESS_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 250;
const MAX_OUTPUT_BYTES = 128 * 1024;
const MAX_HEALTH_BYTES = 16 * 1024;
const REVISION_PATTERN = /^[0-9a-f]{40,64}$/;
const API_PORT_PATTERN = /^[1-9][0-9]{0,4}$/;

export class SelfUpdateExecutionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SelfUpdateExecutionError';
    this.code = code;
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assertRevision(revision) {
  if (typeof revision !== 'string' || !REVISION_PATTERN.test(revision)) {
    throw new SelfUpdateExecutionError(
      'SELF_UPDATE_REVISION_INVALID',
      'Revision alvo do self-update é inválida.',
    );
  }
}

function resolveApiPort() {
  const configured = process.env.DEV_DASHBOARD_API_PORT?.trim() || '4343';
  if (!API_PORT_PATTERN.test(configured)) {
    throw new SelfUpdateExecutionError(
      'SELF_UPDATE_API_PORT_INVALID',
      'Porta local da API é inválida para readiness do self-update.',
    );
  }
  const port = Number(configured);
  if (port > 65_535) {
    throw new SelfUpdateExecutionError(
      'SELF_UPDATE_API_PORT_INVALID',
      'Porta local da API é inválida para readiness do self-update.',
    );
  }
  return port;
}

function safeMessage(stderr) {
  return stderr.trim().replaceAll(/\s+/g, ' ').slice(0, 500);
}

export async function runBoundedProcess(
  command,
  args,
  {
    cwd,
    env = process.env,
    timeoutMs = PROCESS_TIMEOUT_MS,
    spawnProcess = spawn,
  } = {},
) {
  return await new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, {
      cwd,
      env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finishError = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.kill('SIGTERM');
      reject(error);
    };

    const append = (current, chunk) => {
      const next = current + chunk.toString('utf8');
      if (Buffer.byteLength(next, 'utf8') > MAX_OUTPUT_BYTES) {
        finishError(
          new SelfUpdateExecutionError(
            'SELF_UPDATE_PROCESS_OUTPUT_TOO_LARGE',
            'Processo do self-update excedeu o limite de saída.',
          ),
        );
        return current;
      }
      return next;
    };

    child.stdout.on('data', (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.once('error', finishError);

    const timeout = setTimeout(() => {
      finishError(
        new SelfUpdateExecutionError(
          'SELF_UPDATE_PROCESS_TIMEOUT',
          'Processo do self-update excedeu o timeout permitido.',
        ),
      );
    }, timeoutMs);
    timeout.unref();

    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ code: code ?? (signal ? 1 : 0), stdout, stderr });
    });
  });
}

function assertSuccess(result, code, fallbackMessage) {
  if (result.code === 0) return;
  throw new SelfUpdateExecutionError(
    code,
    safeMessage(result.stderr) || fallbackMessage,
  );
}

async function readHealth(healthUrl, fetchImpl) {
  try {
    const response = await fetchImpl(healthUrl, {
      signal: AbortSignal.timeout(1_000),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return null;
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_HEALTH_BYTES) return null;
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export class SelfUpdateExecutor {
  constructor({
    repositoryRoot,
    runProcess = runBoundedProcess,
    spawnProcess = spawn,
    fetchImpl = fetch,
    apiPort = resolveApiPort(),
  }) {
    if (typeof repositoryRoot !== 'string' || !path.isAbsolute(repositoryRoot)) {
      throw new SelfUpdateExecutionError(
        'SELF_UPDATE_REPOSITORY_INVALID',
        'Checkout registrada para self-update é inválida.',
      );
    }
    this.repositoryRoot = repositoryRoot;
    this.runProcess = runProcess;
    this.spawnProcess = spawnProcess;
    this.fetchImpl = fetchImpl;
    this.healthUrl = `http://127.0.0.1:${apiPort}/api/health`;
  }

  async git(args, options = {}) {
    return await this.runProcess('git', args, {
      cwd: this.repositoryRoot,
      ...options,
    });
  }

  async preflight(targetRevision) {
    assertRevision(targetRevision);

    const status = await this.git([
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
    ]);
    assertSuccess(
      status,
      'SELF_UPDATE_GIT_STATUS_FAILED',
      'Não foi possível verificar a working tree do Dev Dashboard.',
    );
    if (status.stdout.trim()) {
      throw new SelfUpdateExecutionError(
        'SELF_UPDATE_WORKTREE_DIRTY',
        'Self-update recusado porque a working tree do Dev Dashboard não está limpa.',
      );
    }

    const branch = await this.git(['branch', '--show-current']);
    assertSuccess(
      branch,
      'SELF_UPDATE_GIT_BRANCH_FAILED',
      'Não foi possível confirmar a branch atual do Dev Dashboard.',
    );
    if (branch.stdout.trim() !== 'main') {
      throw new SelfUpdateExecutionError(
        'SELF_UPDATE_BRANCH_MISMATCH',
        'Self-update exige a branch main na checkout registrada.',
      );
    }

    const fetched = await this.git(['fetch', '--no-tags', 'origin', 'main'], {
      timeoutMs: PROCESS_TIMEOUT_MS,
    });
    assertSuccess(
      fetched,
      'SELF_UPDATE_FETCH_FAILED',
      'Não foi possível consultar origin/main para o self-update.',
    );

    const remote = await this.git(['rev-parse', '--verify', 'origin/main']);
    assertSuccess(
      remote,
      'SELF_UPDATE_REMOTE_REVISION_UNAVAILABLE',
      'Não foi possível resolver origin/main para o self-update.',
    );
    if (remote.stdout.trim() !== targetRevision) {
      throw new SelfUpdateExecutionError(
        'SELF_UPDATE_REMOTE_REVISION_MISMATCH',
        'origin/main mudou depois da confirmação do self-update.',
      );
    }

    const current = await this.git(['rev-parse', '--verify', 'HEAD']);
    assertSuccess(
      current,
      'SELF_UPDATE_CURRENT_REVISION_UNAVAILABLE',
      'Não foi possível resolver a revision atual do Dev Dashboard.',
    );
    const currentRevision = current.stdout.trim();

    const ancestor = await this.git([
      'merge-base',
      '--is-ancestor',
      currentRevision,
      targetRevision,
    ]);
    if (ancestor.code !== 0) {
      throw new SelfUpdateExecutionError(
        'SELF_UPDATE_NOT_FAST_FORWARD',
        'Revision alvo não é fast-forward da checkout atual; self-update recusado.',
      );
    }

    return { currentRevision, targetRevision };
  }

  async waitForApiShutdown(timeoutMs = SHUTDOWN_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const health = await readHealth(this.healthUrl, this.fetchImpl);
      if (!health) return;
      await sleep(POLL_INTERVAL_MS);
    }
    throw new SelfUpdateExecutionError(
      'SELF_UPDATE_API_SHUTDOWN_TIMEOUT',
      'API antiga não encerrou dentro do limite; update não foi aplicado.',
    );
  }

  async apply(targetRevision) {
    assertRevision(targetRevision);
    const merged = await this.git(['merge', '--ff-only', targetRevision], {
      timeoutMs: PROCESS_TIMEOUT_MS,
    });
    assertSuccess(
      merged,
      'SELF_UPDATE_APPLY_FAILED',
      'Não foi possível aplicar a revision confirmada por fast-forward.',
    );

    const current = await this.git(['rev-parse', '--verify', 'HEAD']);
    assertSuccess(
      current,
      'SELF_UPDATE_APPLIED_REVISION_UNAVAILABLE',
      'Não foi possível comprovar a revision aplicada.',
    );
    if (current.stdout.trim() !== targetRevision) {
      throw new SelfUpdateExecutionError(
        'SELF_UPDATE_APPLIED_REVISION_MISMATCH',
        'Checkout não corresponde à revision confirmada depois da aplicação.',
      );
    }
    return targetRevision;
  }

  async startRuntime(targetRevision) {
    assertRevision(targetRevision);
    const entrypoint = path.join(this.repositoryRoot, 'scripts/dev-web.mjs');
    const child = this.spawnProcess(process.execPath, [entrypoint], {
      cwd: this.repositoryRoot,
      env: {
        ...process.env,
        DEV_DASHBOARD_RUNTIME_REVISION: targetRevision,
      },
      shell: false,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return { pid: child.pid };
  }

  async waitForReadiness(
    targetRevision,
    timeoutMs = READINESS_TIMEOUT_MS,
  ) {
    assertRevision(targetRevision);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const health = await readHealth(this.healthUrl, this.fetchImpl);
      if (
        health?.status === 'ok' &&
        health?.service === 'dev-dashboard-api' &&
        health?.revision === targetRevision
      ) {
        return targetRevision;
      }
      await sleep(POLL_INTERVAL_MS);
    }
    throw new SelfUpdateExecutionError(
      'SELF_UPDATE_READINESS_TIMEOUT',
      'Nova API não comprovou readiness e revision dentro do limite.',
    );
  }
}
