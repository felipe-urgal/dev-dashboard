import { randomBytes } from 'node:crypto';
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ChildProcess, spawn } from 'node:child_process';

import { type RunningOllamaDouble, startOllamaDouble, stopOllamaDouble } from './ollama-double';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIRECTORY = path.resolve(HERE, '../../../..');
export const API_PORT = 4399;
export const BASE_URL = `http://127.0.0.1:${API_PORT}`;

export interface RunningServer {
  process: ChildProcess;
  baseUrl: string;
  bootstrapToken: string;
  configDirectory: string;
  workspaceDirectory: string;
  runtimeDirectory: string;
  ollamaDouble: RunningOllamaDouble;
}

async function writeSampleProject(workspaceDirectory: string): Promise<void> {
  const projectDirectory = path.join(workspaceDirectory, 'sample-node-app');
  await mkdir(projectDirectory, { recursive: true });
  await writeFile(
    path.join(projectDirectory, 'package.json'),
    JSON.stringify(
      {
        name: 'sample-node-app',
        version: '0.0.0',
        scripts: {
          dev: 'node -e "process.exit(0)"',
          test: 'node -e "process.exit(0)"',
        },
      },
      null,
      2,
    ),
  );
  await writeFile(
    path.join(projectDirectory, '.env'),
    'PUBLIC_API_URL=https://example.com\nAPI_SECRET_TOKEN=segredo-de-teste\n',
  );
}

// Gemfile com "sidekiq" e um bin/sidekiq controlável (dorme até ser encerrado
// via TERM/KILL) para exercitar start/stop real do worker sem depender de
// Ruby, Redis ou de um app Rails de verdade instalados no runner de CI.
async function writeSampleRailsProject(workspaceDirectory: string): Promise<void> {
  const projectDirectory = path.join(workspaceDirectory, 'sample-rails-app');
  await mkdir(path.join(projectDirectory, 'bin'), { recursive: true });
  await writeFile(
    path.join(projectDirectory, 'Gemfile'),
    "source 'https://rubygems.org'\n\ngem 'rails'\ngem 'sidekiq'\n",
  );
  const sidekiqScript = path.join(projectDirectory, 'bin', 'sidekiq');
  await writeFile(sidekiqScript, '#!/usr/bin/env bash\ntrap "exit 0" TERM\nwhile true; do sleep 1; done\n');
  await chmod(sidekiqScript, 0o755);
}

async function seedConfig(configDirectory: string, workspaceDirectory: string): Promise<void> {
  const resolvedWorkspace = await realpath(workspaceDirectory);
  const config = {
    version: 1,
    workspaces: [
      {
        id: 'e2e-fixture',
        name: 'Fixture E2E',
        path: resolvedWorkspace,
        enabled: true,
      },
    ],
  };
  await mkdir(configDirectory, { recursive: true });
  await writeFile(path.join(configDirectory, 'config.json'), JSON.stringify(config, null, 2));
}

async function waitForHealth(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // O servidor ainda não está pronto para aceitar conexões.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('A API de fixtures não respondeu a tempo em /api/health.');
}

export async function startFixtureServer(): Promise<RunningServer> {
  const runtimeRoot = await mktempRuntimeRoot();
  const configDirectory = path.join(runtimeRoot, 'config');
  const workspaceDirectory = path.join(runtimeRoot, 'workspace');

  await mkdir(workspaceDirectory, { recursive: true });
  await writeSampleProject(workspaceDirectory);
  await writeSampleRailsProject(workspaceDirectory);
  await seedConfig(configDirectory, workspaceDirectory);

  const bootstrapToken = randomBytes(32).toString('hex');
  const webDist = path.join(ROOT_DIRECTORY, 'apps/web/dist');
  const ollamaDouble = await startOllamaDouble();

  const child = spawn(process.execPath, [path.join(ROOT_DIRECTORY, 'apps/api/dist/server.js')], {
    cwd: ROOT_DIRECTORY,
    env: {
      ...process.env,
      DEV_DASHBOARD_CONFIG_DIR: configDirectory,
      DEV_DASHBOARD_LOCAL_DISTRIBUTION: '1',
      DEV_DASHBOARD_WEB_DIST: webDist,
      DEV_DASHBOARD_BROWSER_BOOTSTRAP: bootstrapToken,
      DEV_DASHBOARD_API_PORT: String(API_PORT),
      DEV_DASHBOARD_OLLAMA_URL: ollamaDouble.baseUrl,
      LOG_LEVEL: 'silent',
    },
    stdio: 'inherit',
  });

  await waitForHealth(BASE_URL);

  return {
    process: child,
    baseUrl: BASE_URL,
    bootstrapToken,
    configDirectory,
    workspaceDirectory,
    runtimeDirectory: runtimeRoot,
    ollamaDouble,
  };
}

export async function stopFixtureServer(server: RunningServer): Promise<void> {
  server.process.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    server.process.once('exit', () => resolve());
    setTimeout(resolve, 5_000).unref();
  });
  await stopOllamaDouble(server.ollamaDouble);
  await rm(server.runtimeDirectory, { recursive: true, force: true });
}

async function mktempRuntimeRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'dev-dashboard-e2e-'));
}

export function bootstrapUrl(server: RunningServer, hashPath = ''): string {
  return `${server.baseUrl}/${hashPath}#bootstrap=${server.bootstrapToken}`;
}
