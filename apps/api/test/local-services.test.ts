import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '../src/app.js';
import { LocalServiceManager } from '../src/services/local-service-manager.js';

function fixture(initial: 'running' | 'stopped' | 'failed' = 'stopped') {
  let state = initial;
  let helperTrusted = true;
  let auditWorks = true;
  let healthy = true;
  const events: string[] = [];
  const commands: string[] = [];
  const manager = new LocalServiceManager({
    platform: 'linux',
    now: () => Date.parse('2026-10-22T12:00:00.000Z'),
    helperTrusted: async () => helperTrusted,
    probeReady: async () => healthy,
    audit: async (entry) => {
      if (!auditWorks) throw Error('audit unavailable');
      events.push(String(entry.stage));
    },
    run: async (bin, args) => {
      commands.push(bin + ' ' + args.join(' '));
      if (bin === 'systemctl') {
        return [
          'Id=home-music.service',
          'LoadState=loaded',
          'ActiveState=' +
            (state === 'running'
              ? 'active'
              : state === 'failed'
                ? 'failed'
                : 'inactive'),
          'SubState=' +
            (state === 'running'
              ? 'running'
              : state === 'failed'
                ? 'failed'
                : 'dead'),
          'UnitFileState=enabled',
          'FragmentPath=/etc/systemd/system/home-music.service',
          'Transient=no',
        ].join('\n');
      }
      if (bin === 'sudo') {
        if (args[2] === 'start' || args[2] === 'restart') state = 'running';
        if (args[2] === 'stop') state = 'stopped';
        return '';
      }
      throw Error('Unexpected command');
    },
  });
  return {
    manager,
    events,
    commands,
    setState: (next: 'running' | 'stopped') => {
      state = next;
    },
    setHelper: (next: boolean) => {
      helperTrusted = next;
    },
    setAudit: (next: boolean) => {
      auditWorks = next;
    },
    setHealth: (next: boolean) => {
      healthy = next;
    },
  };
}

test('start/stop are isolated from deploy and require a one-use confirmation', async () => {
  const f = fixture();
  assert.equal((await f.manager.snapshot()).state, 'stopped');
  const start = await f.manager.plan('start');
  const started = await f.manager.apply('start', start.confirmation);
  assert.equal(started.status, 'completed');
  assert.equal(started.service.state, 'running');
  assert.deepEqual(f.events, ['invoking', 'completed']);
  assert(
    f.commands.includes(
      'sudo -n /usr/local/sbin/home-music-service-control start',
    ),
  );
  assert(!f.commands.some((c) => /npm|git|deploy|migrate|build/u.test(c)));
  await assert.rejects(
    f.manager.apply('start', start.confirmation),
    /Confirmação/,
  );
  const stop = await f.manager.plan('stop');
  assert.equal(
    (await f.manager.apply('stop', stop.confirmation)).service.state,
    'stopped',
  );
});

test('invalid transitions, stale state and missing trusted helper fail closed', async () => {
  const f = fixture();
  await assert.rejects(f.manager.plan('stop'), /incompatível/);
  const plan = await f.manager.plan('start');
  f.setState('running');
  await assert.rejects(f.manager.apply('start', plan.confirmation), /mudou/);
  assert(
    !f.commands.includes(
      'sudo -n /usr/local/sbin/home-music-service-control start',
    ),
  );
  f.setHelper(false);
  assert.equal((await f.manager.snapshot()).controllable, false);
  await assert.rejects(f.manager.plan('restart'), /Helper/);
});

test('reports systemd start as completed even if HTTP readiness is still pending', async () => {
  const f = fixture();
  f.setHealth(false);
  const plan = await f.manager.plan('start');
  const result = await f.manager.apply('start', plan.confirmation);
  assert.equal(result.status, 'completed');
  assert.equal(result.service.state, 'running');
  assert.equal(result.service.readiness, 'unhealthy');
  assert.match(result.message, /processo ativo/);
});

test('allows recovery start from a failed systemd unit', async () => {
  const f = fixture('failed');
  const plan = await f.manager.plan('start');
  const result = await f.manager.apply('start', plan.confirmation);
  assert.equal(result.status, 'completed');
  assert.equal(result.service.state, 'running');
});

test('audit failure blocks mutation before privileged dispatch', async () => {
  const f = fixture();
  const plan = await f.manager.plan('start');
  f.setAudit(false);
  await assert.rejects(
    f.manager.apply('start', plan.confirmation),
    /Auditoria indisponível/,
  );
  assert(
    !f.commands.includes(
      'sudo -n /usr/local/sbin/home-music-service-control start',
    ),
  );
});

test('lifecycle HTTP routes are authenticated and reject arbitrary units/replays', async (t) => {
  const f = fixture();
  const token = 'q'.repeat(64);
  const app = await buildApp({
    localToken: token,
    localServiceManager: f.manager,
  });
  t.after(async () => app.close());
  assert.equal(
    (await app.inject({ method: 'GET', url: '/api/local-services' }))
      .statusCode,
    401,
  );
  const headers = { 'x-dev-dashboard-token': token };
  const list = await app.inject({
    method: 'GET',
    url: '/api/local-services',
    headers,
  });
  assert.equal(list.statusCode, 200);
  assert.equal(
    list.json<{ services: Array<{ unit: string }> }>().services[0]?.unit,
    'home-music.service',
  );
  const invalid = await app.inject({
    method: 'POST',
    url: '/api/local-services/home-music/actions',
    headers,
    payload: { action: 'start', confirmation: 'invalid', unit: 'ssh.service' },
  });
  assert.equal(invalid.statusCode, 400);
  const preflight = await app.inject({
    method: 'GET',
    url: '/api/local-services/home-music/plan?action=start',
    headers,
  });
  assert.equal(preflight.statusCode, 200);
  const confirmation = preflight.json<{ plan: { confirmation: string } }>().plan
    .confirmation;
  const request = {
    method: 'POST' as const,
    url: '/api/local-services/home-music/actions',
    headers,
    payload: { action: 'start', confirmation },
  };
  const executed = await app.inject(request);
  assert.equal(executed.statusCode, 200);
  assert.equal(
    executed.json<{ outcome: { status: string } }>().outcome.status,
    'completed',
  );
  assert.equal((await app.inject(request)).statusCode, 409);
});
