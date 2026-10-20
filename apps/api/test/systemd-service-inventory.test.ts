import assert from 'node:assert/strict';
import test from 'node:test';

import { SystemdServiceInventory } from '../src/services/systemd-service-inventory.js';

const NOW = new Date('2026-10-19T12:00:00.000Z');

test('observa user e system sem inferir ownership nem readiness', async () => {
  const commands: string[] = [];
  const inventory = new SystemdServiceInventory({
    platform: 'linux',
    now: () => NOW,
    runSystemctl: async (scope, query, names) => {
      commands.push(scope + ':' + query);
      if (query === 'show') {
        return (names ?? [])
          .map((name) => {
            const active =
              name === 'idle.service' || name === 'sleeping.service'
                ? 'inactive'
                : name === 'broken.service'
                  ? 'failed'
                  : 'active';
            const sub =
              name === 'oneshot.service'
                ? 'exited'
                : active === 'inactive'
                  ? 'dead'
                  : active === 'failed'
                    ? 'failed'
                    : 'running';
            const boot =
              name === 'oneshot.service'
                ? 'static'
                : name === 'broken.service'
                  ? 'masked'
                  : 'enabled';
            return [
              'Id=' + name,
              'ActiveState=' + active,
              'SubState=' + sub,
              'UnitFileState=' + boot,
              'FragmentPath=/usr/lib/systemd/system/' + name,
              'Transient=no',
              'TriggeredBy=',
            ].join('\n');
          })
          .join('\n\n');
      }
      if (scope === 'user' && query === 'units') {
        return [
          'dev-dashboard.service loaded active running Dev Dashboard',
          'idle.service loaded inactive dead Idle worker',
        ].join('\n');
      }
      if (scope === 'user') {
        return [
          'dev-dashboard.service enabled enabled',
          'idle.service disabled enabled',
        ].join('\n');
      }
      if (query === 'units') {
        return [
          'home-music.service loaded active running Home Music',
          '● broken.service loaded failed failed Broken Service',
          'oneshot.service loaded active exited A completed job',
          'not-a-unit.timer loaded active running Timer',
        ].join('\n');
      }
      return [
        'home-music.service enabled enabled',
        'broken.service masked enabled',
        'oneshot.service static -',
        'sleeping.service disabled enabled',
      ].join('\n');
    },
  });

  const result = await inventory.inspect();
  assert.equal(result.status, 'ready');
  assert.equal(result.truncated, false);
  assert.deepEqual(
    commands.sort(),
    [
      'system:unit-files',
      'system:units',
      'system:show',
      'user:unit-files',
      'user:units',
      'user:show',
    ].sort(),
  );
  assert.equal(result.services.length, 6);

  const music = result.services.find(
    (service) => service.name === 'home-music.service',
  );
  assert.equal(music?.id, 'systemd:system:home-music.service');
  assert.equal(music?.state, 'running');
  assert.equal(music?.bootState, 'enabled');
  assert.equal(music?.readiness, 'unknown');
  assert.equal(music?.managed, false);
  assert.equal(music?.fragmentKind, 'persistent');
  assert.equal(music?.unitKind, 'regular');
  assert.equal(music?.observedAt, NOW.toISOString());

  const dashboard = result.services.find(
    (service) => service.name === 'dev-dashboard.service',
  );
  assert.equal(dashboard?.scope, 'user');
  assert.equal(
    result.services.find((service) => service.name === 'broken.service')?.state,
    'failed',
  );
  assert.equal(
    result.services.find((service) => service.name === 'broken.service')
      ?.bootState,
    'masked',
  );
  assert.equal(
    result.services.find((service) => service.name === 'oneshot.service')
      ?.state,
    'unknown',
  );
  assert.equal(
    result.services.find((service) => service.name === 'sleeping.service')
      ?.state,
    'unknown',
  );
  assert.equal(
    result.services.some((service) => service.name === 'not-a-unit.timer'),
    false,
  );
});

test('não falha globalmente quando user bus está indisponível e não vaza erro bruto', async () => {
  const inventory = new SystemdServiceInventory({
    platform: 'linux',
    runSystemctl: async (scope, query, names) => {
      if (scope === 'user') {
        throw new Error('private token /home/secret user dbus unavailable');
      }
      if (query === 'show')
        return (names ?? [])
          .map((name) =>
            [
              'Id=' + name,
              'ActiveState=active',
              'SubState=running',
              'UnitFileState=enabled',
              'FragmentPath=/etc/systemd/system/' + name,
            ].join('\n'),
          )
          .join('\n\n');
      return query === 'units'
        ? 'postgresql.service loaded active running PostgreSQL'
        : 'postgresql.service enabled enabled';
    },
  });

  const result = await inventory.inspect();
  assert.equal(result.status, 'partial');
  assert.equal(result.sources[0]?.status, 'unavailable');
  assert.equal(result.sources[1]?.status, 'ready');
  assert.equal(result.services[0]?.name, 'postgresql.service');
  assert.doesNotMatch(JSON.stringify(result), /private token|\/home\/secret/);
});

test('relata observação parcial quando estado de runtime é desconhecido', async () => {
  const inventory = new SystemdServiceInventory({
    platform: 'linux',
    runSystemctl: async (scope, query, names) => {
      if (scope === 'system' && query === 'units') {
        throw new Error('access denied');
      }
      if (query === 'show')
        return (names ?? [])
          .map((name) =>
            ['Id=' + name, 'UnitFileState=disabled', 'FragmentPath='].join(
              '\n',
            ),
          )
          .join('\n\n');
      return query === 'units' ? '' : 'redis-server.service disabled enabled';
    },
  });

  const result = await inventory.inspect();
  assert.equal(result.status, 'partial');
  assert.equal(result.sources[1]?.status, 'partial');
  assert.equal(
    result.services.find((service) => service.scope === 'system')?.state,
    'unknown',
  );
});

test('respeita limite total e sinaliza truncamento', async () => {
  const inventory = new SystemdServiceInventory({
    platform: 'linux',
    maxServices: 2,
    runSystemctl: async (_scope, query, names) =>
      query === 'show'
        ? (names ?? [])
            .map((name) =>
              [
                'Id=' + name,
                'ActiveState=active',
                'SubState=running',
                'UnitFileState=enabled',
                'FragmentPath=',
              ].join('\n'),
            )
            .join('\n\n')
        : query === 'units'
          ? 'first.service loaded active running First\nsecond.service loaded inactive dead Second'
          : 'first.service enabled enabled\nsecond.service disabled enabled',
  });

  const result = await inventory.inspect();
  assert.equal(result.status, 'partial');
  assert.equal(result.truncated, true);
  assert.equal(result.services.length, 2);
  assert.deepEqual(
    result.services.map((service) => service.scope),
    ['user', 'system'],
  );
});

test('não executa systemctl fora do Linux', async () => {
  let calls = 0;
  const inventory = new SystemdServiceInventory({
    platform: 'darwin',
    runSystemctl: async () => {
      calls += 1;
      return '';
    },
  });

  const result = await inventory.inspect();
  assert.equal(result.status, 'unsupported');
  assert.equal(calls, 0);
  assert.equal(result.services.length, 0);
  assert.equal(
    result.sources.every((source) => source.status === 'unsupported'),
    true,
  );
});

test('observa template, transient, socket activation e fallback sem exibir path', async () => {
  const inventory = new SystemdServiceInventory({
    platform: 'linux',
    runSystemctl: async (_scope, query, names) => {
      if (query === 'units')
        return 'socket-job@1.service loaded active running job';
      if (query === 'unit-files')
        return [
          'worker@.service static -',
          'socket-job@1.service transient -',
          'masked.service masked -',
        ].join('\n');
      return (names ?? [])
        .map((name) =>
          [
            'Id=' + name,
            'ActiveState=active',
            'SubState=running',
            'UnitFileState=' +
              (name === 'worker@.service'
                ? 'static'
                : name === 'masked.service'
                  ? 'masked'
                  : 'transient'),
            'FragmentPath=/run/systemd/transient/private-unit-path',
            'Transient=' + (name === 'socket-job@1.service' ? 'yes' : 'no'),
            'TriggeredBy=' +
              (name === 'socket-job@1.service' ? 'socket-job.socket' : ''),
          ].join('\n'),
        )
        .join('\n\n');
    },
  });
  const result = await inventory.inspect();
  assert.equal(result.status, 'ready');
  const template = result.services.find(
    (service) => service.name === 'worker@.service',
  );
  assert.equal(template?.unitKind, 'template');
  assert.equal(template?.state, 'unknown'); // uninstantiated template is not an active service
  assert.equal(template?.readiness, 'unknown');
  const transient = result.services.find(
    (service) => service.name === 'socket-job@1.service',
  );
  assert.equal(transient?.unitKind, 'transient');
  assert.equal(transient?.fragmentKind, 'runtime');
  assert.match(transient?.diagnostic ?? '', /Socket activation/);
  assert.equal(
    result.services.find((service) => service.name === 'masked.service')
      ?.bootState,
    'masked',
  );
  assert.doesNotMatch(JSON.stringify(result), /private-unit-path/);
});

test('show permission failure makes one scope partial but preserves discovered services', async () => {
  const inventory = new SystemdServiceInventory({
    platform: 'linux',
    runSystemctl: async (scope, query) => {
      if (scope === 'user' && query === 'show')
        throw new Error('secret systemd path');
      if (query === 'units')
        return 'sample.service loaded active running Sample';
      return 'sample.service enabled enabled';
    },
  });
  const result = await inventory.inspect();
  assert.equal(result.status, 'partial');
  assert.equal(result.sources[0]?.status, 'partial');
  assert.equal(result.sources[1]?.status, 'partial'); // malformed mock show output is partial
  assert.equal(result.services.length, 2);
  assert.doesNotMatch(JSON.stringify(result), /secret systemd path/);
});
