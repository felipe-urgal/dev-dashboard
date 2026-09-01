import { spawn } from 'node:child_process';
import process from 'node:process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

try {
  process.loadEnvFile('.env.local');
} catch (error) {
  if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
    throw error;
  }
}

const DEFAULT_PROCESS_DEFINITIONS = [
  { name: 'api', args: ['run', 'dev', '--workspace=@dev-dashboard/api'] },
  { name: 'web', args: ['run', 'dev', '--workspace=@dev-dashboard/web'] },
];

export function stopChild(child, signal, killFn = process.kill) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') {
      killFn(child.pid, signal);
      return;
    }
    killFn(-child.pid, signal);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH')
      return;
    console.error('Falha ao encerrar processo de desenvolvimento:', error);
  }
}

export function startChild(definition, options = {}) {
  const spawnProcess = options.spawnFn ?? spawn;
  const env = options.env ?? process.env;
  return spawnProcess(npmCommand, definition.args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
    detached: process.platform !== 'win32',
    env,
  });
}

export function getProcessDefinitions(options = {}) {
  return options.processDefinitions ?? DEFAULT_PROCESS_DEFINITIONS;
}

export async function runDev(options = {}) {
  const definitions = getProcessDefinitions(options);
  const children = [];
  let shuttingDown = false;

  function doShutdown(signal, exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    const stopFn = options.stopChild ?? stopChild;
    for (const child of children) stopFn(child, signal);
    setTimeout(() => {
      for (const child of children) stopFn(child, 'SIGKILL');
      if (options.onShutdown) options.onShutdown(exitCode);
      else process.exit(exitCode);
    }, 1_000).unref();
  }

  for (const definition of definitions) {
    const child = startChild(definition, options);
    children.push(child);
    child.once('error', (error) => {
      console.error(`Não foi possível iniciar ${definition.name}:`, error);
      doShutdown('SIGTERM', 1);
    });
    child.once('exit', (code, signal) => {
      if (shuttingDown) return;
      console.error(`${definition.name} foi encerrado`, { code, signal });
      doShutdown('SIGTERM', code === 0 ? 0 : 1);
    });
  }

  if (!options.skipSignalHandlers) {
    process.once('SIGINT', () => doShutdown('SIGTERM', 0));
    process.once('SIGTERM', () => doShutdown('SIGTERM', 0));
  }

  return { children, shutdown: doShutdown };
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], 'file:').href
) {
  await runDev();
}
