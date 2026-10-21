import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  HostServiceInventory,
  ProjectServiceBinding,
  SystemdProjectCapabilitiesSnapshot,
} from '@dev-dashboard/contracts';

import { SystemdLifecycleCapabilitiesService } from '../src/services/systemd-lifecycle-capabilities-service.js';

const NOW = new Date('2026-10-21T13:00:00.000Z');
const PROJECT = 'project-a';
const ENV = 'environment:primary:project-a';
const USER_REF = 'systemd:user:fixture.service';
const SYSTEM_REF = 'systemd:system:postgresql.service';
const BINDING_ID = '11111111-1111-4111-8111-111111111111';
const REV = 'a'.repeat(64);

function binding(
  overrides: Partial<ProjectServiceBinding> = {},
): ProjectServiceBinding {
  return {
    id: BINDING_ID,
    projectId: PROJECT,
    environmentInstanceId: ENV,
    serviceRef: USER_REF,
    relation: 'required',
    requiredForStart: true,
    enabled: true,
    dependencies: [],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function observation(
  state: 'running' | 'stopped' = 'stopped',
): HostServiceInventory {
  return {
    status: 'partial', // System scope may be unavailable without blocking user.
    observedAt: NOW.toISOString(),
    sources: [
      { scope: 'user', status: 'ready' },
      { scope: 'system', status: 'unavailable' },
    ],
    services: [
      {
        id: USER_REF,
        name: 'fixture.service',
        provider: 'systemd',
        scope: 'user',
        state,
        readiness: 'unknown',
        bootState: 'disabled',
        activeState: state === 'stopped' ? 'inactive' : 'active',
        subState: state === 'stopped' ? 'dead' : 'running',
        fragmentKind: 'persistent',
        unitKind: 'regular',
        managed: false,
        observedAt: NOW.toISOString(),
      },
    ],
    truncated: false,
  };
}

function setup(
  opts: {
    bindings?: ProjectServiceBinding[];
    inventory?: HostServiceInventory;
    grant?: boolean;
    platform?: NodeJS.Platform;
    failInventory?: boolean;
    runtimeKind?: string;
    revision?: string;
  } = {},
) {
  const records = opts.bindings ?? [binding()];
  let inventoryCalls = 0;
  let grantCalls = 0;
  const deps = {
    projects: { findProject: (id: string) => (id === PROJECT ? { id } : null) },
    environments: {
      findById: (id: string) =>
        id === ENV
          ? {
              projectId: PROJECT,
              runtime: { kind: opts.runtimeKind ?? 'host' },
            }
          : null,
    },
    bindings: {
      byProject: (id: string) =>
        records.filter((record) => record.projectId === id),
      byResource: (ref: string) =>
        records.filter((record) => record.serviceRef === ref),
      revision: () => opts.revision ?? REV,
    },
    inventory: {
      inspect: async () => {
        inventoryCalls++;
        if (opts.failInventory) throw Error('secret path /home/private');
        return opts.inventory ?? observation();
      },
    },
    grants: {
      find: (request: {
        projectId: string;
        environmentInstanceId: string;
        serviceRef: string;
        action: 'start' | 'stop' | 'restart';
      }) => {
        grantCalls++;
        return opts.grant
          ? {
              projectId: request.projectId,
              environmentInstanceId: request.environmentInstanceId,
              serviceRef: request.serviceRef,
              bindingId: BINDING_ID,
              bindingRevision: REV,
              actions: [request.action],
              expiresAt: '2026-10-22T00:00:00.000Z',
            }
          : null;
      },
    },
  };
  const service = new SystemdLifecycleCapabilitiesService(deps, {
    platform: opts.platform ?? 'linux',
    now: () => NOW,
  });
  return {
    service,
    get inventoryCalls() {
      return inventoryCalls;
    },
    get grantCalls() {
      return grantCalls;
    },
  };
}

test('bound user service exposes action-scoped reasons, not execution', async () => {
  const f = setup();
  const result = await f.service.inspect(PROJECT);
  assert.equal(result.projectId, PROJECT);
  assert.equal(result.environmentInstanceId, ENV);
  assert.equal(result.readAt, NOW.toISOString());
  assert.equal(result.partial, false);
  assert.equal(f.inventoryCalls, 1);
  assert.equal(result.services.length, 1);
  const first = result.services[0]!;
  assert.equal(first.state, 'stopped');
  assert.equal(first.readiness, 'unknown');
  assert.equal(first.executable, false);
  assert.equal(first.start.status, 'permission-required');
  assert.equal(first.stop.status, 'unsupported');
  assert.equal(first.restart.status, 'unsupported');
  assert.equal(f.grantCalls, 1);
  assert.doesNotMatch(JSON.stringify(result), /systemctl|\/home\/private/);
});

test('confirmed grant still cannot make capability executable', async () => {
  const f = setup({ grant: true });
  const result = await f.service.inspect(PROJECT);
  assert.equal(result.services[0]?.start.status, 'unsupported');
  assert.match(result.services[0]?.start.reason ?? '', /executable/);
  assert.equal(result.services[0]?.executable, false);
});

test('running user unit exposes only Stop as permission-required', async () => {
  const f = setup({ inventory: observation('running') });
  const result = await f.service.inspect(PROJECT, ENV);
  assert.equal(result.services[0]?.stop.status, 'permission-required');
  assert.equal(result.services[0]?.start.status, 'unsupported');
});

test('system scope never queries a grant, even when bound', async () => {
  const f = setup({ bindings: [binding({ serviceRef: SYSTEM_REF })] });
  const result = await f.service.inspect(PROJECT);
  assert.equal(result.services[0]?.scope, 'system');
  assert.equal(result.services[0]?.start.status, 'unsupported');
  assert.equal(result.services[0]?.stop.status, 'unsupported');
  assert.equal(f.grantCalls, 0);
});

test('unknown/partial user observation fails closed and masks errors', async () => {
  for (const options of [
    { inventory: { ...observation(), truncated: true } },
    {
      inventory: {
        ...observation(),
        sources: [{ scope: 'user' as const, status: 'partial' as const }],
      },
    },
    { failInventory: true },
  ]) {
    const f = setup(options);
    const result = await f.service.inspect(PROJECT);
    assert.equal(result.partial, true);
    assert.equal(result.services[0]?.start.status, 'unknown');
    assert.equal(f.grantCalls, 0);
    assert.doesNotMatch(JSON.stringify(result), /secret|private/);
  }
  const stale = setup({ inventory: { ...observation(), services: [] } });
  assert.equal(
    (await stale.service.inspect(PROJECT)).services[0]?.start.status,
    'unknown',
  );
});

test('stale or future inventory/service evidence cannot grant a capability', async () => {
  const previous = new Date(NOW.getTime() - 60_000).toISOString();
  const future = new Date(NOW.getTime() + 60_000).toISOString();
  for (const inventory of [
    { ...observation(), observedAt: previous },
    { ...observation(), observedAt: future },
    {
      ...observation(),
      services: [{ ...observation().services[0]!, observedAt: previous }],
    },
  ]) {
    const f = setup({ inventory, grant: true });
    const result = await f.service.inspect(PROJECT);
    assert.equal(result.services[0]?.start.status, 'unknown');
    assert.equal(f.grantCalls, 0);
    assert.equal(result.services[0]?.executable, false);
  }
});

test('grant policy errors become safe diagnostics, not raw provider exceptions', async () => {
  const f = setup();
  // The policy itself catches ordinary file errors; this fixture exercises
  // the capability service boundary when an injected reader fails.
  const faulty = new SystemdLifecycleCapabilitiesService(
    {
      projects: { findProject: () => ({ id: PROJECT }) },
      environments: { findById: () => ({
        projectId: PROJECT,
        runtime: { kind: 'host' as const },
      }) },
      bindings: {
        byProject: () => [binding()],
        byResource: () => [binding()],
        revision: () => REV,
      },
      inventory: { inspect: async () => observation() },
      grants: { find: () => { throw Error('secret /home/private'); } },
    },
    { platform: 'linux', now: () => NOW },
  );
  const result = await faulty.inspect(PROJECT);
  assert.equal(result.services[0]?.start.status, 'unknown');
  assert.doesNotMatch(JSON.stringify(result), /secret|private/);
  assert.equal((await f.service.inspect(PROJECT)).services[0]?.executable, false);
});

test('masked, transient, altered identity and self unit are unsupported', async () => {
  for (const inventory of [
    {
      ...observation(),
      services: [
        { ...observation().services[0]!, bootState: 'masked' as const },
      ],
    },
    {
      ...observation(),
      services: [
        { ...observation().services[0]!, unitKind: 'transient' as const },
      ],
    },
    {
      ...observation(),
      services: [
        { ...observation().services[0]!, fragmentKind: 'runtime' as const },
      ],
    },
    {
      ...observation(),
      services: [{ ...observation().services[0]!, name: 'changed.service' }],
    },
  ]) {
    const result = await setup({ inventory }).service.inspect(PROJECT);
    assert.equal(result.services[0]?.start.status, 'unsupported');
  }
  const unsafe = setup({
    bindings: [binding({ serviceRef: 'systemd:user:dev-dashboard.service' })],
  });
  assert.equal(
    (await unsafe.service.inspect(PROJECT)).services[0]?.start.status,
    'unsupported',
  );
});

test('shared, disabled and other relations remain nonmutating', async () => {
  const shared = setup({
    bindings: [
      binding(),
      binding({
        id: '22222222-2222-4222-8222-222222222222',
        projectId: 'other',
        environmentInstanceId: 'environment:primary:other',
        enabled: false,
      }),
    ],
  });
  assert.equal(
    (await shared.service.inspect(PROJECT)).services[0]?.start.status,
    'unsupported',
  );
  for (const overrides of [
    { enabled: false },
    { relation: 'observed' as const },
    { relation: 'owned' as const },
    { requiredForStart: false },
  ]) {
    const f = setup({ bindings: [binding(overrides)] });
    assert.equal(
      (await f.service.inspect(PROJECT)).services[0]?.start.status,
      'unsupported',
    );
  }
});

test('environment scoping, non-host runtime and non-Linux never mutate', async () => {
  const f = setup();
  await assert.rejects(f.service.inspect('missing'), /Project not found/);
  await assert.rejects(
    f.service.inspect(PROJECT, 'foreign'),
    /Environment not found/,
  );
  const nonHost = setup({ runtimeKind: 'dev-container' });
  assert.equal(
    (await nonHost.service.inspect(PROJECT)).services[0]?.start.status,
    'unsupported',
  );
  assert.equal(nonHost.inventoryCalls, 0);
  const nonLinux = setup({ platform: 'darwin' });
  assert.equal(
    (await nonLinux.service.inspect(PROJECT)).services[0]?.start.status,
    'unsupported',
  );
  assert.equal(nonLinux.inventoryCalls, 0);
  const empty = setup({ bindings: [] });
  assert.deepEqual((await empty.service.inspect(PROJECT)).services, []);
  assert.equal(empty.inventoryCalls, 0);
});

test('grant tied to stale binding revision has no effect', async () => {
  const f = setup({ grant: true, revision: 'b'.repeat(64) });
  const result: SystemdProjectCapabilitiesSnapshot =
    await f.service.inspect(PROJECT);
  assert.equal(result.services[0]?.start.status, 'permission-required');
  assert.equal(result.services[0]?.executable, false);
});
