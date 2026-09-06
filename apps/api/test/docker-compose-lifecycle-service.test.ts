import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import {
  DockerComposeLifecycleError,
  DockerComposeLifecycleService,
  type DockerComposeStartCommandRunner,
} from '../src/services/docker-compose-lifecycle-service.js';
import type { DockerComposeInspection } from '../src/services/docker-compose-provider.js';
import type { DockerComposePortPreflight } from '../src/services/docker-compose-preflight-service.js';

const project: Project = {
  id: 'project-1',
  workspaceId: 'workspace-1',
  name: 'Project',
  path: '/workspace/project',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: ['server'],
};

const before: DockerComposeInspection = {
  state: 'available',
  observedAt: '2026-09-06T17:00:00.000Z',
  config: {
    projectName: 'project',
    observedAt: '2026-09-06T17:00:00.000Z',
    services: [
      {
        name: 'web',
        profiles: [],
        dependsOn: [],
        ports: [{ targetPort: 3000, publishedPort: 3000, protocol: 'tcp' }],
      },
    ],
    declaredPorts: [],
  },
  runtime: {
    observedAt: '2026-09-06T17:00:00.000Z',
    services: [],
  },
};

const after: DockerComposeInspection = {
  ...before,
  observedAt: '2026-09-06T17:01:00.000Z',
  runtime: {
    observedAt: '2026-09-06T17:01:00.000Z',
    services: [
      {
        service: 'web',
        state: 'running',
        health: 'healthy',
        ports: [{ targetPort: 3000, publishedPort: 3000, protocol: 'tcp' }],
      },
    ],
  },
};

const ready: DockerComposePortPreflight = {
  state: 'ready',
  inspectedAt: '2026-09-06T17:00:30.000Z',
  conflicts: [],
};

function createHarness(options: {
  inspections?: DockerComposeInspection[];
  preflight?: DockerComposePortPreflight;
  supportsWait?: boolean;
}) {
  const inspections = [...(options.inspections ?? [before, after])];
  const commands: Array<{
    command: { program: 'docker'; args: string[] };
    cwd: string;
    timeoutMs: number;
    maxBufferBytes: number;
  }> = [];
  const runStart: DockerComposeStartCommandRunner = async (command, run) => {
    commands.push({ command, ...run });
  };
  const service = new DockerComposeLifecycleService(
    {
      inspect: async () =>
        inspections.shift() ?? {
          state: 'runtime-unavailable',
          observedAt: '2026-09-06T17:02:00.000Z',
        },
    },
    { inspect: async () => options.preflight ?? ready },
    runStart,
    { supportsWait: async () => options.supportsWait ?? false },
  );
  return { service, commands };
}

test('revalida preflight e inicia somente a stack conhecida com argv fechado', async () => {
  const { service, commands } = createHarness({});

  const result = await service.start(project);

  assert.equal(result.state, 'started');
  assert.equal(commands.length, 1);
  assert.deepEqual(commands[0]!.command, {
    program: 'docker',
    args: ['compose', 'up', '--detach'],
  });
  assert.equal(commands[0]!.cwd, project.path);
  assert.ok(commands[0]!.timeoutMs > 0);
  assert.ok(commands[0]!.maxBufferBytes > 0);
});

test('usa --wait somente quando a capability foi comprovada', async () => {
  const { service, commands } = createHarness({ supportsWait: true });

  await service.start(project);

  assert.deepEqual(commands[0]!.command.args, [
    'compose',
    'up',
    '--detach',
    '--wait',
  ]);
});

test('falha fechado antes da mutação quando o preflight bloqueia', async () => {
  const { service, commands } = createHarness({
    preflight: {
      state: 'blocked',
      inspectedAt: '2026-09-06T17:00:30.000Z',
      conflicts: [{ port: 3000, services: ['web'], reason: 'occupied' }],
      diagnostic: 'Porta 3000 ocupada.',
    },
  });

  await assert.rejects(
    service.start(project),
    (error: unknown) =>
      error instanceof DockerComposeLifecycleError &&
      error.code === 'COMPOSE_PREFLIGHT_BLOCKED',
  );
  assert.equal(commands.length, 0);
});

test('falha fechado sem mutar quando o Compose está indisponível', async () => {
  const { service, commands } = createHarness({
    inspections: [
      {
        state: 'docker-missing',
        observedAt: '2026-09-06T17:00:00.000Z',
        diagnostic: 'Docker ausente.',
      },
    ],
  });

  await assert.rejects(
    service.start(project),
    (error: unknown) =>
      error instanceof DockerComposeLifecycleError &&
      error.code === 'COMPOSE_UNAVAILABLE',
  );
  assert.equal(commands.length, 0);
});

test('não inventa sucesso observado quando a reinspeção pós-start falha', async () => {
  const { service } = createHarness({
    inspections: [
      before,
      {
        state: 'runtime-unavailable',
        observedAt: '2026-09-06T17:01:00.000Z',
        config: before.config,
        diagnostic: 'Daemon indisponível na reinspeção.',
      },
    ],
  });

  const result = await service.start(project);

  assert.equal(result.state, 'started-unverified');
  assert.match(result.diagnostic ?? '', /não pôde ser comprovado/i);
});
