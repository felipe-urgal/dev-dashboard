import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildComposeConfigCommand,
  buildComposePsCommand,
  parseComposeConfig,
  parseComposePs,
} from '../src/services/docker-compose-model.js';

const OBSERVED_AT = '2026-09-05T18:00:00.000Z';

test('normaliza config resolvida sem transportar environment ou secrets', () => {
  const secretValue = 'postgres://user:secret@db/app';
  const result = parseComposeConfig(
    {
      name: 'example',
      services: {
        api: {
          image: 'example/api:latest',
          environment: {
            DATABASE_URL: secretValue,
          },
          build: {
            context: '.',
            args: { TOKEN: secretValue },
          },
          depends_on: {
            db: { condition: 'service_healthy' },
          },
          profiles: ['app'],
          ports: [
            { target: 3000, published: '5300', protocol: 'tcp' },
            { target: 9229, protocol: 'tcp' },
          ],
        },
        db: {
          image: 'postgres:17',
          ports: [{ target: 5432, published: 5433, protocol: 'tcp' }],
        },
      },
    },
    'project-1',
    OBSERVED_AT,
  );

  assert.equal(result.projectName, 'example');
  assert.deepEqual(result.services[0], {
    name: 'api',
    image: 'example/api:latest',
    profiles: ['app'],
    dependsOn: ['db'],
    ports: [
      { targetPort: 3000, publishedPort: 5300, protocol: 'tcp' },
      { targetPort: 9229, protocol: 'tcp' },
    ],
  });
  assert.deepEqual(result.declaredPorts, [
    {
      projectId: 'project-1',
      port: 5300,
      role: 'api',
      source: 'compose',
      confidence: 'certain',
    },
    {
      projectId: 'project-1',
      port: 5433,
      role: 'db',
      source: 'compose',
      confidence: 'certain',
    },
  ]);
  assert.equal(JSON.stringify(result).includes(secretValue), false);
  assert.equal(JSON.stringify(result).includes('DATABASE_URL'), false);
});

test('normaliza ps com state, health, exit code e publishers estruturados', () => {
  const result = parseComposePs(
    [
      {
        ID: 'abc123',
        Name: 'example-db-1',
        Service: 'db',
        State: 'running',
        Health: 'healthy',
        ExitCode: 0,
        Command: 'postgres --password=secret',
        Publishers: [
          {
            TargetPort: 5432,
            PublishedPort: 5433,
            Protocol: 'tcp',
            URL: '0.0.0.0',
          },
        ],
      },
    ],
    OBSERVED_AT,
  );

  assert.deepEqual(result.services, [
    {
      service: 'db',
      containerId: 'abc123',
      containerName: 'example-db-1',
      state: 'running',
      health: 'healthy',
      exitCode: 0,
      ports: [{ targetPort: 5432, publishedPort: 5433, protocol: 'tcp' }],
    },
  ]);
  assert.equal(JSON.stringify(result).includes('password=secret'), false);
  assert.equal(JSON.stringify(result).includes('0.0.0.0'), false);
});

test('estado externo desconhecido permanece unknown em vez de falso running', () => {
  const result = parseComposePs(
    [{ Service: 'worker', State: 'mystery', Health: 'mystery', Publishers: [] }],
    OBSERVED_AT,
  );

  assert.equal(result.services[0]?.state, 'unknown');
  assert.equal(result.services[0]?.health, 'unknown');
});

test('comandos de inspeção são fixos e somente leitura', () => {
  assert.deepEqual(buildComposeConfigCommand(), {
    program: 'docker',
    args: ['compose', 'config', '--format', 'json'],
  });
  assert.deepEqual(buildComposePsCommand(), {
    program: 'docker',
    args: ['compose', 'ps', '--all', '--format', 'json'],
  });
});

test('payload estrutural inválido falha fechado', () => {
  assert.throws(
    () => parseComposeConfig({ services: null }, 'project-1', OBSERVED_AT),
    /Configuração resolvida/,
  );
  assert.throws(() => parseComposePs({}, OBSERVED_AT), /Estado do Docker Compose/);
});
