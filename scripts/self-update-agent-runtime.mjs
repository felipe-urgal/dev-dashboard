import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  chmod,
  link,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';

import { SelfUpdateHandoffStore } from './self-update-handoff.mjs';

export const SELF_UPDATE_AGENT_PROTOCOL_VERSION = 1;
export const SELF_UPDATE_AGENT_ACTIONS = Object.freeze([
  'ping',
  'inspect',
  'claim',
  'recover',
]);

const INSTALL_MANIFEST_VERSION = 1;
const INSTALL_MANIFEST_FILE = 'current.json';
const TOKEN_FILE = 'self-update-agent-token';
const SOCKET_FILE = 'agent.sock';
const MAX_REQUEST_BYTES = 8 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;
const MAX_TOKEN_FILE_BYTES = 256;
const REQUEST_TIMEOUT_MS = 3_000;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const REQUEST_ID_PATTERN = /^[0-9a-f-]{36}$/;
const HANDOFF_ID_PATTERN = /^self-update-[0-9a-f-]{36}$/;
const INSTALL_FILES = Object.freeze([
  'self-update-agent.mjs',
  'self-update-agent-runtime.mjs',
  'self-update-handoff.mjs',
]);

export class SelfUpdateAgentError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SelfUpdateAgentError';
    this.code = code;
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isErrnoCode(error, code) {
  return error instanceof Error && 'code' in error && error.code === code;
}

function hasOnlyKeys(value, keys) {
  return Object.keys(value).every((key) => keys.has(key));
}

function currentUid() {
  return typeof process.getuid === 'function' ? process.getuid() : null;
}

function assertAbsolutePath(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) {
    throw new SelfUpdateAgentError(
      'AGENT_PATH_INVALID',
      `${label} deve ser um caminho absoluto.`,
    );
  }
}

function resolveConfigDirectory() {
  const configured = process.env.DEV_DASHBOARD_CONFIG_DIR?.trim();
  if (configured) return path.resolve(configured);

  const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
  if (xdgConfigHome) {
    return path.join(path.resolve(xdgConfigHome), 'dev-dashboard');
  }

  return path.join(homedir(), '.config', 'dev-dashboard');
}

function resolveStateRoot() {
  const configured = process.env.DEV_DASHBOARD_STATE_DIR?.trim();
  if (configured) return path.resolve(configured);

  const xdgStateHome = process.env.XDG_STATE_HOME?.trim();
  if (xdgStateHome) {
    return path.join(path.resolve(xdgStateHome), 'dev-dashboard');
  }

  return path.join(homedir(), '.local', 'state', 'dev-dashboard');
}

function resolveInstallRoot() {
  const configured =
    process.env.DEV_DASHBOARD_SELF_UPDATE_INSTALL_DIR?.trim();
  if (configured) return path.resolve(configured);

  return path.join(
    homedir(),
    '.local',
    'lib',
    'dev-dashboard',
    'self-update-agent',
  );
}

function resolveRuntimeDirectory(stateRoot) {
  const configured =
    process.env.DEV_DASHBOARD_SELF_UPDATE_RUNTIME_DIR?.trim();
  if (configured) return path.resolve(configured);

  const xdgRuntimeDirectory = process.env.XDG_RUNTIME_DIR?.trim();
  if (xdgRuntimeDirectory) {
    return path.join(
      path.resolve(xdgRuntimeDirectory),
      'dev-dashboard',
      'self-update-agent',
    );
  }

  return path.join(stateRoot, 'runtime', 'self-update-agent');
}

export function resolveSelfUpdateAgentPaths(overrides = {}) {
  const installRoot = overrides.installRoot ?? resolveInstallRoot();
  const configDirectory = overrides.configDirectory ?? resolveConfigDirectory();
  const stateRoot = overrides.stateRoot ?? resolveStateRoot();
  const runtimeDirectory =
    overrides.runtimeDirectory ?? resolveRuntimeDirectory(stateRoot);

  for (const [label, value] of [
    ['Diretório de instalação', installRoot],
    ['Diretório de configuração', configDirectory],
    ['Diretório de estado', stateRoot],
    ['Diretório de runtime', runtimeDirectory],
  ]) {
    assertAbsolutePath(value, label);
  }

  return {
    installRoot,
    releasesDirectory: path.join(installRoot, 'releases'),
    installManifestPath: path.join(installRoot, INSTALL_MANIFEST_FILE),
    configDirectory,
    tokenPath: path.join(configDirectory, TOKEN_FILE),
    stateDirectory: path.join(stateRoot, 'self-update'),
    runtimeDirectory,
    socketPath: path.join(runtimeDirectory, SOCKET_FILE),
  };
}

async function inspectPrivateDirectory(directory) {
  assertAbsolutePath(directory, 'Diretório privado');
  const metadata = await lstat(directory);
  const uid = currentUid();

  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    (uid !== null && metadata.uid !== uid) ||
    (metadata.mode & 0o077) !== 0
  ) {
    throw new SelfUpdateAgentError(
      'AGENT_DIRECTORY_UNSAFE',
      'Diretório local do agent não é um diretório privado confiável.',
    );
  }

  return metadata;
}

async function ensurePrivateDirectory(directory) {
  assertAbsolutePath(directory, 'Diretório privado');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const metadata = await lstat(directory);
  const uid = currentUid();

  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    (uid !== null && metadata.uid !== uid)
  ) {
    throw new SelfUpdateAgentError(
      'AGENT_DIRECTORY_UNSAFE',
      'Diretório local do agent não é um diretório privado confiável.',
    );
  }

  await chmod(directory, 0o700);
}

async function assertPrivateRegularFile(filePath, maxBytes) {
  const metadata = await lstat(filePath);
  const uid = currentUid();

  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    (uid !== null && metadata.uid !== uid) ||
    (metadata.mode & 0o077) !== 0 ||
    metadata.size > maxBytes
  ) {
    throw new SelfUpdateAgentError(
      'AGENT_FILE_UNSAFE',
      `Arquivo privado inválido: ${path.basename(filePath)}.`,
    );
  }

  return metadata;
}

function secureTokenEqual(candidate, expected) {
  if (typeof candidate !== 'string') return false;
  const candidateBuffer = Buffer.from(candidate, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (candidateBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(candidateBuffer, expectedBuffer);
}

export async function readSelfUpdateAgentToken(paths) {
  try {
    await inspectPrivateDirectory(paths.configDirectory);
    await assertPrivateRegularFile(paths.tokenPath, MAX_TOKEN_FILE_BYTES);
    const token = (await readFile(paths.tokenPath, 'utf8')).trim();
    if (!TOKEN_PATTERN.test(token)) {
      throw new SelfUpdateAgentError(
        'AGENT_TOKEN_INVALID',
        'Token local do agent possui formato inválido.',
      );
    }
    return token;
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) {
      throw new SelfUpdateAgentError(
        'AGENT_TOKEN_MISSING',
        'Token local do self-update agent não foi encontrado.',
      );
    }
    throw error;
  }
}

export async function getOrCreateSelfUpdateAgentToken(paths) {
  await ensurePrivateDirectory(paths.configDirectory);
  try {
    return await readSelfUpdateAgentToken(paths);
  } catch (error) {
    if (
      !(error instanceof SelfUpdateAgentError) ||
      error.code !== 'AGENT_TOKEN_MISSING'
    ) {
      throw error;
    }
  }

  const token = randomBytes(32).toString('hex');
  const temporaryPath = path.join(
    paths.configDirectory,
    `.${TOKEN_FILE}.${process.pid}.${randomUUID()}.tmp`,
  );

  try {
    await writeFile(temporaryPath, `${token}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    try {
      await link(temporaryPath, paths.tokenPath);
      await chmod(paths.tokenPath, 0o600);
      return token;
    } catch (error) {
      if (isErrnoCode(error, 'EEXIST')) {
        return await readSelfUpdateAgentToken(paths);
      }
      throw error;
    }
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function hashContent(content) {
  return createHash('sha256').update(content).digest('hex');
}

async function atomicJsonWrite(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function isInstallManifest(value) {
  if (!isRecord(value)) return false;
  if (
    !hasOnlyKeys(
      value,
      new Set(['version', 'release', 'files', 'installedAt']),
    ) ||
    value.version !== INSTALL_MANIFEST_VERSION ||
    typeof value.release !== 'string' ||
    !HASH_PATTERN.test(value.release) ||
    typeof value.installedAt !== 'string' ||
    Number.isNaN(Date.parse(value.installedAt)) ||
    !isRecord(value.files) ||
    !hasOnlyKeys(value.files, new Set(INSTALL_FILES))
  ) {
    return false;
  }

  return INSTALL_FILES.every(
    (fileName) =>
      typeof value.files[fileName] === 'string' &&
      HASH_PATTERN.test(value.files[fileName]),
  );
}

export async function installSelfUpdateAgent({ sourceDirectory, paths }) {
  assertAbsolutePath(sourceDirectory, 'Diretório fonte do agent');
  await ensurePrivateDirectory(paths.installRoot);
  await ensurePrivateDirectory(paths.releasesDirectory);
  await getOrCreateSelfUpdateAgentToken(paths);

  const files = {};
  const sourceContents = new Map();
  for (const fileName of INSTALL_FILES) {
    const sourcePath = path.join(sourceDirectory, fileName);
    const metadata = await lstat(sourcePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new SelfUpdateAgentError(
        'AGENT_SOURCE_INVALID',
        `Fonte inválida para instalação: ${fileName}.`,
      );
    }
    const content = await readFile(sourcePath);
    const digest = hashContent(content);
    files[fileName] = digest;
    sourceContents.set(fileName, content);
  }

  const release = hashContent(
    Buffer.from(
      INSTALL_FILES.map((fileName) => `${fileName}:${files[fileName]}`).join(
        '\n',
      ),
      'utf8',
    ),
  );
  const releaseDirectory = path.join(paths.releasesDirectory, release);

  try {
    await lstat(releaseDirectory);
  } catch (error) {
    if (!isErrnoCode(error, 'ENOENT')) throw error;
    const temporaryDirectory = path.join(
      paths.releasesDirectory,
      `.install-${process.pid}-${randomUUID()}`,
    );
    await mkdir(temporaryDirectory, { mode: 0o700 });
    try {
      for (const fileName of INSTALL_FILES) {
        await writeFile(
          path.join(temporaryDirectory, fileName),
          sourceContents.get(fileName),
          { mode: 0o500, flag: 'wx' },
        );
      }
      await rename(temporaryDirectory, releaseDirectory);
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true });
      if (!isErrnoCode(error, 'EEXIST') && !isErrnoCode(error, 'ENOTEMPTY')) {
        throw error;
      }
    }
  }

  const manifest = {
    version: INSTALL_MANIFEST_VERSION,
    release,
    files,
    installedAt: new Date().toISOString(),
  };
  await atomicJsonWrite(paths.installManifestPath, manifest);

  return await verifyInstalledSelfUpdateAgent(paths);
}

export async function verifyInstalledSelfUpdateAgent(paths) {
  await inspectPrivateDirectory(paths.installRoot);
  await inspectPrivateDirectory(paths.releasesDirectory);
  await assertPrivateRegularFile(paths.installManifestPath, 16 * 1024);

  let parsed;
  try {
    parsed = JSON.parse(await readFile(paths.installManifestPath, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new SelfUpdateAgentError(
        'AGENT_INSTALL_INVALID',
        'Manifesto da instalação do agent contém JSON inválido.',
      );
    }
    throw error;
  }

  if (!isInstallManifest(parsed)) {
    throw new SelfUpdateAgentError(
      'AGENT_INSTALL_INVALID',
      'Manifesto da instalação do agent é inválido.',
    );
  }

  const releaseDirectory = path.join(paths.releasesDirectory, parsed.release);
  await inspectPrivateDirectory(releaseDirectory);
  const releaseRealPath = await realpath(releaseDirectory);

  for (const fileName of INSTALL_FILES) {
    const filePath = path.join(releaseDirectory, fileName);
    await assertPrivateRegularFile(filePath, 512 * 1024);
    const fileRealPath = await realpath(filePath);
    if (path.dirname(fileRealPath) !== releaseRealPath) {
      throw new SelfUpdateAgentError(
        'AGENT_INSTALL_INVALID',
        `Arquivo instalado escapou da release: ${fileName}.`,
      );
    }
    const digest = hashContent(await readFile(filePath));
    if (digest !== parsed.files[fileName]) {
      throw new SelfUpdateAgentError(
        'AGENT_INSTALL_INVALID',
        `Hash da instalação divergente: ${fileName}.`,
      );
    }
  }

  return {
    release: parsed.release,
    releaseDirectory,
    entrypoint: path.join(releaseDirectory, 'self-update-agent.mjs'),
  };
}

export async function assertAgentEntrypointInstalled(entrypoint, paths) {
  const installation = await verifyInstalledSelfUpdateAgent(paths);
  const actual = await realpath(entrypoint);
  const expected = await realpath(installation.entrypoint);
  if (actual !== expected) {
    throw new SelfUpdateAgentError(
      'AGENT_NOT_INSTALLED_ENTRYPOINT',
      'O modo serve só pode executar a cópia instalada do agent.',
    );
  }
  return installation;
}

function parseAgentRequest(value) {
  if (!isRecord(value)) {
    throw new SelfUpdateAgentError(
      'AGENT_REQUEST_INVALID',
      'Request do agent precisa ser um objeto JSON.',
    );
  }

  if (
    !hasOnlyKeys(
      value,
      new Set(['version', 'requestId', 'token', 'action', 'handoffId']),
    ) ||
    value.version !== SELF_UPDATE_AGENT_PROTOCOL_VERSION ||
    typeof value.requestId !== 'string' ||
    !REQUEST_ID_PATTERN.test(value.requestId) ||
    typeof value.token !== 'string' ||
    !TOKEN_PATTERN.test(value.token) ||
    typeof value.action !== 'string' ||
    !SELF_UPDATE_AGENT_ACTIONS.includes(value.action)
  ) {
    throw new SelfUpdateAgentError(
      'AGENT_REQUEST_INVALID',
      'Request do agent possui shape ou valores inválidos.',
    );
  }

  const needsHandoff = value.action === 'inspect' || value.action === 'claim';
  if (
    needsHandoff !== (value.handoffId !== undefined) ||
    (needsHandoff &&
      (typeof value.handoffId !== 'string' ||
        !HANDOFF_ID_PATTERN.test(value.handoffId)))
  ) {
    throw new SelfUpdateAgentError(
      'AGENT_REQUEST_INVALID',
      'Request do agent possui parâmetros incompatíveis com a ação.',
    );
  }

  return value;
}

function safeError(error) {
  if (error instanceof SelfUpdateAgentError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: 'AGENT_OPERATION_FAILED',
    message: error instanceof Error ? error.message : 'Falha local no agent.',
  };
}

function writeResponse(socket, response) {
  const serialized = `${JSON.stringify(response)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > MAX_RESPONSE_BYTES) {
    socket.end(
      `${JSON.stringify({
        version: SELF_UPDATE_AGENT_PROTOCOL_VERSION,
        requestId: response.requestId,
        ok: false,
        error: {
          code: 'AGENT_RESPONSE_TOO_LARGE',
          message: 'Resposta do agent excedeu o limite permitido.',
        },
      })}\n`,
    );
    return;
  }
  socket.end(serialized);
}

async function isSocketLive(socketPath) {
  return await new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(true));
    socket.once('error', (error) => {
      if (isErrnoCode(error, 'ECONNREFUSED') || isErrnoCode(error, 'ENOENT')) {
        finish(false);
        return;
      }
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

async function prepareSocketPath(paths) {
  await ensurePrivateDirectory(paths.runtimeDirectory);
  try {
    const metadata = await lstat(paths.socketPath);
    const uid = currentUid();
    if (
      !metadata.isSocket() ||
      metadata.isSymbolicLink() ||
      (uid !== null && metadata.uid !== uid)
    ) {
      throw new SelfUpdateAgentError(
        'AGENT_SOCKET_UNSAFE',
        'Socket existente do agent não é confiável.',
      );
    }
    if (await isSocketLive(paths.socketPath)) {
      throw new SelfUpdateAgentError(
        'AGENT_ALREADY_RUNNING',
        'Já existe um agent ativo nesse socket.',
      );
    }
    await rm(paths.socketPath, { force: true });
  } catch (error) {
    if (isErrnoCode(error, 'ENOENT')) return;
    throw error;
  }
}

export async function startSelfUpdateAgentServer({
  paths,
  token,
  store = new SelfUpdateHandoffStore(paths.stateDirectory),
  release = 'test',
}) {
  await prepareSocketPath(paths);

  const instanceId = randomUUID();
  let mutationQueue = Promise.resolve();
  let resolveInitialization;
  let rejectInitialization;
  const initialization = new Promise((resolve, reject) => {
    resolveInitialization = resolve;
    rejectInitialization = reject;
  });

  const dispatch = async (request) => {
    await initialization;

    if (!secureTokenEqual(request.token, token)) {
      throw new SelfUpdateAgentError(
        'AGENT_AUTH_FAILED',
        'Autenticação local do agent recusada.',
      );
    }

    if (request.action === 'ping') {
      return {
        status: 'ready',
        pid: process.pid,
        instanceId,
        release,
        actions: [...SELF_UPDATE_AGENT_ACTIONS],
      };
    }

    if (request.action === 'inspect') {
      const handoff = await store.get(request.handoffId);
      if (!handoff) {
        throw new SelfUpdateAgentError(
          'AGENT_HANDOFF_NOT_FOUND',
          'Handoff de self-update não encontrado.',
        );
      }
      return handoff;
    }

    const mutate = async () => {
      if (request.action === 'claim') {
        return await store.claim(request.handoffId);
      }
      if (request.action === 'recover') {
        const recovered = await store.recoverInterrupted();
        return {
          recovered: recovered.length,
          handoffIds: recovered.map((handoff) => handoff.id),
        };
      }
      throw new SelfUpdateAgentError(
        'AGENT_ACTION_UNSUPPORTED',
        'Ação do agent não suportada.',
      );
    };

    const current = mutationQueue.then(mutate, mutate);
    mutationQueue = current.then(
      () => undefined,
      () => undefined,
    );
    return await current;
  };

  const server = createServer((socket) => {
    socket.setTimeout(REQUEST_TIMEOUT_MS);
    let content = '';
    let handled = false;

    const fail = (requestId, error) => {
      if (handled) return;
      handled = true;
      writeResponse(socket, {
        version: SELF_UPDATE_AGENT_PROTOCOL_VERSION,
        requestId,
        ok: false,
        error: safeError(error),
      });
    };

    socket.on('timeout', () => {
      fail(
        null,
        new SelfUpdateAgentError('AGENT_REQUEST_TIMEOUT', 'Request expirou.'),
      );
    });

    socket.on('data', async (chunk) => {
      if (handled) return;
      content += chunk.toString('utf8');
      if (Buffer.byteLength(content, 'utf8') > MAX_REQUEST_BYTES) {
        fail(
          null,
          new SelfUpdateAgentError(
            'AGENT_REQUEST_TOO_LARGE',
            'Request excedeu o limite permitido.',
          ),
        );
        return;
      }

      const newlineIndex = content.indexOf('\n');
      if (newlineIndex === -1) return;
      handled = true;
      const line = content.slice(0, newlineIndex);
      const remaining = content.slice(newlineIndex + 1).trim();
      let requestId = null;

      try {
        if (remaining) {
          throw new SelfUpdateAgentError(
            'AGENT_REQUEST_INVALID',
            'A conexão aceita exatamente uma request.',
          );
        }
        const parsed = JSON.parse(line);
        if (isRecord(parsed) && typeof parsed.requestId === 'string') {
          requestId = parsed.requestId;
        }
        const request = parseAgentRequest(parsed);
        requestId = request.requestId;
        const result = await dispatch(request);
        writeResponse(socket, {
          version: SELF_UPDATE_AGENT_PROTOCOL_VERSION,
          requestId,
          ok: true,
          result,
        });
      } catch (error) {
        writeResponse(socket, {
          version: SELF_UPDATE_AGENT_PROTOCOL_VERSION,
          requestId,
          ok: false,
          error: safeError(error),
        });
      }
    });
  });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(paths.socketPath, resolve);
    });
    await chmod(paths.socketPath, 0o600);
    await store.ready();
    await store.recoverInterrupted();
    resolveInitialization();
  } catch (error) {
    rejectInitialization(error);
    await new Promise((resolve) => server.close(() => resolve())).catch(
      () => undefined,
    );
    await rm(paths.socketPath, { force: true }).catch(() => undefined);
    throw error;
  }

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await new Promise((resolve) => server.close(() => resolve()));
    await rm(paths.socketPath, { force: true });
  };

  return { server, close, instanceId };
}

function validateAgentResponse(value, requestId) {
  if (
    !isRecord(value) ||
    value.version !== SELF_UPDATE_AGENT_PROTOCOL_VERSION ||
    value.requestId !== requestId ||
    typeof value.ok !== 'boolean'
  ) {
    throw new SelfUpdateAgentError(
      'AGENT_RESPONSE_INVALID',
      'Resposta do agent possui shape inválido.',
    );
  }
  return value;
}

export async function sendSelfUpdateAgentRequest(
  action,
  { handoffId, paths, token, timeoutMs = REQUEST_TIMEOUT_MS } = {},
) {
  if (!SELF_UPDATE_AGENT_ACTIONS.includes(action)) {
    throw new SelfUpdateAgentError(
      'AGENT_ACTION_UNSUPPORTED',
      'Ação local do agent não é suportada.',
    );
  }
  if ((action === 'inspect' || action === 'claim') && !handoffId) {
    throw new SelfUpdateAgentError(
      'AGENT_REQUEST_INVALID',
      'Ação exige handoffId.',
    );
  }
  if (action !== 'inspect' && action !== 'claim' && handoffId !== undefined) {
    throw new SelfUpdateAgentError(
      'AGENT_REQUEST_INVALID',
      'Ação não aceita handoffId.',
    );
  }

  const activePaths = paths ?? resolveSelfUpdateAgentPaths();
  const activeToken = token ?? (await readSelfUpdateAgentToken(activePaths));
  const requestId = randomUUID();
  const request = {
    version: SELF_UPDATE_AGENT_PROTOCOL_VERSION,
    requestId,
    token: activeToken,
    action,
    ...(handoffId ? { handoffId } : {}),
  };

  return await new Promise((resolve, reject) => {
    const socket = createConnection(activePaths.socketPath);
    let content = '';
    let settled = false;

    const finishError = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };

    socket.setTimeout(timeoutMs);
    socket.once('timeout', () =>
      finishError(
        new SelfUpdateAgentError(
          'AGENT_UNAVAILABLE',
          'Agent local não respondeu dentro do limite.',
        ),
      ),
    );
    socket.once('error', (error) => finishError(error));
    socket.once('connect', () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });
    socket.on('data', (chunk) => {
      if (settled) return;
      content += chunk.toString('utf8');
      if (Buffer.byteLength(content, 'utf8') > MAX_RESPONSE_BYTES) {
        finishError(
          new SelfUpdateAgentError(
            'AGENT_RESPONSE_TOO_LARGE',
            'Resposta do agent excedeu o limite permitido.',
          ),
        );
      }
    });
    socket.once('end', () => {
      if (settled) return;
      try {
        const response = validateAgentResponse(JSON.parse(content), requestId);
        settled = true;
        if (!response.ok) {
          reject(
            new SelfUpdateAgentError(
              response.error?.code ?? 'AGENT_OPERATION_FAILED',
              response.error?.message ?? 'Agent recusou a operação.',
            ),
          );
          return;
        }
        resolve(response.result);
      } catch (error) {
        reject(error);
      }
    });
  });
}
