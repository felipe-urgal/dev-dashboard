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
import { PortAllocationLeaseRegistry } from '../src/services/port-registry-service.js';

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

test('runtime vazio após start permanece não verificado', async () => {
  const { service } = createHarness({
    inspections: [before, before],
  });

  const result = await service.start(project);

  assert.equal(result.state, 'started-unverified');
  assert.match(result.diagnostic ?? '', /não pôde ser comprovado/i);
});

test('reconciliation libera ownership e leases somente quando ps --all confirma zero containers', async () => {
  const registry = new PortAllocationLeaseRegistry();
  registry.reserveBatch({}, [
    {
      leaseId: 'compose:project-1:web:3000',
      projectId: project.id,
      role: 'web',
      preferredPort: 3000,
      maxPort: 3000,
    },
  ]);
  let currentOwnership = {
    projectId: project.id,
    projectPath: project.path,
    composeProjectName: 'project',
    startedAt: '2026-09-06T17:00:00.000Z',
  };
  let releaseCalls = 0;
  const service = new DockerComposeLifecycleService(
    { inspect: async () => before },
    { inspect: async () => ready },
    async () => '',
    {
      ownershipStore: {
        get: async () => currentOwnership,
        claim: async () => currentOwnership,
        release: async () => {
          releaseCalls += 1;
          currentOwnership = undefined as never;
          return true;
        },
      },
      portLeaseRegistry: registry,
    },
  );

  const result = await service.reconcile(project, before);

  assert.deepEqual(result, { state: 'released' });
  assert.equal(releaseCalls, 1);
  const reused = registry.reserve(
    {},
    {
      leaseId: 'compose:other:web:3000',
      projectId: 'other',
      role: 'web',
      preferredPort: 3000,
      maxPort: 3000,
    },
  );
  assert.equal(reused?.port, 3000);
});

test('reconciliation preserva ownership quando runtime é ambíguo ou project-name diverge', async () => {
  const ownership = {
    projectId: project.id,
    projectPath: project.path,
    composeProjectName: 'project',
    startedAt: '2026-09-06T17:00:00.000Z',
  };
  let releaseCalls = 0;
  const service = new DockerComposeLifecycleService(
    { inspect: async () => before },
    { inspect: async () => ready },
    async () => '',
    {
      ownershipStore: {
        get: async () => ownership,
        claim: async () => ownership,
        release: async () => {
          releaseCalls += 1;
          return true;
        },
      },
    },
  );

  const unavailable = await service.reconcile(project, {
    state: 'runtime-unavailable',
    observedAt: before.observedAt,
    config: before.config,
  });
  const mismatch = await service.reconcile(project, {
    ...before,
    config: { ...before.config!, projectName: 'other-project' },
  });
  const active = await service.reconcile(project, after);

  assert.equal(unavailable.state, 'unavailable');
  assert.equal(mismatch.state, 'unavailable');
  assert.equal(active.state, 'unchanged');
  assert.equal(releaseCalls, 0);
});

test('reconciliation limpa lease órfão mesmo sem ownership persistido', async () => {
  const registry = new PortAllocationLeaseRegistry();
  registry.reserveBatch({}, [
    {
      leaseId: 'compose:project-1:web:3000',
      projectId: project.id,
      role: 'web',
      preferredPort: 3000,
      maxPort: 3000,
    },
  ]);
  const service = new DockerComposeLifecycleService(
    { inspect: async () => before },
    { inspect: async () => ready },
    async () => '',
    {
      ownershipStore: {
        get: async () => undefined,
        claim: async () => {
          throw new Error('não deveria claim');
        },
        release: async () => false,
      },
      portLeaseRegistry: registry,
    },
  );

  const result = await service.reconcile(project, before);
  assert.deepEqual(result, { state: 'released' });

  const reused = registry.reserve(
    {},
    {
      leaseId: 'compose:other:web:3000',
      projectId: 'other',
      role: 'web',
      preferredPort: 3000,
      maxPort: 3000,
    },
  );
  assert.equal(reused?.port, 3000);
});

test('start com ownership usa project name explícito e persiste a posse', async () => {
  const claims: string[] = [];
  const commands: Array<{ program: 'docker'; args: string[] }> = [];
  const inspections = [before, after];
  const service = new DockerComposeLifecycleService(
    { inspect: async () => inspections.shift() ?? after },
    { inspect: async () => ready },
    async (command) => {
      commands.push(command);
      return '';
    },
    {
      ownershipStore: {
        get: async () => undefined,
        claim: async (_project, composeProjectName) => {
          claims.push(composeProjectName);
          return {
            projectId: project.id,
            projectPath: project.path,
            composeProjectName,
            startedAt: '2026-09-06T17:00:00.000Z',
          };
        },
        release: async () => true,
      },
    },
  );

  await service.start(project);

  assert.deepEqual(claims, ['project']);
  assert.deepEqual(commands[0]?.args, [
    'compose',
    '--project-name',
    'project',
    'up',
    '--detach',
  ]);
});

test('lease exato bloqueia start concorrente de outro ambiente antes do Docker', async () => {
  const registry = new PortAllocationLeaseRegistry();
  const firstCommands: unknown[] = [];
  const firstInspections = [before, after];
  const first = new DockerComposeLifecycleService(
    { inspect: async () => firstInspections.shift() ?? after },
    { inspect: async () => ready },
    async (command) => {
      firstCommands.push(command);
      return '';
    },
    { portLeaseRegistry: registry },
  );

  await first.start(project);
  assert.equal(firstCommands.length, 1);

  const otherProject: Project = {
    ...project,
    id: 'environment:worktree:project-1:worktree-2',
    path: '/workspace/project-worktree-2',
  };
  const secondCommands: unknown[] = [];
  const second = new DockerComposeLifecycleService(
    { inspect: async () => before },
    { inspect: async () => ready },
    async (command) => {
      secondCommands.push(command);
      return '';
    },
    { portLeaseRegistry: registry },
  );

  await assert.rejects(
    second.start(otherProject),
    (error: unknown) =>
      error instanceof DockerComposeLifecycleError &&
      error.code === 'COMPOSE_PREFLIGHT_BLOCKED',
  );
  assert.equal(secondCommands.length, 0);
});

test('start falho libera somente leases criados pela tentativa', async () => {
  const registry = new PortAllocationLeaseRegistry();
  const failing = new DockerComposeLifecycleService(
    { inspect: async () => before },
    { inspect: async () => ready },
    async () => {
      throw new Error('docker failed');
    },
    { portLeaseRegistry: registry },
  );

  await assert.rejects(
    failing.start(project),
    (error: unknown) =>
      error instanceof DockerComposeLifecycleError &&
      error.code === 'COMPOSE_START_FAILED',
  );

  const other = registry.reserve(
    {},
    {
      leaseId: 'compose:other:web:3000',
      projectId: 'other',
      role: 'web',
      preferredPort: 3000,
      maxPort: 3000,
    },
  );
  assert.equal(other?.port, 3000);
});

test('stop completo libera leases do projeto, stop de serviço preserva', async () => {
  const registry = new PortAllocationLeaseRegistry();
  registry.reserveBatch({}, [
    {
      leaseId: 'compose:project-1:web:3000',
      projectId: project.id,
      role: 'web',
      preferredPort: 3000,
      maxPort: 3000,
    },
  ]);
  const stopped: DockerComposeInspection = {
    ...after,
    runtime: {
      ...after.runtime!,
      services: [
        {
          ...after.runtime!.services[0]!,
          state: 'exited',
        },
      ],
    },
  };
  const ownershipStore = {
    get: async () => ({
      projectId: project.id,
      projectPath: project.path,
      composeProjectName: 'project',
      startedAt: '2026-09-06T17:00:00.000Z',
    }),
    claim: async () => {
      throw new Error('não deveria claim');
    },
    release: async () => false,
  };

  const serviceStopInspections = [before, stopped];
  const serviceStop = new DockerComposeLifecycleService(
    { inspect: async () => serviceStopInspections.shift() ?? stopped },
    { inspect: async () => ready },
    async () => '',
    { ownershipStore, portLeaseRegistry: registry },
  );
  await serviceStop.stop(project, 'web');

  assert.equal(
    registry.reserve(
      {},
      {
        leaseId: 'compose:other:web:3000',
        projectId: 'other',
        role: 'web',
        preferredPort: 3000,
        maxPort: 3000,
      },
    ),
    null,
  );

  const fullStopInspections = [before, stopped];
  const fullStop = new DockerComposeLifecycleService(
    { inspect: async () => fullStopInspections.shift() ?? stopped },
    { inspect: async () => ready },
    async () => '',
    { ownershipStore, portLeaseRegistry: registry },
  );
  await fullStop.stop(project);

  const released = registry.reserve(
    {},
    {
      leaseId: 'compose:other:web:3000',
      projectId: 'other',
      role: 'web',
      preferredPort: 3000,
      maxPort: 3000,
    },
  );
  assert.equal(released?.port, 3000);
});

test('exige ownership para stop sem executar comando', async () => {
  const commands: unknown[] = [];
  const service = new DockerComposeLifecycleService(
    { inspect: async () => before },
    { inspect: async () => ready },
    async (command) => {
      commands.push(command);
    },
  );

  await assert.rejects(
    service.stop(project),
    (error: unknown) =>
      error instanceof DockerComposeLifecycleError &&
      error.code === 'COMPOSE_OWNERSHIP_REQUIRED',
  );
  assert.equal(commands.length, 0);
});

test('stop de serviço usa apenas project name owned e serviço do catálogo', async () => {
  const commands: Array<{ program: 'docker'; args: string[] }> = [];
  const stopped: DockerComposeInspection = {
    ...after,
    runtime: {
      ...after.runtime!,
      services: [
        {
          ...after.runtime!.services[0]!,
          state: 'exited',
        },
      ],
    },
  };
  const inspections = [before, stopped];
  const service = new DockerComposeLifecycleService(
    { inspect: async () => inspections.shift() ?? stopped },
    { inspect: async () => ready },
    async (command) => {
      commands.push(command);
      return '';
    },
    {
      ownershipStore: {
        get: async () => ({
          projectId: project.id,
          projectPath: project.path,
          composeProjectName: 'project',
          startedAt: '2026-09-06T17:00:00.000Z',
        }),
        claim: async () => {
          throw new Error('não deveria claim');
        },
        release: async () => false,
      },
    },
  );

  const result = await service.stop(project, 'web');

  assert.equal(result.state, 'stopped');
  assert.deepEqual(commands[0]?.args, [
    'compose',
    '--project-name',
    'project',
    'stop',
    'web',
  ]);
});

test('restart rejeita serviço fora do catálogo antes de mutar', async () => {
  const commands: unknown[] = [];
  const service = new DockerComposeLifecycleService(
    { inspect: async () => before },
    { inspect: async () => ready },
    async (command) => {
      commands.push(command);
    },
    {
      ownershipStore: {
        get: async () => ({
          projectId: project.id,
          projectPath: project.path,
          composeProjectName: 'project',
          startedAt: '2026-09-06T17:00:00.000Z',
        }),
        claim: async () => {
          throw new Error('não deveria claim');
        },
        release: async () => false,
      },
    },
  );

  await assert.rejects(
    service.restart(project, 'missing'),
    (error: unknown) =>
      error instanceof DockerComposeLifecycleError &&
      error.code === 'COMPOSE_SERVICE_INVALID',
  );
  assert.equal(commands.length, 0);
});

test('restart revalida preflight antes de mutar target owned', async () => {
  const commands: Array<{ program: 'docker'; args: string[] }> = [];
  const inspections = [before, after];
  let preflightCalls = 0;
  const service = new DockerComposeLifecycleService(
    { inspect: async () => inspections.shift() ?? after },
    {
      inspect: async () => {
        preflightCalls += 1;
        return ready;
      },
    },
    async (command) => {
      commands.push(command);
      return '';
    },
    {
      ownershipStore: {
        get: async () => ({
          projectId: project.id,
          projectPath: project.path,
          composeProjectName: 'project',
          startedAt: '2026-09-06T17:00:00.000Z',
        }),
        claim: async () => {
          throw new Error('não deveria claim');
        },
        release: async () => false,
      },
    },
  );

  const result = await service.restart(project, 'web');

  assert.equal(preflightCalls, 1);
  assert.equal(result.state, 'restarted');
  assert.deepEqual(commands[0]?.args, [
    'compose',
    '--project-name',
    'project',
    'restart',
    'web',
  ]);
});

test('logs são bounded, mascarados e limitados ao target owned', async () => {
  const commands: Array<{ program: 'docker'; args: string[] }> = [];
  const service = new DockerComposeLifecycleService(
    { inspect: async () => before },
    { inspect: async () => ready },
    async (command) => {
      commands.push(command);
      return 'token=ghp_abcdefghijklmnopqrstuvwxyz123456\nlinha segura\n';
    },
    {
      now: () => new Date('2026-09-06T17:03:00.000Z'),
      ownershipStore: {
        get: async () => ({
          projectId: project.id,
          projectPath: project.path,
          composeProjectName: 'project',
          startedAt: '2026-09-06T17:00:00.000Z',
        }),
        claim: async () => {
          throw new Error('não deveria claim');
        },
        release: async () => false,
      },
    },
  );

  const logs = await service.logs(project, { service: 'web', tail: 50 });

  assert.equal(logs.masked, true);
  assert.equal(logs.content.includes('ghp_'), false);
  assert.equal(logs.readAt, '2026-09-06T17:03:00.000Z');
  assert.deepEqual(commands[0]?.args, [
    'compose',
    '--project-name',
    'project',
    'logs',
    '--no-color',
    '--tail',
    '50',
    'web',
  ]);
});

test('runtime vazio não vira stop verificado', async () => {
  const commands: Array<{ program: 'docker'; args: string[] }> = [];
  const emptyAfter: DockerComposeInspection = {
    ...after,
    runtime: {
      observedAt: '2026-09-06T17:01:00.000Z',
      services: [],
    },
  };
  const inspections = [before, emptyAfter];
  const service = new DockerComposeLifecycleService(
    { inspect: async () => inspections.shift() ?? emptyAfter },
    { inspect: async () => ready },
    async (command) => {
      commands.push(command);
      return '';
    },
    {
      ownershipStore: {
        get: async () => ({
          projectId: project.id,
          projectPath: project.path,
          composeProjectName: 'project',
          startedAt: '2026-09-06T17:00:00.000Z',
        }),
        claim: async () => {
          throw new Error('não deveria claim');
        },
        release: async () => false,
      },
    },
  );

  const result = await service.stop(project, 'web');

  assert.equal(result.state, 'stopped-unverified');
  assert.equal(commands.length, 1);
});
