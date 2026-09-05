import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import {
  DockerComposeProvider,
  type ComposeCommandRunner,
} from '../src/services/docker-compose-provider.js';

const NOW = new Date('2026-09-05T20:00:00.000Z');
const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/projeto',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: [],
};

const configPayload = JSON.stringify({
  name: 'project-1',
  services: {
    postgres: {
      image: 'postgres:17',
      environment: { DATABASE_URL: 'postgres://secret' },
      ports: [{ target: 5432, published: '5432', protocol: 'tcp' }],
    },
  },
});

const runtimePayload = JSON.stringify([
  {
    Service: 'postgres',
    ID: 'container-1',
    Name: 'project-1-postgres-1',
    State: 'running',
    Health: 'healthy',
    ExitCode: 0,
    Publishers: [{ TargetPort: 5432, PublishedPort: 5432, Protocol: 'tcp' }],
  },
]);

test('executa somente os dois comandos estruturados no cwd do projeto', async () => {
  const calls: Array<{ args: string[]; cwd: string }> = [];
  const runner: ComposeCommandRunner = async (command, options) => {
    calls.push({ args: [...command.args], cwd: options.cwd });
    return command.args.includes('config') ? configPayload : runtimePayload;
  };

  const result = await new DockerComposeProvider(runner, () => NOW).inspect(
    project,
  );

  assert.equal(result.state, 'available');
  assert.deepEqual(calls, [
    {
      args: ['compose', 'config', '--format', 'json'],
      cwd: project.path,
    },
    {
      args: ['compose', 'ps', '--all', '--format', 'json'],
      cwd: project.path,
    },
  ]);
  assert.equal(result.config?.services[0]?.name, 'postgres');
  assert.equal(result.runtime?.services[0]?.health, 'healthy');
  assert.equal(JSON.stringify(result).includes('postgres://secret'), false);
});

test('Docker ausente vira estado suportado sem ecoar erro bruto', async () => {
  const runner: ComposeCommandRunner = async () => {
    const error = new Error('spawn docker ENOENT: /secret/path') as Error & {
      code?: string;
    };
    error.code = 'ENOENT';
    throw error;
  };

  const result = await new DockerComposeProvider(runner, () => NOW).inspect(
    project,
  );

  assert.equal(result.state, 'docker-missing');
  assert.equal(JSON.stringify(result).includes('/secret/path'), false);
});

test('daemon indisponível preserva config resolvida e não inventa runtime', async () => {
  const runner: ComposeCommandRunner = async (command) => {
    if (command.args.includes('config')) return configPayload;
    throw new Error('cannot connect to daemon at unix:///secret/docker.sock');
  };

  const result = await new DockerComposeProvider(runner, () => NOW).inspect(
    project,
  );

  assert.equal(result.state, 'runtime-unavailable');
  assert.equal(result.config?.services.length, 1);
  assert.equal(result.runtime, undefined);
  assert.equal(JSON.stringify(result).includes('/secret/docker.sock'), false);
});

test('JSON inválido falha fechado sem transportar stdout', async () => {
  const runner: ComposeCommandRunner = async () => '{"secret":"token"';
  const result = await new DockerComposeProvider(runner, () => NOW).inspect(
    project,
  );

  assert.equal(result.state, 'invalid-output');
  assert.equal(JSON.stringify(result).includes('token'), false);
});
