import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';
import {
  DockerComposeError,
  DockerComposeService,
} from '../src/services/docker-compose-service.js';

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dashboard-compose-'));
  await writeFile(path.join(directory, 'compose.yaml'), [
    'services:',
    '  db:',
    '    image: postgres:17',
    '    ports:',
    '      - "5433:5432"',
    '  web:',
    '    build: .',
    '    depends_on:',
    '      db:',
    '        condition: service_started',
    '    ports:',
    '      - target: 3000',
    '        published: 3100',
    '',
  ].join('\n'));
  const project: Project = {
    id: 'painel', name: 'Painel', path: directory, type: 'node',
    source: 'standalone', favorite: false, capabilities: ['docker'],
  };
  return { directory, project, cleanup: () => rm(directory, { recursive: true, force: true }) };
}

test('detecta serviços, metadados e estado sem executar configuração livre', async () => {
  const item = await fixture();
  const calls: string[][] = [];
  const service = new DockerComposeService({
    runCommand: async (_command, args) => {
      calls.push(args);
      return { stdout: args.includes('ps') ? 'db\n' : 'Docker Compose version v2\n', stderr: '' };
    },
  });
  try {
    const overview = await service.overview(item.project);
    assert.equal(overview.configured, true);
    assert.equal(overview.dockerAvailable, true);
    assert.equal(overview.composeFile, 'compose.yaml');
    assert.deepEqual(overview.services, [
      { name: 'db', image: 'postgres:17', requiresBuild: false, ports: ['5433:5432'], dependsOn: [], running: true },
      { name: 'web', requiresBuild: true, ports: ['3100:3000'], dependsOn: ['db'], running: false },
    ]);
    assert.deepEqual(calls[1], [
      'compose', '-f', path.join(item.directory, 'compose.yaml'),
      'ps', '--status', 'running', '--services',
    ]);
  } finally {
    await item.cleanup();
  }
});

test('executa somente o catálogo conhecido e exige confirmação vinculada', async () => {
  const item = await fixture();
  const calls: string[][] = [];
  let now = Date.parse('2026-08-02T12:00:00.000Z');
  const service = new DockerComposeService({
    now: () => now,
    runCommand: async (_command, args) => {
      calls.push(args);
      return { stdout: '', stderr: '' };
    },
  });
  try {
    await service.runAction(item.project, 'db', 'start');
    assert.deepEqual(calls.at(-1), [
      'compose', '-f', path.join(item.directory, 'compose.yaml'), 'up', '-d', 'db',
    ]);

    await assert.rejects(
      service.runAction(item.project, 'db', 'restart'),
      (error: unknown) => error instanceof DockerComposeError
        && error.code === 'DOCKER_CONFIRMATION_REQUIRED',
    );
    const confirmation = await service.prepareConfirmation(item.project, 'db', 'restart');
    await service.runAction(item.project, 'db', 'restart', confirmation.token);
    assert.deepEqual(calls.at(-1), [
      'compose', '-f', path.join(item.directory, 'compose.yaml'), 'restart', 'db',
    ]);
    await assert.rejects(
      service.runAction(item.project, 'db', 'restart', confirmation.token),
      (error: unknown) => error instanceof DockerComposeError
        && error.code === 'DOCKER_CONFIRMATION_REQUIRED',
    );

    const expired = await service.prepareConfirmation(item.project, 'db', 'stop');
    now += 60_001;
    await assert.rejects(
      service.runAction(item.project, 'db', 'stop', expired.token),
      (error: unknown) => error instanceof DockerComposeError
        && error.code === 'DOCKER_CONFIRMATION_REQUIRED',
    );
    await assert.rejects(
      service.runAction(item.project, 'web', 'start'),
      (error: unknown) => error instanceof DockerComposeError
        && error.code === 'DOCKER_SERVICE_REQUIRES_BUILD',
    );
  } finally {
    await item.cleanup();
  }
});

test('limita e mascara logs antes de devolvê-los', async () => {
  const item = await fixture();
  const oversizedOutput = `${'x'.repeat(262_200)}\ndb | password=segredo\ndb | pronto\n`;
  const service = new DockerComposeService({
    runCommand: async (_command, args) => ({
      stdout: args.includes('logs')
        ? oversizedOutput
        : 'Docker Compose version v2\n',
      stderr: '',
    }),
  });
  try {
    const logs = await service.logs(item.project, 'db');
    assert.equal(logs.masked, true);
    assert.equal(logs.redactionCount, 1);
    assert.equal(logs.truncated, true);
    assert.equal(logs.sizeBytes, Buffer.byteLength(oversizedOutput));
    assert.ok(Buffer.byteLength(logs.content) <= 262_144);
    assert.doesNotMatch(logs.content, /segredo/);
    assert.match(logs.content, /CONTEUDO_MASCARADO/);
  } finally {
    await item.cleanup();
  }
});

test('exige build via ProcessManager e libera o start após sucesso', async () => {
  const item = await fixture();
  const buildCalls: Array<{ projectId: string; serviceName: string; command: unknown }> = [];
  let buildProcess: { status: string; exitCode?: number } | null = null;
  const fakeProcessManager = {
    getComposeBuildProcess: async (projectId: string, serviceName: string) => (
      buildProcess ? { id: `${projectId}:compose-build:${serviceName}`, projectId, kind: 'compose-build', ...buildProcess } : null
    ),
    startComposeBuild: async (project: Project, serviceName: string, command: unknown) => {
      buildCalls.push({ projectId: project.id, serviceName, command });
      buildProcess = { status: 'running' };
      return { id: `${project.id}:compose-build:${serviceName}`, projectId: project.id, kind: 'compose-build', status: 'running' };
    },
  };
  const runCommandCalls: string[][] = [];
  const service = new DockerComposeService({
    runCommand: async (_command, args) => {
      runCommandCalls.push(args);
      return { stdout: '', stderr: '' };
    },
    processManager: fakeProcessManager as never,
  });
  try {
    await assert.rejects(
      service.runAction(item.project, 'web', 'start'),
      (error: unknown) => error instanceof DockerComposeError
        && error.code === 'DOCKER_SERVICE_REQUIRES_BUILD',
    );

    await service.startBuild(item.project, 'web');
    assert.deepEqual(buildCalls[0], {
      projectId: item.project.id,
      serviceName: 'web',
      command: { command: 'docker', args: ['compose', '-f', path.join(item.directory, 'compose.yaml'), 'build', 'web'] },
    });

    await assert.rejects(
      service.runAction(item.project, 'web', 'start'),
      (error: unknown) => error instanceof DockerComposeError
        && error.code === 'DOCKER_SERVICE_REQUIRES_BUILD',
    );

    buildProcess = { status: 'stopped', exitCode: 0 };
    await service.runAction(item.project, 'web', 'start');
    assert.deepEqual(runCommandCalls.at(-1), [
      'compose', '-f', path.join(item.directory, 'compose.yaml'), 'up', '-d', 'web',
    ]);
  } finally {
    await item.cleanup();
  }
});

test('rejeita operações de build sem ProcessManager configurado', async () => {
  const item = await fixture();
  const service = new DockerComposeService({
    runCommand: async () => ({ stdout: '', stderr: '' }),
  });
  try {
    await assert.rejects(
      service.startBuild(item.project, 'web'),
      (error: unknown) => error instanceof DockerComposeError
        && error.code === 'DOCKER_BUILD_UNSUPPORTED',
    );
  } finally {
    await item.cleanup();
  }
});

test('retorna estado vazio sem arquivo e erro seguro para YAML inválido', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dashboard-compose-empty-'));
  const project: Project = {
    id: 'vazio', name: 'Vazio', path: directory, type: 'node',
    source: 'standalone', favorite: false, capabilities: [],
  };
  const service = new DockerComposeService();
  try {
    assert.deepEqual(await service.overview(project), {
      configured: false, dockerAvailable: false, services: [],
    });
    await writeFile(path.join(directory, 'compose.yaml'), 'services: [\n');
    await assert.rejects(
      service.overview(project),
      (error: unknown) => error instanceof DockerComposeError
        && error.code === 'DOCKER_CONFIG_INVALID',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
