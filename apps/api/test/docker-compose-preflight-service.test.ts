import assert from 'node:assert/strict';
import test from 'node:test';

import type { LocalPortInspection, Project } from '@dev-dashboard/contracts';

import type {
  ComposeConfigSnapshot,
  ComposeRuntimeSnapshot,
} from '../src/services/docker-compose-model.js';
import { DockerComposePreflightService } from '../src/services/docker-compose-preflight-service.js';

const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/projeto',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: [],
};

const config: ComposeConfigSnapshot = {
  projectName: 'stack',
  observedAt: '2026-09-06T12:00:00.000Z',
  services: [
    {
      name: 'web',
      profiles: [],
      dependsOn: [],
      ports: [
        {
          targetPort: 3000,
          publishedPort: 3000,
          protocol: 'tcp',
        },
      ],
    },
    {
      name: 'db',
      profiles: [],
      dependsOn: [],
      ports: [
        {
          targetPort: 5432,
          publishedPort: 5432,
          protocol: 'tcp',
        },
      ],
    },
  ],
  declaredPorts: [
    {
      projectId: project.id,
      port: 3000,
      role: 'web',
      source: 'compose',
      confidence: 'certain',
    },
    {
      projectId: project.id,
      port: 5432,
      role: 'db',
      source: 'compose',
      confidence: 'certain',
    },
  ],
};

function inspection(
  overrides: Partial<LocalPortInspection> = {},
): LocalPortInspection {
  return {
    status: 'ready',
    platform: 'linux',
    inspectedAt: '2026-09-06T12:01:00.000Z',
    entries: [],
    truncated: false,
    ...overrides,
  };
}

test('fica ready quando nenhuma porta publicada está ocupada ou reservada por outro owner', async () => {
  const calls: unknown[] = [];
  const service = new DockerComposePreflightService({
    inspect: async (input) => {
      calls.push(input);
      return inspection();
    },
  });

  const result = await service.inspect(project, config);

  assert.equal(result.state, 'ready');
  assert.deepEqual(result.conflicts, []);
  assert.equal(calls.length, 1);
  assert.deepEqual(
    (calls[0] as { declaredPorts: unknown }).declaredPorts,
    config.declaredPorts,
  );
});

test('bloqueia porta Compose ocupada mesmo quando owner não é conhecido', async () => {
  const service = new DockerComposePreflightService({
    inspect: async () =>
      inspection({
        entries: [
          {
            port: 3000,
            address: '127.0.0.1',
            scope: 'loopback',
            state: 'occupied',
            conflict: true,
            expected: [],
            suggestedPort: 3001,
          },
        ],
      }),
  });

  const result = await service.inspect(project, config);

  assert.equal(result.state, 'blocked');
  assert.deepEqual(result.conflicts, [
    {
      port: 3000,
      services: ['web'],
      reason: 'occupied',
      address: '127.0.0.1',
      owner: { kind: 'unknown' },
      suggestedPort: 3001,
    },
  ]);
});

test('preserva owner externo conhecido sem transportar outros detalhes do processo', async () => {
  const service = new DockerComposePreflightService({
    inspect: async () =>
      inspection({
        entries: [
          {
            port: 5432,
            address: '127.0.0.1',
            scope: 'loopback',
            state: 'occupied',
            conflict: true,
            expected: [],
            externalProcess: { pid: 42, name: 'postgres' },
          },
        ],
      }),
  });

  const result = await service.inspect(project, config);

  assert.equal(result.state, 'blocked');
  assert.equal(result.conflicts[0]?.reason, 'occupied');
  assert.deepEqual(result.conflicts[0]?.owner, {
    kind: 'external',
    pid: 42,
    name: 'postgres',
  });
});

test('bloqueia reserva incompatível mesmo quando a porta ainda está livre', async () => {
  const service = new DockerComposePreflightService({
    inspect: async () => inspection(),
  });

  const result = await service.inspect(project, config, undefined, {
    reservedPorts: [
      {
        port: 3000,
        scope: 'infrastructure',
        owner: 'infra-local',
        role: 'proxy',
      },
    ],
  });

  assert.equal(result.state, 'blocked');
  assert.deepEqual(result.conflicts, [
    {
      port: 3000,
      services: ['web'],
      reason: 'reserved',
    },
  ]);
});

test('bloqueia dois serviços Compose que publicam a mesma porta', async () => {
  const duplicateConfig: ComposeConfigSnapshot = {
    ...config,
    services: [
      config.services[0]!,
      {
        name: 'admin',
        profiles: [],
        dependsOn: [],
        ports: [
          {
            targetPort: 3001,
            publishedPort: 3000,
            protocol: 'tcp',
          },
        ],
      },
    ],
    declaredPorts: [
      config.declaredPorts[0]!,
      {
        projectId: project.id,
        port: 3000,
        role: 'admin',
        source: 'compose',
        confidence: 'certain',
      },
    ],
  };
  const service = new DockerComposePreflightService({
    inspect: async () => inspection(),
  });

  const result = await service.inspect(project, duplicateConfig);

  assert.equal(result.state, 'blocked');
  assert.deepEqual(result.conflicts, [
    {
      port: 3000,
      services: ['admin', 'web'],
      reason: 'duplicate-declaration',
    },
  ]);
});

test('não bloqueia uma porta já comprovada pelo runtime ativo do mesmo Compose', async () => {
  const runtime: ComposeRuntimeSnapshot = {
    observedAt: '2026-09-06T12:00:30.000Z',
    services: [
      {
        service: 'web',
        containerId: 'container-1',
        containerName: 'stack-web-1',
        state: 'running',
        health: 'healthy',
        ports: [
          {
            targetPort: 3000,
            publishedPort: 3000,
            protocol: 'tcp',
          },
        ],
      },
    ],
  };
  const service = new DockerComposePreflightService({
    inspect: async () =>
      inspection({
        entries: [
          {
            port: 3000,
            address: '0.0.0.0',
            scope: 'all-interfaces',
            state: 'occupied',
            conflict: true,
            expected: [],
          },
        ],
      }),
  });

  const result = await service.inspect(project, config, runtime);
  assert.equal(result.state, 'ready');
  assert.deepEqual(result.conflicts, []);
});

test('falha fechado quando inspeção está indisponível ou truncada', async () => {
  const unavailableService = new DockerComposePreflightService({
    inspect: async () =>
      inspection({
        status: 'unavailable',
        warning: 'ss indisponível',
      }),
  });
  const truncatedService = new DockerComposePreflightService({
    inspect: async () => inspection({ truncated: true }),
  });

  assert.equal(
    (await unavailableService.inspect(project, config)).state,
    'unavailable',
  );
  assert.equal(
    (await truncatedService.inspect(project, config)).state,
    'unavailable',
  );
});
