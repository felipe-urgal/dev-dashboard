import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { diagnose } from './doctor.mjs';

export const ROOT_DIRECTORY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

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
  const results = await diagnoseEnvironment({
    rootDirectory: root,
    mode: 'distribution',
  });
  if (results.some((item) => item.status === 'error'))
    throw new Error('Diagnóstico encontrou erros; inicialização abortada.');
  const build = await runner(npmCommand, ['run', 'build'], { cwd: root });
  if (build.code !== 0) return build.code;
  const webDist = path.join(root, 'apps/web/dist');
  await checker(webDist);
  await (options.buildScanner ?? assertBuildHasNoCredentials)(webDist);
  const browserBootstrap = (
    options.createBootstrapToken ?? (() => randomBytes(32).toString('hex'))
  )();
  const port = process.env.DEV_DASHBOARD_API_PORT ?? '4343';
  console.info(
    `Abra o dashboard por esta URL:\nhttp://127.0.0.1:${port}/#bootstrap=${browserBootstrap}`,
  );
  const server = await runner(
    process.execPath,
    [path.join(root, 'apps/api/dist/server.js')],
    {
      cwd: root,
      env: {
        ...process.env,
        DEV_DASHBOARD_LOCAL_DISTRIBUTION: '1',
        DEV_DASHBOARD_WEB_DIST: webDist,
        DEV_DASHBOARD_BROWSER_BOOTSTRAP: browserBootstrap,
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
