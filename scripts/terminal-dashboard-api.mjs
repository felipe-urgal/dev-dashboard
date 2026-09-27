#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const apiPort = process.env.DEV_DASHBOARD_API_PORT?.trim() || '4343';
const origin = process.env.DEV_DASHBOARD_LOCAL_ORIGIN?.trim() || `http://127.0.0.1:${apiPort}`;

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
  const localToken = await token();
  const response = await fetch(new URL(pathname, origin), {
    ...options,
    headers: {
      'x-dev-dashboard-token': localToken,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const message = payload?.message || payload?.error || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function safeField(value) {
  return String(value ?? '').replace(/[\t\r\n]/g, ' ');
}

function printProject(project, process) {
  const status = process?.status ?? 'stopped';
  const port = process?.port ?? project.port ?? '';
  process.stdout.write([
    project.id,
    project.name,
    project.path,
    project.type,
    project.enabled ? 'enabled' : 'disabled',
    port,
    status,
    process?.environmentInstanceId ?? '',
    process?.pid ?? '',
  ].map(safeField).join('\t') + '\n');
}

async function snapshot() {
  const [projectsPayload, processesPayload] = await Promise.all([
    request('/api/projects'),
    request('/api/processes?kind=server'),
  ]);
  const processes = processesPayload.processes ?? [];
  const byProject = new Map();
  for (const managed of processes) {
    const current = byProject.get(managed.projectId);
    const rank = { running: 5, starting: 4, stopping: 3, failed: 2, stopped: 1 };
    if (!current || (rank[managed.status] ?? 0) > (rank[current.status] ?? 0)) {
      byProject.set(managed.projectId, managed);
    }
  }
  for (const project of projectsPayload.projects ?? []) {
    printProject(project, byProject.get(project.id));
  }
}

async function resolveProject(value) {
  const payload = await request('/api/projects');
  const projects = payload.projects ?? [];
  return projects.find((project) => project.id === value || project.name === value || project.path === value);
}

async function startProject(value) {
  const project = await resolveProject(value);
  if (!project) throw new Error(`Projeto não encontrado na API: ${value}`);
  if (!project.enabled) throw new Error(`Projeto desativado: ${project.name}`);
  const payload = await request(`/api/projects/${encodeURIComponent(project.id)}/process/start`, {
    method: 'POST',
    body: '{}',
  });
  printProject(project, payload.process);
}

async function stopProject(projectId, environmentInstanceId) {
  const query = environmentInstanceId
    ? `?environmentInstanceId=${encodeURIComponent(environmentInstanceId)}`
    : '';
  const payload = await request(`/api/projects/${encodeURIComponent(projectId)}/process/stop${query}`, {
    method: 'POST',
    body: '{}',
  });
  process.stdout.write([
    payload.process?.projectId ?? projectId,
    payload.process?.status ?? 'stopped',
    payload.process?.environmentInstanceId ?? environmentInstanceId ?? '',
  ].map(safeField).join('\t') + '\n');
}

async function stopByProject(value) {
  const project = await resolveProject(value);
  if (!project) throw new Error(`Projeto não encontrado na API: ${value}`);
  const payload = await request(`/api/processes?kind=server&projectId=${encodeURIComponent(project.id)}`);
  const owned = (payload.processes ?? []).filter((managed) =>
    managed.status === 'running' || managed.status === 'starting' || managed.status === 'stopping'
  );
  if (owned.length === 0) {
    process.stdout.write(`${safeField(project.id)}\tstopped\t\n`);
    return;
  }
  for (const managed of owned) {
    await stopProject(project.id, managed.environmentInstanceId);
  }
}

async function startAll() {
  const payload = await request('/api/projects');
  for (const project of payload.projects ?? []) {
    if (!project.enabled || !(project.capabilities ?? []).includes('server')) continue;
    try {
      await startProject(project.id);
    } catch (error) {
      if (!String(error.message).includes('já está em execução')) {
        process.stderr.write(`${project.name}: ${error.message}\n`);
        process.exitCode = 2;
      }
    }
  }
}

async function stopAll() {
  const payload = await request('/api/processes?kind=server');
  const active = (payload.processes ?? []).filter((managed) =>
    managed.status === 'running' || managed.status === 'starting' || managed.status === 'stopping'
  );
  for (const managed of active) {
    try {
      await stopProject(managed.projectId, managed.environmentInstanceId);
    } catch (error) {
      process.stderr.write(`${managed.projectId}: ${error.message}\n`);
      process.exitCode = 2;
    }
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'ping':
      await request('/api/health');
      process.stdout.write('ok\n');
      return;
    case 'snapshot':
      await snapshot();
      return;
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
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
