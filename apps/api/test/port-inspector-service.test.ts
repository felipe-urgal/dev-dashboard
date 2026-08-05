
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ManagedProcess } from '@dev-dashboard/contracts';

import {
  PortInspectorService,
  type ExpectedLocalPort,
} from '../src/services/port-inspector-service.js';

const NOW = new Date('2026-08-05T14:00:00.000Z');

test('inspeciona loopback, associa processo gerenciado e limita processo externo ao usuário atual', async () => {
  const managedProcesses: ManagedProcess[] = [
    {
      id: 'server-p1',
      projectId: 'p1',
      kind: 'server',
      status: 'running',
      pid: 4_242,
      port: 3_000,
    },
  ];
  const expectedPorts: ExpectedLocalPort[] = [
    {
      port: 3_000,
      projectId: 'p1',
      projectName: 'Aplicação',
      service: 'server',
    },
    {
      port: 5_432,
      projectId: 'p2',
      projectName: 'Banco',
      service: 'server',
    },
    {
      port: 4_000,
      projectId: 'p3',
      projectName: 'Livre',
      service: 'server',
    },
  ];
  const service = new PortInspectorService({
    platform: 'linux',
    now: () => NOW,
    getUid: () => 1_000,
    runSs: async () => [
      'LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=4242,fd=20))',
      'LISTEN 0 128 0.0.0.0:5432 0.0.0.0:* users:(("postgres",pid=5000,fd=7))',
      'LISTEN 0 128 [::1]:6379 [::]:* users:(("redis",pid=6000,fd=8))',
      'LISTEN 0 128 192.168.1.10:8080 0.0.0.0:* users:(("external",pid=7000,fd=9))',
    ].join('\n'),
    readTextFile: async (filePath) => {
      if (filePath === '/proc/5000/status') {
        return 'Name:\tpostgres\nUid:\t1000\t1000\t1000\t1000\n';
      }
      if (filePath === '/proc/5000/comm') {
        return 'postgres\n';
      }
      if (filePath === '/proc/6000/status') {
        return 'Name:\tredis\nUid:\t2000\t2000\t2000\t2000\n';
      }
      throw new Error('arquivo inesperado');
    },
  });

  const result = await service.inspect({
    managedProcesses,
    expectedPorts,
    projectNames: { p1: 'Aplicação' },
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.inspectedAt, NOW.toISOString());
  assert.equal(result.entries.some((entry) => entry.port === 8_080), false);

  const managed = result.entries.find((entry) => entry.port === 3_000);
  assert.equal(managed?.managedProcess?.projectName, 'Aplicação');
  assert.equal(managed?.conflict, false);

  const conflict = result.entries.find((entry) => entry.port === 5_432);
  assert.equal(conflict?.scope, 'all-interfaces');
  assert.equal(conflict?.conflict, true);
  assert.equal(conflict?.externalProcess?.pid, 5_000);
  assert.equal(conflict?.externalProcess?.name, 'postgres');
  assert.equal(conflict?.suggestedPort, 5_433);

  const otherUser = result.entries.find((entry) => entry.port === 6_379);
  assert.equal(otherUser?.externalProcess, undefined);

  const available = result.entries.find((entry) => entry.port === 4_000);
  assert.equal(available?.state, 'available');
  assert.equal(available?.expected[0]?.projectName, 'Livre');
});

test('não associa processo gerenciado quando o PID da porta diverge', async () => {
  const service = new PortInspectorService({
    platform: 'linux',
    getUid: () => 1_000,
    runSs: async () =>
      'LISTEN 0 511 127.0.0.1:3000 0.0.0.0:* users:(("node",pid=9999,fd=20))',
    readTextFile: async (filePath) =>
      filePath.endsWith('/status')
        ? 'Uid:\t1000\t1000\t1000\t1000\n'
        : 'node\n',
  });

  const result = await service.inspect({
    managedProcesses: [
      {
        id: 'server-p1',
        projectId: 'p1',
        kind: 'server',
        status: 'running',
        pid: 4_242,
        port: 3_000,
      },
    ],
    expectedPorts: [
      {
        port: 3_000,
        projectId: 'p1',
        projectName: 'Aplicação',
        service: 'server',
      },
    ],
  });

  assert.equal(result.entries[0]?.managedProcess, undefined);
  assert.equal(result.entries[0]?.externalProcess?.pid, 9_999);
  assert.equal(result.entries[0]?.conflict, true);
});

test('retorna estado suportado sem vazar erro bruto quando ss não está disponível', async () => {
  const service = new PortInspectorService({
    platform: 'linux',
    runSs: async () => {
      throw new Error('/usr/bin/ss: segredo interno');
    },
  });

  const result = await service.inspect();

  assert.equal(result.status, 'unavailable');
  assert.equal(result.entries.length, 0);
  assert.doesNotMatch(result.warning ?? '', /segredo interno/);
});

test('declara a limitação de plataforma sem executar comandos', async () => {
  let executed = false;
  const service = new PortInspectorService({
    platform: 'darwin',
    runSs: async () => {
      executed = true;
      return '';
    },
  });

  const result = await service.inspect();

  assert.equal(result.status, 'unsupported');
  assert.equal(result.platform, 'unsupported');
  assert.equal(executed, false);
});
