import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, readFile, readdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { diagnose } from './doctor.mjs';
import {
  LOCAL_SERVICE_NAME,
  isManagedUnit,
  readLocalInstallMetadata,
  resolveLocalInstallPaths,
  runCommand,
} from './local-install.mjs';

export const ROOT_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const REVISION_PATTERN = /^[0-9a-f]{40,64}$/;

export function runChild(command, args, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn;
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, {
      cwd: options.cwd ?? ROOT_DIRECTORY,
      env: options.env ?? process.env,
      stdio: 'inherit',
      shell: false,
      detached: process.platform !== 'win32',
    });
    let forceTimer;
    const stop = (signal) => {
      try {
        process.platform === 'win32'
          ? child.kill(signal)
          : process.kill(-child.pid, signal);
      } catch (error) {
        if (!(error && error.code === 'ESRCH'))
          console.error('Falha ao encaminhar sinal:', error);
      }
      forceTimer = setTimeout(() => {
        try {
          process.platform === 'win32'
            ? child.kill('SIGKILL')
            : process.kill(-child.pid, 'SIGKILL');
        } catch {}
      }, 3_000);
      forceTimer.unref();
    };
    const onInt = () => stop('SIGINT');
    const onTerm = () => stop('SIGTERM');
    if (options.forwardSignals) {
      process.once('SIGINT', onInt);
      process.once('SIGTERM', onTerm);
    }
    const cleanup = () => {
      if (forceTimer) clearTimeout(forceTimer);
      process.removeListener('SIGINT', onInt);
      process.removeListener('SIGTERM', onTerm);
    };
    child.once('error', (error) => {
      cleanup();
      reject(error);
    });
    child.once('exit', (code, signal) => {
      cleanup();
      resolve({ code: code ?? (signal ? 1 : 0), signal, child });
    });
  });
}

export function readGitRevision(rootDirectory, options = {}) {
  const spawnProcess = options.spawnProcess ?? spawn;
  return new Promise((resolve, reject) => {
    const child = spawnProcess('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd: rootDirectory,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      const revision = stdout.trim();
      if (code === 0 && REVISION_PATTERN.test(revision)) {
        resolve(revision);
        return;
      }
      reject(
        new Error(
          stderr.trim() ||
            'Não foi possível resolver a revision atual do Dev Dashboard.',
        ),
      );
    });
  });
}

export async function resolveInstalledEnvironment(options = {}) {
  const environment = options.environment ?? process.env;
  const root = await (options.resolveRealpath ?? realpath)(
    options.rootDirectory ?? ROOT_DIRECTORY,
  );
  const paths = resolveLocalInstallPaths(
    environment,
    options.homeDirectory ?? homedir(),
  );
  const metadata = await (
    options.readInstallMetadata ?? readLocalInstallMetadata
  )(paths.metadataPath);
  const managedUnit = await (options.checkManagedUnit ?? isManagedUnit)(
    paths.unitPath,
  );

  if (
    !metadata ||
    metadata.repositoryRoot !== root ||
    metadata.unit !== LOCAL_SERVICE_NAME ||
    !managedUnit
  ) {
    throw new Error(
      'Instalação local inválida ou inconsistente. Execute npm run local:install novamente.',
    );
  }

  return {
    ...environment,
    DEV_DASHBOARD_API_PORT: String(metadata.port),
    DEV_DASHBOARD_LOCAL_ORIGIN: metadata.origin,
  };
}

export async function delegateManagedSelfUpdate(options = {}) {
  const environment = options.environment ?? process.env;
  const targetRevision = environment.DEV_DASHBOARD_RUNTIME_REVISION?.trim();
  const selfUpdateRoot =
    environment.DEV_DASHBOARD_SELF_UPDATE_REPOSITORY_ROOT?.trim();
  if (!REVISION_PATTERN.test(targetRevision ?? '') || !selfUpdateRoot) {
    return null;
  }

  let root;
  let handoffRoot;
  try {
    root = await (options.resolveRealpath ?? realpath)(
      options.rootDirectory ?? ROOT_DIRECTORY,
    );
    handoffRoot = await (options.resolveRealpath ?? realpath)(selfUpdateRoot);
  } catch {
    return null;
  }
  if (root !== handoffRoot) return null;

  const paths = resolveLocalInstallPaths(
    environment,
    options.homeDirectory ?? homedir(),
  );
  const metadata = await readLocalInstallMetadata(paths.metadataPath);
  if (
    !metadata ||
    metadata.repositoryRoot !== root ||
    metadata.unit !== LOCAL_SERVICE_NAME ||
    !(await isManagedUnit(paths.unitPath))
  ) {
    return null;
  }

  const run = options.runServiceCommand ?? runCommand;
  const build = await run(npmCommand, ['run', 'build'], {
    cwd: root,
    env: environment,
  });
  if (build.code !== 0) {
    const detail = build.stderr.trim() || build.stdout.trim();
    throw new Error(
      detail
        ? `Build do self-update falhou antes do restart gerenciado: ${detail}`
        : 'Build do self-update falhou antes do restart gerenciado.',
    );
  }

  const result = await run(
    'systemctl',
    ['--user', 'start', LOCAL_SERVICE_NAME],
    { cwd: root, env: environment },
  );
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(
      detail
        ? `Falha ao reiniciar runtime local via systemd: ${detail}`
        : 'Falha ao reiniciar runtime local via systemd.',
    );
  }

  console.info('Restart do self-update delegado ao systemd do usuário.');
  return { code: 0, manager: 'systemd-user' };
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? collectFiles(target) : [target];
    }),
  );
  return nested.flat();
}

export async function assertBuildHasNoCredentials(directory, options = {}) {
  const forbidden = [...(options.forbiddenValues ?? [])].filter(
    (value) => value?.length >= 16,
  );
  const configRoot =
    process.env.DEV_DASHBOARD_CONFIG_DIR ??
    path.join(
      process.env.XDG_CONFIG_HOME ?? path.join(homedir(), '.config'),
      'dev-dashboard',
    );
  try {
    forbidden.push(
      (await readFile(path.join(configRoot, 'api-token'), 'utf8')).trim(),
    );
  } catch {}
  const credentialPattern =
    /(?:DEV_DASHBOARD_(?:TOKEN|SECRET)|api[_-]?token)\s*[:=]\s*["'][a-f0-9]{32,}["']/i;
  for (const file of await collectFiles(directory)) {
    const contents = await readFile(file, 'utf8').catch(() => '');
    if (
      credentialPattern.test(contents) ||
      forbidden.some((value) => contents.includes(value))
    ) {
      throw new Error(
        `Credencial encontrada no frontend compilado: ${path.relative(directory, file)}`,
      );
    }
  }
}

export async function orchestrate(options = {}) {
  const root = options.rootDirectory ?? ROOT_DIRECTORY;
  const diagnoseEnvironment = options.diagnoseEnvironment ?? diagnose;
  const runner = options.runner ?? runChild;
  const checker = options.fileChecker ?? access;
  const installed = options.installed ?? process.argv.includes('--installed');
  let environment = options.environment ?? process.env;

  if (!installed) {
    const delegated = await (
      options.delegateSelfUpdate ?? delegateManagedSelfUpdate
    )({
      rootDirectory: root,
      environment,
      ...(options.homeDirectory
        ? { homeDirectory: options.homeDirectory }
        : {}),
      ...(options.resolveRealpath
        ? { resolveRealpath: options.resolveRealpath }
        : {}),
      ...(options.runServiceCommand
        ? { runServiceCommand: options.runServiceCommand }
        : {}),
    });
    if (delegated) return delegated.code;
  } else {
    environment = await (
      options.resolveInstalledEnvironment ?? resolveInstalledEnvironment
    )({
      rootDirectory: root,
      environment,
      ...(options.homeDirectory
        ? { homeDirectory: options.homeDirectory }
        : {}),
      ...(options.resolveRealpath
        ? { resolveRealpath: options.resolveRealpath }
        : {}),
    });
  }

  const results = await diagnoseEnvironment({
    rootDirectory: root,
    mode: 'distribution',
    apiPort: environment.DEV_DASHBOARD_API_PORT,
  });
  if (results.some((item) => item.status === 'error'))
    throw new Error('Diagnóstico encontrou erros; inicialização abortada.');

  if (!installed) {
    const build = await runner(npmCommand, ['run', 'build'], {
      cwd: root,
      env: environment,
    });
    if (build.code !== 0) return build.code;
  }

  const webDist = path.join(root, 'apps/web/dist');
  await checker(webDist);
  await (options.buildScanner ?? assertBuildHasNoCredentials)(webDist);
  const browserBootstrap = (
    options.createBootstrapToken ?? (() => randomBytes(32).toString('hex'))
  )();
  const port = environment.DEV_DASHBOARD_API_PORT ?? '4343';
  const localOrigin =
    environment.DEV_DASHBOARD_LOCAL_ORIGIN ?? `http://127.0.0.1:${port}`;
  let runtimeRevision = environment.DEV_DASHBOARD_RUNTIME_REVISION;
  if (installed && !runtimeRevision) {
    runtimeRevision = await (
      options.resolveRuntimeRevision ??
      ((directory) => readGitRevision(directory))
    )(root);
  }
  console.info(`Abra o dashboard por esta URL:\n${localOrigin}`);
  const server = await runner(
    process.execPath,
    [path.join(root, 'apps/api/dist/server.js')],
    {
      cwd: root,
      env: {
        ...environment,
        DEV_DASHBOARD_LOCAL_DISTRIBUTION: '1',
        DEV_DASHBOARD_WEB_DIST: webDist,
        DEV_DASHBOARD_BROWSER_BOOTSTRAP: browserBootstrap,
        ...(runtimeRevision
          ? { DEV_DASHBOARD_RUNTIME_REVISION: runtimeRevision }
          : {}),
      },
      forwardSignals: true,
    },
  );
  return server.code;
}

export async function main() {
  try {
    process.exitCode = await orchestrate();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], 'file:').href
)
  await main();
