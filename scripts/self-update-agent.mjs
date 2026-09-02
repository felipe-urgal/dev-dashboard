#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { lstat, open, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  SelfUpdateAgentError,
  assertAgentEntrypointInstalled,
  getOrCreateSelfUpdateAgentToken,
  installSelfUpdateAgent,
  readSelfUpdateAgentToken,
  resolveSelfUpdateAgentPaths,
  sendSelfUpdateAgentRequest,
  startSelfUpdateAgentServer,
  verifyInstalledSelfUpdateAgent,
} from './self-update-agent-runtime.mjs';
import { SelfUpdateHandoffStore } from './self-update-handoff.mjs';

const START_TIMEOUT_MS = 4_000;
const STOP_TIMEOUT_MS = 4_000;
const POLL_INTERVAL_MS = 50;
const PROCESS_TIMEOUT_MS = 60_000;
const SHUTDOWN_TIMEOUT_MS = 15_000;
const READINESS_TIMEOUT_MS = 90_000;
const EXECUTION_POLL_INTERVAL_MS = 250;
const MAX_PROCESS_OUTPUT_BYTES = 128 * 1024;
const MAX_HEALTH_BYTES = 16 * 1024;
const MAX_LOCK_BYTES = 1024;
const REVISION_PATTERN = /^[0-9a-f]{40,64}$/;
const API_PORT_PATTERN = /^[1-9][0-9]{0,4}$/;
const EXECUTION_LOCK_FILE = 'execution.lock';
const RUNTIME_REVISION_HEADER = 'x-dev-dashboard-revision';

export class SelfUpdateExecutionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SelfUpdateExecutionError';
    this.code = code;
  }
}

function usage() {
  return [
    'Uso:',
    '  node scripts/self-update-agent.mjs install',
    '  node scripts/self-update-agent.mjs start',
    '  node scripts/self-update-agent.mjs stop',
    '  node scripts/self-update-agent.mjs status',
    '  node scripts/self-update-agent.mjs ping',
    '  node scripts/self-update-agent.mjs inspect <handoff-id>',
    '  node scripts/self-update-agent.mjs claim <handoff-id>',
    '  node scripts/self-update-agent.mjs execute <handoff-id>',
    '  node scripts/self-update-agent.mjs recover',
    '',
    'execute usa somente a checkout atual registrada pela própria cópia do Dev Dashboard, origin/main e o runtime local fixo.',
  ].join('\n');
}

function printJson(value, stdout) {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isErrnoCode(error, code) {
  return error instanceof Error && 'code' in error && error.code === code;
}

function isUnavailableError(error) {
  return (
    (error instanceof SelfUpdateAgentError &&
      error.code === 'AGENT_UNAVAILABLE') ||
    isErrnoCode(error, 'ENOENT') ||
    isErrnoCode(error, 'ECONNREFUSED')
  );
}

function safeMessage(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const message = value.trim().replaceAll(/\s+/g, ' ').slice(0, 500);
  return message || fallback;
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

async function pingAgent(paths) {
  let token;
  try {
    token = await readSelfUpdateAgentToken(paths);
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) {
      throw new SelfUpdateAgentError(
        'AGENT_TOKEN_MISSING',
        'Token local do self-update agent não foi encontrado.',
      );
    }
    throw error;
  }
  return await sendSelfUpdateAgentRequest('ping', { paths, token });
}

async function waitUntilReady(paths, timeoutMs = START_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await pingAgent(paths);
    } catch (error) {
      lastError = error;
      if (!isUnavailableError(error)) throw error;
      await sleep(POLL_INTERVAL_MS);
    }
  }
  throw new SelfUpdateAgentError(
    'AGENT_START_TIMEOUT',
    lastError instanceof Error
      ? `Agent instalado não ficou pronto: ${lastError.message}`
      : 'Agent instalado não ficou pronto dentro do limite.',
  );
}

async function waitUntilStopped(paths, timeoutMs = STOP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await pingAgent(paths);
      await sleep(POLL_INTERVAL_MS);
    } catch (error) {
      if (isUnavailableError(error)) return;
      throw error;
    }
  }
  throw new SelfUpdateAgentError(
    'AGENT_STOP_TIMEOUT',
    'Agent não encerrou dentro do limite.',
  );
}

export async function installAgent({ paths, sourceDirectory } = {}) {
  const activePaths = paths ?? resolveSelfUpdateAgentPaths();
  const activeSourceDirectory =
    sourceDirectory ?? path.dirname(fileURLToPath(import.meta.url));
  return await installSelfUpdateAgent({
    sourceDirectory: activeSourceDirectory,
    paths: activePaths,
  });
}

export async function startAgent({ paths, spawnProcess = spawn } = {}) {
  const activePaths = paths ?? resolveSelfUpdateAgentPaths();
  const installation = await verifyInstalledSelfUpdateAgent(activePaths);
  await getOrCreateSelfUpdateAgentToken(activePaths);

  try {
    const current = await pingAgent(activePaths);
    return { ...current, status: 'already-running' };
  } catch (error) {
    if (!isUnavailableError(error)) throw error;
  }

  const child = spawnProcess(
    process.execPath,
    [installation.entrypoint, 'serve'],
    {
      detached: true,
      shell: false,
      stdio: 'ignore',
      env: {
        ...process.env,
        DEV_DASHBOARD_SELF_UPDATE_INSTALL_DIR: activePaths.installRoot,
        DEV_DASHBOARD_CONFIG_DIR: activePaths.configDirectory,
        DEV_DASHBOARD_STATE_DIR: path.dirname(activePaths.stateDirectory),
        DEV_DASHBOARD_SELF_UPDATE_RUNTIME_DIR: activePaths.runtimeDirectory,
      },
    },
  );

  try {
    const ready = await waitUntilReady(activePaths);
    child.unref();
    return { ...ready, status: 'started' };
  } catch (error) {
    if (typeof child.pid === 'number') {
      try {
        process.kill(child.pid, 'SIGTERM');
      } catch {
        // O processo pode ter encerrado antes da limpeza.
      }
    }
    throw error;
  }
}

export async function stopAgent({ paths } = {}) {
  const activePaths = paths ?? resolveSelfUpdateAgentPaths();
  let current;
  try {
    current = await pingAgent(activePaths);
  } catch (error) {
    if (isUnavailableError(error)) return { status: 'already-stopped' };
    throw error;
  }

  if (!Number.isSafeInteger(current.pid) || current.pid <= 1) {
    throw new SelfUpdateAgentError(
      'AGENT_IDENTITY_INVALID',
      'Agent respondeu com PID inválido; encerramento recusado.',
    );
  }

  process.kill(current.pid, 'SIGTERM');
  await waitUntilStopped(activePaths);
  return { status: 'stopped', instanceId: current.instanceId };
}

export async function agentStatus({ paths } = {}) {
  const activePaths = paths ?? resolveSelfUpdateAgentPaths();
  try {
    const current = await pingAgent(activePaths);
    return { ...current, status: 'running' };
  } catch (error) {
    if (isUnavailableError(error)) return { status: 'stopped' };
    throw error;
  }
}

async function serveInstalledAgent({ paths } = {}) {
  const activePaths = paths ?? resolveSelfUpdateAgentPaths();
  const installation = await assertAgentEntrypointInstalled(
    fileURLToPath(import.meta.url),
    activePaths,
  );
  const token = await readSelfUpdateAgentToken(activePaths);
  const runtime = await startSelfUpdateAgentServer({
    paths: activePaths,
    token,
    release: installation.release,
  });

  await new Promise((resolve, reject) => {
    let closing = false;
    const shutdown = async () => {
      if (closing) return;
      closing = true;
      try {
        await runtime.close();
        resolve();
      } catch (error) {
        reject(error);
      }
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  });
}

async function requestAgent(action, handoffId, paths) {
  const activePaths = paths ?? resolveSelfUpdateAgentPaths();
  const token = await readSelfUpdateAgentToken(activePaths);
  return await sendSelfUpdateAgentRequest(action, {
    paths: activePaths,
    token,
    ...(handoffId ? { handoffId } : {}),
  });
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
    let timeout;

    const finishError = (error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      child.kill('SIGTERM');
      reject(error);
    };

    const append = (current, chunk) => {
      const next = current + chunk.toString('utf8');
      if (Buffer.byteLength(next, 'utf8') > MAX_PROCESS_OUTPUT_BYTES) {
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

    timeout = setTimeout(() => {
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
      if (timeout) clearTimeout(timeout);
      resolve({ code: code ?? (signal ? 1 : 0), stdout, stderr });
    });
  });
}

function assertProcessSuccess(result, code, fallbackMessage) {
  if (result.code === 0) return;
  throw new SelfUpdateExecutionError(
    code,
    safeMessage(result.stderr, fallbackMessage),
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
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    const revision = response.headers?.get?.(RUNTIME_REVISION_HEADER);
    return {
      ...parsed,
      ...(typeof revision === 'string' && REVISION_PATTERN.test(revision)
        ? { revision }
        : {}),
    };
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
    assertProcessSuccess(
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
    assertProcessSuccess(
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

    const fetched = await this.git(['fetch', '--no-tags', 'origin', 'main']);
    assertProcessSuccess(
      fetched,
      'SELF_UPDATE_FETCH_FAILED',
      'Não foi possível consultar origin/main para o self-update.',
    );

    const remote = await this.git(['rev-parse', '--verify', 'origin/main']);
    assertProcessSuccess(
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
    assertProcessSuccess(
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
      await sleep(EXECUTION_POLL_INTERVAL_MS);
    }
    throw new SelfUpdateExecutionError(
      'SELF_UPDATE_API_SHUTDOWN_TIMEOUT',
      'API antiga não encerrou dentro do limite; update não foi aplicado.',
    );
  }

  async apply(targetRevision) {
    assertRevision(targetRevision);
    const merged = await this.git(['merge', '--ff-only', targetRevision]);
    assertProcessSuccess(
      merged,
      'SELF_UPDATE_APPLY_FAILED',
      'Não foi possível aplicar a revision confirmada por fast-forward.',
    );

    const current = await this.git(['rev-parse', '--verify', 'HEAD']);
    assertProcessSuccess(
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
      await sleep(EXECUTION_POLL_INTERVAL_MS);
    }
    throw new SelfUpdateExecutionError(
      'SELF_UPDATE_READINESS_TIMEOUT',
      'Nova API não comprovou readiness e revision dentro do limite.',
    );
  }
}

async function assertRepositoryRoot(repositoryRoot) {
  if (typeof repositoryRoot !== 'string' || !path.isAbsolute(repositoryRoot)) {
    throw new SelfUpdateExecutionError(
      'SELF_UPDATE_REPOSITORY_INVALID',
      'Checkout do self-update deve ser um caminho absoluto.',
    );
  }
  const metadata = await lstat(repositoryRoot);
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    (uid !== null && metadata.uid !== uid)
  ) {
    throw new SelfUpdateExecutionError(
      'SELF_UPDATE_REPOSITORY_INVALID',
      'Checkout do self-update não é um diretório local confiável.',
    );
  }
  const canonical = await realpath(repositoryRoot);
  if (canonical !== path.resolve(repositoryRoot)) {
    throw new SelfUpdateExecutionError(
      'SELF_UPDATE_REPOSITORY_INVALID',
      'Checkout do self-update não pode depender de symlink.',
    );
  }

  let packageJson;
  try {
    packageJson = JSON.parse(
      await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
    );
  } catch {
    throw new SelfUpdateExecutionError(
      'SELF_UPDATE_REPOSITORY_INVALID',
      'Checkout do self-update não possui package.json válido.',
    );
  }
  if (packageJson?.name !== 'dev-dashboard') {
    throw new SelfUpdateExecutionError(
      'SELF_UPDATE_REPOSITORY_INVALID',
      'Checkout registrada não pertence ao Dev Dashboard.',
    );
  }
  return canonical;
}

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (isErrnoCode(error, 'ESRCH')) return false;
    return true;
  }
}

async function acquireExecutionLock(paths, handoffId) {
  const lockPath = path.join(paths.stateDirectory, EXECUTION_LOCK_FILE);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, 'wx', 0o600);
      try {
        await handle.writeFile(
          `${JSON.stringify({ pid: process.pid, handoffId })}\n`,
          'utf8',
        );
      } finally {
        await handle.close();
      }
      return async () => {
        await rm(lockPath, { force: true });
      };
    } catch (error) {
      if (!isErrnoCode(error, 'EEXIST')) throw error;

      const metadata = await lstat(lockPath);
      const uid = typeof process.getuid === 'function' ? process.getuid() : null;
      if (
        !metadata.isFile() ||
        metadata.isSymbolicLink() ||
        (uid !== null && metadata.uid !== uid) ||
        (metadata.mode & 0o077) !== 0 ||
        metadata.size > MAX_LOCK_BYTES
      ) {
        throw new SelfUpdateExecutionError(
          'SELF_UPDATE_EXECUTION_LOCK_UNSAFE',
          'Lock existente do self-update não é confiável.',
        );
      }

      let lock;
      try {
        lock = JSON.parse(await readFile(lockPath, 'utf8'));
      } catch {
        throw new SelfUpdateExecutionError(
          'SELF_UPDATE_EXECUTION_LOCK_UNSAFE',
          'Lock existente do self-update é inválido.',
        );
      }
      if (processIsAlive(lock?.pid)) {
        throw new SelfUpdateExecutionError(
          'SELF_UPDATE_EXECUTION_ALREADY_RUNNING',
          'Já existe uma execução de self-update ativa.',
        );
      }
      await rm(lockPath);
    }
  }

  throw new SelfUpdateExecutionError(
    'SELF_UPDATE_EXECUTION_ALREADY_RUNNING',
    'Não foi possível adquirir exclusividade para o self-update.',
  );
}

function executionResult(error, fallbackCode) {
  return {
    code:
      typeof error?.code === 'string' && /^[A-Z0-9_]{1,96}$/.test(error.code)
        ? error.code
        : fallbackCode,
    message: safeMessage(
      error instanceof Error ? error.message : '',
      'Falha local durante o self-update.',
    ),
  };
}

export async function runSelfUpdateExecutionWorker({
  handoffId,
  paths,
  repositoryRoot,
  executor,
  store,
} = {}) {
  const activePaths = paths ?? resolveSelfUpdateAgentPaths();
  const activeStore = store ?? new SelfUpdateHandoffStore(activePaths.stateDirectory);
  await activeStore.ready();
  const releaseLock = await acquireExecutionLock(activePaths, handoffId);

  try {
    const handoff = await activeStore.get(handoffId);
    if (!handoff || handoff.status !== 'accepted') {
      throw new SelfUpdateExecutionError(
        'SELF_UPDATE_HANDOFF_NOT_ACCEPTED',
        'Worker só executa handoff previamente aceito pelo agent.',
      );
    }

    const root = await assertRepositoryRoot(repositoryRoot);
    const activeExecutor = executor ?? new SelfUpdateExecutor({ repositoryRoot: root });

    try {
      await activeExecutor.waitForApiShutdown();
      await activeStore.transition(handoff.id, 'applying');
      await activeExecutor.preflight(handoff.targetRevision);
      const appliedRevision = await activeExecutor.apply(handoff.targetRevision);

      await installSelfUpdateAgent({
        sourceDirectory: path.join(root, 'scripts'),
        paths: activePaths,
      });

      await activeStore.transition(handoff.id, 'restarting');
      await activeExecutor.startRuntime(handoff.targetRevision);
      await activeStore.transition(handoff.id, 'verifying');
      const verifiedRevision = await activeExecutor.waitForReadiness(
        handoff.targetRevision,
      );

      if (verifiedRevision !== appliedRevision) {
        throw new SelfUpdateExecutionError(
          'SELF_UPDATE_VERIFIED_REVISION_MISMATCH',
          'Revision comprovada pela nova API diverge da revision aplicada.',
        );
      }

      return await activeStore.transition(handoff.id, 'succeeded', {
        code: 'SELF_UPDATE_SUCCEEDED',
        message: 'Self-update aplicado e nova API validada com sucesso.',
        appliedRevision,
      });
    } catch (error) {
      const current = await activeStore.get(handoff.id);
      if (!current || ['succeeded', 'failed', 'recovery_required'].includes(current.status)) {
        throw error;
      }
      const nextStatus = current.status === 'accepted' ? 'failed' : 'recovery_required';
      await activeStore.transition(
        handoff.id,
        nextStatus,
        executionResult(
          error,
          nextStatus === 'failed'
            ? 'SELF_UPDATE_PRECHECK_FAILED'
            : 'SELF_UPDATE_RECOVERY_REQUIRED',
        ),
      );
      throw error;
    }
  } finally {
    await releaseLock();
  }
}

async function spawnInstalledExecutionWorker({
  handoffId,
  paths,
  repositoryRoot,
  spawnProcess = spawn,
}) {
  const activePaths = paths ?? resolveSelfUpdateAgentPaths();
  const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
  const installation = await installAgent({
    paths: activePaths,
    sourceDirectory,
  });

  return await new Promise((resolve, reject) => {
    const child = spawnProcess(
      process.execPath,
      [installation.entrypoint, 'execute-worker', handoffId],
      {
        detached: true,
        shell: false,
        stdio: 'ignore',
        env: {
          ...process.env,
          DEV_DASHBOARD_SELF_UPDATE_INSTALL_DIR: activePaths.installRoot,
          DEV_DASHBOARD_CONFIG_DIR: activePaths.configDirectory,
          DEV_DASHBOARD_STATE_DIR: path.dirname(activePaths.stateDirectory),
          DEV_DASHBOARD_SELF_UPDATE_RUNTIME_DIR: activePaths.runtimeDirectory,
          DEV_DASHBOARD_SELF_UPDATE_REPOSITORY_ROOT: repositoryRoot,
        },
      },
    );
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve({ status: 'worker-started', handoffId, pid: child.pid });
    });
  });
}

export async function executeAcceptedHandoff({
  handoffId,
  paths,
  repositoryRoot,
  executor,
  spawnProcess = spawn,
} = {}) {
  const activePaths = paths ?? resolveSelfUpdateAgentPaths();
  const handoff = await requestAgent('inspect', handoffId, activePaths);
  if (handoff?.status !== 'accepted') {
    throw new SelfUpdateExecutionError(
      'SELF_UPDATE_HANDOFF_NOT_ACCEPTED',
      'Handoff precisa ser aceito pelo agent antes de iniciar execução.',
    );
  }

  const root = await assertRepositoryRoot(
    repositoryRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  );
  const activeExecutor = executor ?? new SelfUpdateExecutor({ repositoryRoot: root });
  await activeExecutor.preflight(handoff.targetRevision);

  return await spawnInstalledExecutionWorker({
    handoffId,
    paths: activePaths,
    repositoryRoot: root,
    spawnProcess,
  });
}

async function runInstalledExecutionWorker(handoffId, paths) {
  const activePaths = paths ?? resolveSelfUpdateAgentPaths();
  await assertAgentEntrypointInstalled(fileURLToPath(import.meta.url), activePaths);
  const repositoryRoot = process.env.DEV_DASHBOARD_SELF_UPDATE_REPOSITORY_ROOT;
  await runSelfUpdateExecutionWorker({
    handoffId,
    paths: activePaths,
    repositoryRoot,
  });
}

export async function runSelfUpdateAgent(
  argv,
  { paths, stdout = process.stdout, stderr = process.stderr } = {},
) {
  const [command, ...args] = argv;

  try {
    if (!command || command === 'help') {
      if (args.length !== 0) throw new Error('help não aceita argumentos.');
      stdout.write(`${usage()}\n`);
      return 0;
    }

    if (command === 'install') {
      if (args.length !== 0) throw new Error('install não aceita argumentos.');
      const installation = await installAgent({ paths });
      printJson(
        {
          status: 'installed',
          release: installation.release,
          entrypoint: installation.entrypoint,
        },
        stdout,
      );
      return 0;
    }

    if (command === 'start') {
      if (args.length !== 0) throw new Error('start não aceita argumentos.');
      printJson(await startAgent({ paths }), stdout);
      return 0;
    }

    if (command === 'stop') {
      if (args.length !== 0) throw new Error('stop não aceita argumentos.');
      printJson(await stopAgent({ paths }), stdout);
      return 0;
    }

    if (command === 'status') {
      if (args.length !== 0) throw new Error('status não aceita argumentos.');
      printJson(await agentStatus({ paths }), stdout);
      return 0;
    }

    if (command === 'ping' || command === 'recover') {
      if (args.length !== 0) {
        throw new Error(`${command} não aceita argumentos.`);
      }
      printJson(await requestAgent(command, undefined, paths), stdout);
      return 0;
    }

    if (command === 'inspect' || command === 'claim') {
      if (args.length !== 1) {
        throw new Error(`${command} exige exatamente um handoff-id.`);
      }
      printJson(await requestAgent(command, args[0], paths), stdout);
      return 0;
    }

    if (command === 'execute') {
      if (args.length !== 1) {
        throw new Error('execute exige exatamente um handoff-id.');
      }
      printJson(
        await executeAcceptedHandoff({ handoffId: args[0], paths }),
        stdout,
      );
      return 0;
    }

    if (command === 'execute-worker') {
      if (args.length !== 1) {
        throw new Error('execute-worker exige exatamente um handoff-id.');
      }
      await runInstalledExecutionWorker(args[0], paths);
      return 0;
    }

    if (command === 'serve') {
      if (args.length !== 0) throw new Error('serve não aceita argumentos.');
      await serveInstalledAgent({ paths });
      return 0;
    }

    stderr.write(`${usage()}\n`);
    return 2;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha desconhecida.';
    stderr.write(`Self-update agent: ${message}\n`);
    return 1;
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  process.exitCode = await runSelfUpdateAgent(process.argv.slice(2));
}
