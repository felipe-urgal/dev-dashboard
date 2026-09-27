#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const apiPort = process.env.DEV_DASHBOARD_API_PORT?.trim() || '4343';
const origin =
  process.env.DEV_DASHBOARD_LOCAL_ORIGIN?.trim() ||
  `http://127.0.0.1:${apiPort}`;

function configDir() {
  const explicit = process.env.DEV_DASHBOARD_CONFIG_DIR?.trim();
  if (explicit) return path.resolve(explicit);
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  if (xdg) return path.join(path.resolve(xdg), 'dev-dashboard');
  return path.join(homedir(), '.config', 'dev-dashboard');
}

async function localToken() {
  return (await readFile(path.join(configDir(), 'api-token'), 'utf8')).trim();
}

async function request(pathname, options = {}) {
  const token = await localToken();
  const response = await fetch(new URL(pathname, origin), {
    ...options,
    headers: {
      'x-dev-dashboard-token': token,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
  }
  return payload;
}

function safeField(value) {
  return String(value ?? '').replace(/[\t\r\n]/g, ' ');
}

function printProject(project, managedProcess) {
  const status = managedProcess?.status ?? 'stopped';
  const port = managedProcess?.port ?? project.port ?? '';
  globalThis.process.stdout.write(
    [
      project.id,
      project.name,
      project.path,
      project.type,
      project.enabled ? 'enabled' : 'disabled',
      port,
      status,
      managedProcess?.environmentInstanceId ?? '',
      managedProcess?.pid ?? '',
    ]
      .map(safeField)
      .join('\t') + '\n',
  );
}

async function listProjects() {
  const payload = await request('/api/projects');
  return payload.projects ?? [];
}

async function resolveProject(value) {
  const projects = await listProjects();
  return projects.find(
    (project) =>
      project.id === value || project.name === value || project.path === value,
  );
}

async function snapshot() {
  const [projects, processesPayload] = await Promise.all([
    listProjects(),
    request('/api/processes?kind=server'),
  ]);
  const byProject = new Map();
  const rank = { running: 5, starting: 4, stopping: 3, failed: 2, stopped: 1 };

  for (const managed of processesPayload.processes ?? []) {
    const current = byProject.get(managed.projectId);
    if (!current || (rank[managed.status] ?? 0) > (rank[current.status] ?? 0)) {
      byProject.set(managed.projectId, managed);
    }
  }

  for (const project of projects) {
    printProject(project, byProject.get(project.id));
  }
}

async function startProject(value) {
  const project = await resolveProject(value);
  if (!project) throw new Error(`Projeto não encontrado na API: ${value}`);
  if (!project.enabled) throw new Error(`Projeto desativado: ${project.name}`);

  const payload = await request(
    `/api/projects/${encodeURIComponent(project.id)}/process/start`,
    { method: 'POST', body: '{}' },
  );
  printProject(project, payload.process);
}

async function stopProcess(projectId, environmentInstanceId) {
  const query = environmentInstanceId
    ? `?environmentInstanceId=${encodeURIComponent(environmentInstanceId)}`
    : '';
  const payload = await request(
    `/api/projects/${encodeURIComponent(projectId)}/process/stop${query}`,
    { method: 'POST', body: '{}' },
  );

  globalThis.process.stdout.write(
    [
      payload.process?.projectId ?? projectId,
      payload.process?.status ?? 'stopped',
      payload.process?.environmentInstanceId ?? environmentInstanceId ?? '',
    ]
      .map(safeField)
      .join('\t') + '\n',
  );
}

async function stopByProject(value) {
  const project = await resolveProject(value);
  if (!project) throw new Error(`Projeto não encontrado na API: ${value}`);

  const payload = await request(
    `/api/processes?kind=server&projectId=${encodeURIComponent(project.id)}`,
  );
  const active = (payload.processes ?? []).filter((managed) =>
    ['running', 'starting', 'stopping'].includes(managed.status),
  );

  if (active.length === 0) {
    globalThis.process.stdout.write(`${safeField(project.id)}\tstopped\t\n`);
    return;
  }

  for (const managed of active) {
    await stopProcess(project.id, managed.environmentInstanceId);
  }
}

async function startAll() {
  const projects = await listProjects();
  const current = await request('/api/processes?kind=server');
  const activeProjectIds = new Set(
    (current.processes ?? [])
      .filter((managed) => ['running', 'starting'].includes(managed.status))
      .map((managed) => managed.projectId),
  );

  for (const project of projects) {
    if (
      !project.enabled ||
      !(project.capabilities ?? []).includes('server') ||
      activeProjectIds.has(project.id)
    ) {
      continue;
    }

    try {
      await startProject(project.id);
    } catch (error) {
      globalThis.process.stderr.write(
        `${project.name}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      globalThis.process.exitCode = 2;
    }
  }
}

async function stopAll() {
  const payload = await request('/api/processes?kind=server');
  const active = (payload.processes ?? []).filter((managed) =>
    ['running', 'starting', 'stopping'].includes(managed.status),
  );

  for (const managed of active) {
    try {
      await stopProcess(managed.projectId, managed.environmentInstanceId);
    } catch (error) {
      globalThis.process.stderr.write(
        `${managed.projectId}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      globalThis.process.exitCode = 2;
    }
  }
}

async function main() {
  const [command, ...args] = globalThis.process.argv.slice(2);

  switch (command) {
    case 'ping':
      await listProjects();
      globalThis.process.stdout.write('ok\n');
      return;
    case 'snapshot':
      await snapshot();
      return;
    case 'resolve': {
      if (!args[0]) throw new Error('Uso: resolve <project>');
      const project = await resolveProject(args[0]);
      if (!project) throw new Error(`Projeto não encontrado na API: ${args[0]}`);
      printProject(project, undefined);
      return;
    }
    case 'start':
      if (!args[0]) throw new Error('Uso: start <project>');
      await startProject(args[0]);
      return;
    case 'stop':
      if (!args[0]) throw new Error('Uso: stop <project>');
      await stopByProject(args[0]);
      return;
    case 'start-all':
      await startAll();
      return;
    case 'stop-all':
      await stopAll();
      return;
    default:
      throw new Error('Comando inválido.');
  }
}

main().catch((error) => {
  globalThis.process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  globalThis.process.exit(1);
});
