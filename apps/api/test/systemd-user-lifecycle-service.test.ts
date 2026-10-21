import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type {
  HostServiceInventory,
  HostServiceObservation,
} from '@dev-dashboard/contracts';

import { SystemdUserLifecycleService } from '../src/services/systemd-user-lifecycle-service.js';
import { ServiceResourceOperationLock } from '../src/services/service-resource-operation-lock.js';
import { systemdUserOwnerLeaseKeys } from '../src/services/confirmed-lifecycle-systemd-evidence.js';

const REV = 'a'.repeat(64);
const PLAN = 'b'.repeat(64);
const REF = 'systemd:user:fixture-worker.service';
const REQUEST = {
  projectId: 'project-a',
  environmentInstanceId: 'env-a',
  serviceRef: REF,
  action: 'start' as const,
  expectedRevision: REV,
  planHash: PLAN,
};

function inventory(
  state: 'running' | 'stopped' = 'stopped',
  overrides: Partial<HostServiceObservation> = {},
): HostServiceInventory {
  return {
    status: 'ready',
    observedAt: '2026-10-21T08:00:00.000Z',
    sources: [
      { scope: 'user', status: 'ready' },
      { scope: 'system', status: 'unavailable' },
    ],
    services: [
      {
        id: REF,
        provider: 'systemd',
        scope: 'user',
        name: 'fixture-worker.service',
        state,
        readiness: 'unknown',
        bootState: 'disabled',
        activeState: state === 'running' ? 'active' : 'inactive',
        subState: state === 'running' ? 'running' : 'dead',
        fragmentKind: 'persistent',
        unitKind: 'regular',
        managed: false,
        observedAt: '2026-10-21T08:00:00.000Z',
        ...overrides,
      },
    ],
    truncated: false,
  };
}

function fixture(
  options: {
    authorized?: boolean | (() => boolean);
    observations?: HostServiceInventory[];
    platform?: NodeJS.Platform;
    runnerError?: boolean;
    guardError?: boolean;
  } = {},
) {
  let inspected = 0;
  let authorized = 0;
  const commands: string[] = [];
  const snapshots = options.observations ?? [
    inventory('stopped'),
    inventory('stopped'),
    inventory('running'),
  ];
  const service = new SystemdUserLifecycleService(
    {
      inventory: {
        inspect: async () =>
          snapshots[Math.min(inspected++, snapshots.length - 1)]!,
      },
      locks: {
        withResources: async (_keys, work) =>
          work({
            assertOwned: async () => {
              if (options.guardError) throw new Error('lease no longer owned');
            },
          }),
      },
      authorize: async () => {
        authorized++;
        return typeof options.authorized === 'function'
          ? options.authorized()
          : (options.authorized ?? true);
      },
    },
    {
      platform: options.platform ?? 'linux',
      runSystemctl: async (action, unit) => {
        commands.push(action + ':' + unit);
        if (options.runnerError)
          throw new Error('token PRIVATE local-path /home/secret');
      },
    },
  );
  return {
    service,
    commands,
    get inspected() {
      return inspected;
    },
    get authorized() {
      return authorized;
    },
  };
}

test('mutação autorizada revalida e reobserva, mas não afirma readiness', async () => {
  const f = fixture();
  const result = await f.service.run(REQUEST);
  assert.deepEqual(f.commands, ['start:fixture-worker.service']);
  assert.equal(f.inspected, 3);
  assert.equal(f.authorized, 2);
  assert.equal(result.outcome, 'changed');
  assert.equal(result.state, 'running');
  assert.equal(result.readiness, 'unknown');
});

test('um serviço já no estado alvo não dispara comando', async () => {
  const f = fixture({ observations: [inventory('running')] });
  const result = await f.service.run(REQUEST);
  assert.equal(result.outcome, 'already-in-target-state');
  assert.deepEqual(f.commands, []);
});

test('stop não altera boot policy e restart exige unidade running', async () => {
  const stop = fixture({
    observations: [
      inventory('running'),
      inventory('running'),
      inventory('stopped'),
    ],
  });
  const stopped = await stop.service.run({ ...REQUEST, action: 'stop' });
  assert.equal(stopped.state, 'stopped');
  assert.deepEqual(stop.commands, ['stop:fixture-worker.service']);
  const restart = fixture();
  await assert.rejects(
    restart.service.run({ ...REQUEST, action: 'restart' }),
    /Restart requires/,
  );
  assert.deepEqual(restart.commands, []);
});

test('discovery/binding sozinho não dá autorização e system scope não é mutável', async () => {
  const denied = fixture({ authorized: false });
  await assert.rejects(denied.service.run(REQUEST), /explicitly authorized/);
  assert.equal(denied.inspected, 0);
  assert.deepEqual(denied.commands, []);
  const system = fixture();
  await assert.rejects(
    system.service.run({
      ...REQUEST,
      serviceRef: 'systemd:system:home-music.service',
    }),
    /Only explicitly authorized/,
  );
  assert.deepEqual(system.commands, []);
});

test('nega identity inválida, dashboard, template e plano ausente antes do command', async () => {
  for (const ref of [
    'systemd:user:../evil.service',
    'systemd:user:dev-dashboard.service',
    'systemd:user:worker@.service',
    'systemd:user:--evil.service',
    'systemd:user:other.socket',
  ]) {
    const f = fixture();
    await assert.rejects(f.service.run({ ...REQUEST, serviceRef: ref }));
    assert.deepEqual(f.commands, []);
  }
  const invalidPlan = fixture();
  await assert.rejects(
    invalidPlan.service.run({ ...REQUEST, planHash: '' }),
    /server-verified/,
  );
  assert.deepEqual(invalidPlan.commands, []);
});

test('não opera fora do Linux, com unit masked, transient ou observação parcial', async () => {
  const other = fixture({ platform: 'darwin' });
  await assert.rejects(other.service.run(REQUEST), /Linux only/);
  for (const snap of [
    inventory('stopped', { bootState: 'masked' }),
    inventory('stopped', { unitKind: 'transient' }),
    inventory('stopped', { fragmentKind: 'runtime' }),
    { ...inventory(), truncated: true },
    {
      ...inventory(),
      sources: [{ scope: 'user' as const, status: 'partial' as const }],
    },
  ]) {
    const f = fixture({ observations: [snap] });
    await assert.rejects(f.service.run(REQUEST));
    assert.deepEqual(f.commands, []);
  }
});

test('nega race de estado e revogação de autorização antes do dispatch', async () => {
  const raced = fixture({
    observations: [inventory('stopped'), inventory('running')],
  });
  await assert.rejects(raced.service.run(REQUEST), /changed since preflight/);
  assert.deepEqual(raced.commands, []);
  let calls = 0;
  const revoked = fixture({ authorized: () => ++calls === 1 });
  await assert.rejects(revoked.service.run(REQUEST), /authorization changed/);
  assert.deepEqual(revoked.commands, []);
});

test('falha de lease, provider e resultado ambíguo nunca viram sucesso', async () => {
  const lost = fixture({ guardError: true });
  await assert.rejects(lost.service.run(REQUEST), /lease no longer owned/);
  assert.deepEqual(lost.commands, []);
  const error = fixture({ runnerError: true });
  await assert.rejects(error.service.run(REQUEST), (reason: Error) => {
    assert.doesNotMatch(reason.message, /PRIVATE|\/home\/secret/);
    return true;
  });
  const ambiguous = fixture({ observations: [inventory('stopped')] });
  await assert.rejects(ambiguous.service.run(REQUEST), /unverified/);
  assert.deepEqual(ambiguous.commands, ['start:fixture-worker.service']);
});

test('systemd owner holds physical and logical durable leases until reobservation', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'systemd-owner-lock-'));
  let resume: (() => void) | undefined;
  try {
    const ownerLocks = new ServiceResourceOperationLock({ stateDirectory: root });
    const other = new ServiceResourceOperationLock({ stateDirectory: root });
    let entered!: () => void;
    const arrived = new Promise<void>((r) => { entered = r; });
    const pending = new Promise<void>((r) => { resume = r; });
    let observed = 0;
    let dispatched = 0;
    const owner = new SystemdUserLifecycleService({
      inventory: { inspect: async () => inventory(observed++ < 2 ? 'stopped' : 'running') },
      locks: ownerLocks,
      authorize: async () => true,
    }, {
      platform: 'linux',
      runSystemctl: async () => { dispatched++; entered(); await pending; },
    });
    const first = owner.run(REQUEST);
    await arrived;
    assert.equal(dispatched, 1);
    const keys = systemdUserOwnerLeaseKeys(REF);
    assert.deepEqual(keys, ['resource:' + REF, REF]);
    for (const key of keys!) {
      const dir = path.join(root, 'service-resource-leases-v1',
        createHash('sha256').update(key).digest('hex'));
      assert.equal(existsSync(dir), true);
      await assert.rejects(
        other.withResources([key], async () => 'unexpected'),
        /already using one of these resources/,
      );
    }
    assert.equal(await other.withResources(
      ['systemd:user:independent-fixture.service'],
      async () => 'unrelated',
    ), 'unrelated');
    resume?.();
    const result = await first;
    assert.equal(result.outcome, 'changed');
    assert.equal(result.readiness, 'unknown');
    assert.equal(dispatched, 1);
    assert.equal(observed, 3);
    for (const key of keys!) {
      const dir = path.join(root, 'service-resource-leases-v1',
        createHash('sha256').update(key).digest('hex'));
      assert.equal(existsSync(dir), false);
    }
  } finally {
    resume?.();
    rmSync(root, { recursive: true, force: true });
  }
});

test('preexisting logical coordinator lease denies systemd owner before dispatch', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'systemd-owner-lock-'));
  try {
    const coordinator = new ServiceResourceOperationLock({ stateDirectory: root });
    const ownerLocks = new ServiceResourceOperationLock({ stateDirectory: root });
    let observed = 0;
    let dispatched = 0;
    const owner = new SystemdUserLifecycleService({
      inventory: { inspect: async () => { observed++; return inventory('stopped'); } },
      locks: ownerLocks,
      authorize: async () => true,
    }, {
      platform: 'linux', runSystemctl: async () => { dispatched++; },
    });
    await coordinator.withResources(['resource:' + REF], async () => {
      await assert.rejects(owner.run(REQUEST), /already using one of these resources/);
    });
    assert.equal(observed, 0);
    assert.equal(dispatched, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('unsafe unit refs cannot create shared owner lease keys', () => {
  for (const ref of [
    'systemd:system:fixture-worker.service',
    'systemd:user:dev-dashboard.service',
    'systemd:user:worker@.service',
    'systemd:user:../bad.service',
    'systemd:user:--bad.service',
  ]) assert.equal(systemdUserOwnerLeaseKeys(ref), null);
});
