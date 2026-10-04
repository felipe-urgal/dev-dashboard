import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import {
  PackageScriptProductionStatusReader,
  PRODUCTION_STATUS_V1_PREFIX,
  parseProductionCommandStatus,
} from '../src/deployment/command-status.js';
import { DeploymentError } from '../src/deployment/errors.js';
import { ProductionDeploymentStatusService } from '../src/deployment/production-status.js';

const REVISION_A = 'a'.repeat(40);
const REVISION_B = 'b'.repeat(40);
const NOW = Date.parse('2026-10-04T13:00:00Z');

function project(): Project {
  return {
    id: 'project-command',
    name: 'home-music',
    path: '/tmp/home-music',
    type: 'node',
    source: 'standalone',
    enabled: true,
    capabilities: ['production'],
    production: {
      version: 1,
      enabled: true,
      strategy: 'command',
      provider: 'systemd',
      branch: 'main',
      commands: {
        status: 'prod:status',
        check: 'prod:check',
        deploy: 'prod:deploy',
        verify: 'prod:verify',
      },
      policies: {
        backup: 'not-configured',
        migrations: 'not-configured',
        rollback: 'manual-restore',
      },
    },
  };
}

test('parser aceita uma única linha v1 e ignora banners do package manager', () => {
  const status = parseProductionCommandStatus(
    [
      '> home-music@1.0.0 prod:status',
      '> node scripts/status.mjs',
      `${PRODUCTION_STATUS_V1_PREFIX}{"version":1,"revision":"${REVISION_A}","state":"ready"}`,
    ].join('\n'),
  );

  assert.deepEqual(status, {
    version: 1,
    revision: REVISION_A,
    state: 'ready',
  });
});

test('parser rejeita saída ambígua, shape aberto e revision inválida', () => {
  for (const output of [
    `${PRODUCTION_STATUS_V1_PREFIX}{"version":1,"revision":"${REVISION_A}","state":"ready"}\n${PRODUCTION_STATUS_V1_PREFIX}{"version":1,"revision":"${REVISION_B}","state":"ready"}`,
    `${PRODUCTION_STATUS_V1_PREFIX}{"version":1,"revision":"${REVISION_A}","state":"ready","extra":true}`,
    `${PRODUCTION_STATUS_V1_PREFIX}{"version":1,"revision":"main","state":"ready"}`,
  ]) {
    assert.throws(
      () => parseProductionCommandStatus(output),
      (error: unknown) =>
        error instanceof DeploymentError &&
        error.code === 'DEPLOYMENT_COMMAND_STATUS_INVALID',
    );
  }
});

test('reader tipa timeout, falha e output excessivo sem propagar saída', async () => {
  for (const scenario of [
    {
      result: {
        stdout: 'segredo',
        exitCode: 1,
        timedOut: true,
        outputExceeded: false,
      },
      code: 'DEPLOYMENT_COMMAND_STATUS_TIMEOUT',
    },
    {
      result: {
        stdout: 'segredo',
        exitCode: 7,
        timedOut: false,
        outputExceeded: false,
      },
      code: 'DEPLOYMENT_COMMAND_STATUS_FAILED',
    },
    {
      result: {
        stdout: 'segredo',
        exitCode: 1,
        timedOut: false,
        outputExceeded: true,
      },
      code: 'DEPLOYMENT_COMMAND_STATUS_INVALID',
    },
  ] as const) {
    const reader = new PackageScriptProductionStatusReader({
      execute: async () => scenario.result,
    });

    await assert.rejects(
      () => reader.read(project()),
      (error: unknown) =>
        error instanceof DeploymentError &&
        error.code === scenario.code &&
        !error.message.includes('segredo'),
    );
  }
});

test('status command compara revision observada com origin real', async () => {
  const service = new ProductionDeploymentStatusService({
    now: () => NOW,
    commandReader: {
      async read() {
        return { version: 1, revision: REVISION_A, state: 'ready' };
      },
    },
    originRevisionResolver: {
      async resolve() {
        return REVISION_A;
      },
    },
  });

  const status = await service.read(project());
  assert.equal(status.strategy, 'command');
  if (status.strategy !== 'command') throw new Error('status command esperado');
  assert.equal(status.statusAvailability, 'available');
  assert.equal(status.checkedAt, '2026-10-04T13:00:00.000Z');
  assert.equal(status.originRevision, REVISION_A);
  assert.equal(status.productionRevision, REVISION_A);
  assert.equal(status.runtimeState, 'ready');
  assert.equal(status.drift, 'in-sync');
});

test('status command degrada para unknown quando leitura estruturada falha', async () => {
  const service = new ProductionDeploymentStatusService({
    now: () => NOW,
    commandReader: {
      async read() {
        throw new DeploymentError(
          'DEPLOYMENT_COMMAND_STATUS_INVALID',
          'Resposta inválida.',
        );
      },
    },
    originRevisionResolver: {
      async resolve() {
        return REVISION_B;
      },
    },
  });

  const status = await service.read(project());
  assert.equal(status.strategy, 'command');
  if (status.strategy !== 'command') throw new Error('status command esperado');
  assert.equal(status.statusAvailability, 'invalid-response');
  assert.equal(status.productionRevision, undefined);
  assert.equal(status.drift, 'unknown');
  assert.equal(status.errorCode, 'DEPLOYMENT_COMMAND_STATUS_INVALID');
});
