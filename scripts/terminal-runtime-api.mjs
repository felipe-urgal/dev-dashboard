#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

const apiPort = process.env.DEV_DASHBOARD_API_PORT?.trim() || '4343';
const httpOrigin =
  process.env.DEV_DASHBOARD_LOCAL_ORIGIN?.trim() ||
  `http://127.0.0.1:${apiPort}`;
const wsOrigin = httpOrigin.replace(/^http/i, 'ws');

function configDir() {
  const explicit = process.env.DEV_DASHBOARD_CONFIG_DIR?.trim();
  if (explicit) return path.resolve(explicit);
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  if (xdg) return path.join(path.resolve(xdg), 'dev-dashboard');
  return path.join(homedir(), '.config', 'dev-dashboard');
}

async function token() {
  return (await readFile(path.join(configDir(), 'api-token'), 'utf8')).trim();
}

async function request(pathname, options = {}) {
  const response = await fetch(new URL(pathname, httpOrigin), {
    ...options,
    headers: {
      'x-dev-dashboard-token': await token(),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(
      payload?.message || payload?.error || `HTTP ${response.status}`,
    );
  }
  return payload;
}

async function projectFor(value) {
  const { projects = [] } = await request('/api/projects');
  const project = projects.find(
    (item) => item.id === value || item.name === value || item.path === value,
  );
  if (!project) throw new Error(`Projeto não encontrado na API: ${value}`);
  return project;
}

function projectEndpoint(projectId, suffix) {
  return `/api/projects/${encodeURIComponent(projectId)}${suffix}`;
}

async function terminalStatus(project, kind) {
  return request(projectEndpoint(project.id, `/terminal/${kind}`));
}

async function openTerminal(project, kind) {
  const status = await terminalStatus(project, kind);
  if (!status.supported)
    throw new Error(status.message || 'Terminal indisponível.');

  const prepared = await request(
    projectEndpoint(project.id, `/terminal/${kind}/confirmations`),
    { method: 'POST' },
  );
  const confirmationToken = prepared.confirmation.token;
  const url = new URL(
    projectEndpoint(project.id, `/terminal/${kind}/connect`),
    wsOrigin,
  );
  url.searchParams.set('confirmationToken', confirmationToken);

  const localToken = await token();
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(url, {
      headers: { 'x-dev-dashboard-token': localToken },
    });
    let ready = false;
    const stdin = process.stdin;
    const wasRaw = Boolean(stdin.isRaw);

    const cleanup = () => {
      stdin.off('data', onInput);
      if (stdin.isTTY) stdin.setRawMode(wasRaw);
      stdin.pause();
    };

    const onInput = (chunk) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(
        JSON.stringify({ type: 'input', data: chunk.toString('utf8') }),
      );
    };

    socket.addEventListener('open', () => {
      if (stdin.isTTY) stdin.setRawMode(true);
      stdin.resume();
      stdin.on('data', onInput);
    });

    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.type === 'ready') {
        ready = true;
        if (process.stdout.isTTY && socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: 'resize',
              cols: process.stdout.columns || 80,
              rows: process.stdout.rows || 24,
            }),
          );
        }
        return;
      }
      if (message.type === 'output') {
        process.stdout.write(message.data ?? '');
        return;
      }
      if (message.type === 'error') {
        process.stderr.write(`${message.message ?? 'Erro no terminal.'}\n`);
        return;
      }
      if (message.type === 'exit') {
        cleanup();
      }
    });

    socket.addEventListener('close', (event) => {
      cleanup();
      if (!ready && event.code !== 1000) {
        reject(
          new Error(
            event.reason || 'Sessão de terminal encerrada antes de iniciar.',
          ),
        );
        return;
      }
      resolve();
    });

    socket.addEventListener('error', () => {
      cleanup();
      reject(new Error('Falha na conexão WebSocket do terminal.'));
    });
  });
}

async function testsList(project) {
  const payload = await request(
    projectEndpoint(project.id, '/tests?refresh=true'),
  );
  for (const item of payload.tests?.commands ?? []) {
    process.stdout.write(`${item.id}\t${item.label}\t${item.runner}\n`);
  }
}

async function testsStart(project, commandId) {
  const payload = await request(
    projectEndpoint(
      project.id,
      `/tests/${encodeURIComponent(commandId)}/start`,
    ),
    { method: 'POST', body: '{}' },
  );
  process.stdout.write(`${payload.process.status}\t${payload.process.id}\n`);
}

async function testsStatus(project) {
  const payload = await request(projectEndpoint(project.id, '/tests/process'));
  const managed = payload.process;
  if (!managed) {
    process.stdout.write('stopped\n');
    return;
  }
  process.stdout.write(
    `${managed.status}${managed.exitCode !== undefined ? `\texit=${managed.exitCode}` : ''}\n`,
  );
}

async function testsLog(project) {
  const payload = await request(
    projectEndpoint(project.id, '/tests/process/logs?maxBytes=65536'),
  );
  process.stdout.write(payload.log?.content ?? '');
}

async function testsStop(project) {
  const payload = await request(
    projectEndpoint(project.id, '/tests/process/stop'),
    {
      method: 'POST',
      body: '{}',
    },
  );
  process.stdout.write(`${payload.process.status}\n`);
}

async function dependenciesList(project) {
  const payload = await request(
    projectEndpoint(project.id, '/scripts?page=1&pageSize=100'),
  );
  for (const item of payload.catalog?.items ?? []) {
    const supported =
      item.origin === 'bundler' ||
      item.origin === 'package-manager' ||
      item.id === 'package-script:build';
    if (!supported || !item.enabled) continue;
    process.stdout.write(
      `${item.id}\t${item.name}\t${item.origin}\t${item.risk}\n`,
    );
  }
}

async function dependenciesStart(project, actionId) {
  const payload = await request(
    projectEndpoint(project.id, '/dependencies/pty/start'),
    {
      method: 'POST',
      body: JSON.stringify({ actionId }),
    },
  );
  process.stdout.write(
    `${payload.snapshot.status}\t${payload.snapshot.actionName}\n`,
  );
}

async function dependenciesStatus(project) {
  const payload = await request(
    projectEndpoint(project.id, '/dependencies/pty/status'),
  );
  const snapshot = payload.snapshot;
  if (!snapshot) {
    process.stdout.write('stopped\n');
    return;
  }
  process.stdout.write(
    `${snapshot.status}\t${snapshot.actionName}\t${snapshot.exitCode ?? ''}\n`,
  );
}

async function dependenciesCancel(project) {
  await request(projectEndpoint(project.id, '/dependencies/pty/cancel'), {
    method: 'POST',
    body: '{}',
  });
  process.stdout.write('cancelled\n');
}

async function migrationsOverview(project) {
  const payload = await request(projectEndpoint(project.id, '/migrations'));
  const migration = payload.migration;
  process.stdout.write(
    `${migration.status}\t${migration.provider}\t${migration.database}\t${migration.pending?.length ?? 0}\n`,
  );
  for (const item of migration.pending ?? []) {
    process.stdout.write(`pending\t${item.id}\t${item.name ?? ''}\n`);
  }
}

async function migrationsApply(project) {
  const planPayload = await request(
    projectEndpoint(project.id, '/migrations/mutations/plan'),
    {
      method: 'POST',
      body: JSON.stringify({ operation: 'apply' }),
    },
  );
  const plan = planPayload.plan;
  if (plan.preflight?.state !== 'ready') {
    throw new Error(
      plan.preflight?.diagnostic ||
        `Migrations não estão prontas: ${plan.preflight?.reason ?? 'estado inválido'}`,
    );
  }

  const confirmationPayload = await request(
    projectEndpoint(project.id, '/migrations/mutations/confirmation'),
    {
      method: 'POST',
      body: JSON.stringify({
        operation: 'apply',
        database: plan.database,
        planHash: plan.planHash,
        environmentInstanceId: plan.environmentInstanceId,
      }),
    },
  );

  const startPayload = await request(
    projectEndpoint(project.id, '/migrations/mutations/start'),
    {
      method: 'POST',
      body: JSON.stringify({
        operation: 'apply',
        database: plan.database,
        environmentInstanceId: plan.environmentInstanceId,
        confirmationToken: confirmationPayload.confirmation.token,
      }),
    },
  );
  process.stdout.write(
    `${startPayload.snapshot.status}\t${startPayload.snapshot.environmentInstanceId}\n`,
  );
}

async function migrationsStatus(project) {
  const payload = await request(
    projectEndpoint(project.id, '/migrations/mutations/status'),
  );
  const snapshot = payload.snapshot;
  if (!snapshot) {
    process.stdout.write('stopped\n');
    return;
  }
  process.stdout.write(
    `${snapshot.status}\t${snapshot.exitCode ?? ''}\t${snapshot.environmentInstanceId}\n`,
  );
  if (snapshot.buffer) process.stdout.write(snapshot.buffer);
}

async function migrationsCancel(project) {
  await request(projectEndpoint(project.id, '/migrations/mutations/cancel'), {
    method: 'POST',
    body: '{}',
  });
  process.stdout.write('cancelled\n');
}

async function worker(project, workerId, action) {
  const suffix = `/rails/workers/${encodeURIComponent(workerId)}${action ? `/${action}` : ''}`;
  const payload = await request(projectEndpoint(project.id, suffix), {
    ...(action ? { method: 'POST', body: '{}' } : {}),
  });
  if (payload.worker) {
    const managed = payload.worker.process;
    process.stdout.write(
      `${managed?.status ?? 'stopped'}\tdetected=${payload.worker.detected}\n`,
    );
    return;
  }
  process.stdout.write(`${payload.process?.status ?? 'unknown'}\n`);
}

async function main() {
  const [command, projectValue, ...args] = process.argv.slice(2);
  if (!command || !projectValue) {
    throw new Error('Uso: terminal-runtime-api <comando> <projeto> [...]');
  }
  const project = await projectFor(projectValue);

  switch (command) {
    case 'terminal-supported': {
      const status = await terminalStatus(project, args[0] || 'shell');
      process.stdout.write(status.supported ? 'yes\n' : 'no\n');
      if (!status.supported && status.message)
        process.stderr.write(`${status.message}\n`);
      return;
    }
    case 'terminal-open':
      await openTerminal(project, args[0] || 'shell');
      return;
    case 'tests-list':
      await testsList(project);
      return;
    case 'tests-start':
      if (!args[0]) throw new Error('Informe o commandId de testes.');
      await testsStart(project, args[0]);
      return;
    case 'tests-status':
      await testsStatus(project);
      return;
    case 'tests-log':
      await testsLog(project);
      return;
    case 'tests-stop':
      await testsStop(project);
      return;
    case 'deps-list':
      await dependenciesList(project);
      return;
    case 'deps-start':
      if (!args[0]) throw new Error('Informe o actionId de dependências.');
      await dependenciesStart(project, args[0]);
      return;
    case 'deps-status':
      await dependenciesStatus(project);
      return;
    case 'deps-cancel':
      await dependenciesCancel(project);
      return;
    case 'migrations-overview':
      await migrationsOverview(project);
      return;
    case 'migrations-apply':
      await migrationsApply(project);
      return;
    case 'migrations-status':
      await migrationsStatus(project);
      return;
    case 'migrations-cancel':
      await migrationsCancel(project);
      return;
    case 'worker-status':
      if (!args[0]) throw new Error('Informe sidekiq ou webpack.');
      await worker(project, args[0], '');
      return;
    case 'worker-start':
    case 'worker-stop':
    case 'worker-restart':
      if (!args[0]) throw new Error('Informe sidekiq ou webpack.');
      await worker(project, args[0], command.replace('worker-', ''));
      return;
    default:
      throw new Error(`Comando de runtime inválido: ${command}`);
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
