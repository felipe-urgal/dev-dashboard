import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  Project,
  ProjectServiceBindingDraft,
  ServiceCatalogEntry,
  ServiceCatalogSnapshot,
  SystemdProjectCapabilitiesSnapshot,
} from '@dev-dashboard/contracts';

import { ServiceLifecyclePlanningService } from '../src/services/service-lifecycle-planning-service.js';
import { ProjectServiceBindingStore } from '../src/store/project-service-binding-store.js';
import { ServiceRuntimeProfileStore } from '../src/store/service-runtime-profile-store.js';

const NOW = new Date('2026-10-19T16:00:00.000Z');
const dbRef = 'systemd:system:postgresql.service';
const apiRef = 'compose:loto:api';
const ownedDbRef = 'compose:loto:database';
const env = (projectId: string) => 'environment:primary:' + projectId;
const projects: Project[] = ['loto', 'gastos'].map((id) => ({
  id,
  name: id,
  path: '/tmp/' + id,
  workspaceId: 'test',
  source: 'workspace',
  type: 'node',
  enabled: true,
  capabilities: [],
}));

const service = (
  id: string,
  overrides: Partial<ServiceCatalogEntry> = {},
): ServiceCatalogEntry => ({
  id,
  name: id,
  provider: id.startsWith('compose:') ? 'compose' : 'systemd',
  scope: id.startsWith('compose:') ? 'environment' : 'system',
  projectId: id.startsWith('compose:') ? 'loto' : undefined,
  state: 'running',
  readiness: 'ready',
  ownership: id.startsWith('compose:') ? 'confirmed' : 'unmanaged',
  ports: [],
  observedAt: NOW.toISOString(),
  ...overrides,
});
const draft = (
  ref: string,
  relation: ProjectServiceBindingDraft['relation'],
  dependencies: string[] = [],
): ProjectServiceBindingDraft => ({
  serviceRef: ref,
  relation,
  requiredForStart: true,
  enabled: true,
  dependencies: dependencies.map((ref) => ({
    serviceRef: ref,
    source: 'manual',
  })),
});

function fixture(options: {
  systemdCapabilities?: {
    inspect(projectId: string, environmentInstanceId?: string): Promise<SystemdProjectCapabilitiesSnapshot>;
  };
} = {}) {
  const store = new ProjectServiceBindingStore();
  const profiles = new ServiceRuntimeProfileStore();
  const entries: ServiceCatalogEntry[] = [
    service(dbRef),
    service(apiRef, { state: 'stopped', readiness: 'unknown', ports: [5200] }),
    service(ownedDbRef),
  ];
  const snapshot: ServiceCatalogSnapshot = {
    status: 'ready',
    observedAt: NOW.toISOString(),
    entries,
    ports: [],
    truncated: false,
    providers: [
      { provider: 'systemd', status: 'ready' },
      { provider: 'compose', status: 'ready' },
      { provider: 'ports', status: 'ready' },
    ],
  };
  const planner = new ServiceLifecyclePlanningService(
    {
      bindings: store,
      profiles,
      projects: {
        findProject: (projectId: string) =>
          projects.find((p) => p.id === projectId) ?? null,
      },
      environments: {
        findById: (id: string) => {
          const project = projects.find(
            (p) =>
              env(p.id) === id ||
              id === 'environment:worktree:' + p.id + ':one',
          );
          return project
            ? {
                id,
                projectId: project.id,
                source:
                  id === env(project.id)
                    ? { kind: 'primary' as const, path: project.path }
                    : {
                        kind: 'worktree' as const,
                        path: project.path + '/w1',
                        worktreeId: 'one',
                      },
                runtime: { kind: 'host' as const },
                lifecycle: 'ready' as const,
              }
            : null;
        },
      },
      catalog: { inspect: async () => snapshot },
      ...(options.systemdCapabilities ? { systemdCapabilities: options.systemdCapabilities } : {}),
    },
    { now: () => NOW },
  );

  const bind = (
    projectId: string,
    ref: string,
    relation: ProjectServiceBindingDraft['relation'],
    dependencies: string[] = [],
  ) =>
    store.save(
      projectId,
      {
        ...draft(ref, relation, dependencies),
        environmentInstanceId: env(projectId),
      },
      store.revision(projectId),
      NOW,
    );
  return { planner, store, profiles, snapshot, entries, bind };
}

test('start orders prerequisites first and requires readiness rather than a running port', async () => {
  const { planner, bind } = fixture();
  bind('loto', dbRef, 'required');
  bind('loto', apiRef, 'owned', [dbRef]);
  const plan = await planner.preview('loto', 'start');
  assert.equal(plan.status, 'ready');
  assert.deepEqual(plan.order, [dbRef, apiRef]);
  assert.deepEqual(
    plan.nodes.map((n) => n.disposition),
    ['alreadyReady', 'willStart'],
  );
  assert.equal(plan.executable, false);
  assert.match(plan.planHash, /^[a-f0-9]{64}$/);
  assert.equal(
    Date.parse(plan.expiresAt) - Date.parse(plan.observedAt),
    30_000,
  );
});

test('stop reverses dependencies and retains external required services', async () => {
  const { planner, bind, entries } = fixture();
  entries.find((e) => e.id === apiRef)!.state = 'running';
  entries.find((e) => e.id === apiRef)!.readiness = 'ready';
  bind('loto', dbRef, 'required');
  bind('loto', apiRef, 'owned', [dbRef]);
  const plan = await planner.preview('loto', 'stop');
  assert.equal(plan.status, 'ready');
  assert.deepEqual(plan.order, [apiRef, dbRef]);
  assert.deepEqual(
    plan.nodes.map((n) => n.disposition),
    ['willStop', 'retained'],
  );
});

test('shared owned Compose resource is retained when another project uses it', async () => {
  const { planner, bind } = fixture();
  bind('loto', ownedDbRef, 'owned');
  bind('gastos', ownedDbRef, 'required');
  const plan = await planner.preview('loto', 'stop');
  assert.equal(plan.nodes[0]?.disposition, 'retained');
  assert.equal(plan.nodes[0]?.consumerCount, 2);
  assert.match(plan.nodes[0]?.diagnostic ?? '', /Another project/);
});

test('unready shared database prevents starting dependent application', async () => {
  const { planner, bind, entries } = fixture();
  entries.find((e) => e.id === dbRef)!.readiness = 'unknown';
  bind('loto', dbRef, 'required');
  bind('loto', apiRef, 'owned', [dbRef]);
  const plan = await planner.preview('loto', 'start');
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.nodes[0]?.disposition, 'blocked');
  assert.equal(plan.nodes[1]?.disposition, 'blocked');
});

test('stale binding, missing dependency and cycle fail closed', async () => {
  const { planner, bind, entries } = fixture();
  bind('loto', apiRef, 'owned', [dbRef]);
  let plan = await planner.preview('loto', 'start');
  assert.equal(plan.status, 'blocked');
  assert.equal(
    plan.nodes.find((n) => n.serviceRef === dbRef)?.relation,
    'missing',
  );
  bind('loto', dbRef, 'required', [apiRef]);
  plan = await planner.preview('loto', 'start');
  assert.equal(plan.status, 'blocked');
  assert.match(plan.diagnostics.join(' '), /cycle/);
  entries.splice(
    entries.findIndex((e) => e.id === apiRef),
    1,
  );
  plan = await planner.preview('loto', 'stop');
  assert.equal(
    plan.nodes.find((n) => n.serviceRef === apiRef)?.disposition,
    'blocked',
  );
});

test('occupied declared host port and partial observation block action', async () => {
  const { planner, bind, snapshot } = fixture();
  bind('loto', apiRef, 'owned');
  snapshot.ports.push({ address: '127.0.0.1', port: 5200, conflict: false });
  let plan = await planner.preview('loto', 'start');
  assert.equal(plan.status, 'blocked');
  assert.match(plan.nodes[0]?.diagnostic ?? '', /host port/);
  snapshot.ports.splice(0);
  snapshot.status = 'partial';
  plan = await planner.preview('loto', 'start');
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.executable, false);
});

test('unchanged preview is repeatable; changed revision or runtime evidence invalidates hash', async () => {
  const { planner, bind, snapshot } = fixture();
  bind('loto', apiRef, 'owned');
  const first = await planner.preview('loto', 'start');
  const same = await planner.preview(
    'loto',
    'start',
    undefined,
    first.planHash,
  );
  assert.equal(same.planHash, first.planHash);
  // Polling refreshes timestamps, but should not invalidate unchanged state.
  snapshot.observedAt = '2026-10-19T16:00:01.000Z';
  snapshot.entries[0]!.observedAt = '2026-10-19T16:00:01.000Z';
  const refreshed = await planner.preview(
    'loto',
    'start',
    undefined,
    first.planHash,
  );
  assert.equal(refreshed.planHash, first.planHash);

  bind('loto', dbRef, 'required');
  await assert.rejects(
    planner.preview('loto', 'start', undefined, first.planHash),
    (e: unknown) => e instanceof Error && /plan changed/i.test(e.message),
  );
  const next = await planner.preview('loto', 'start');
  snapshot.entries.find((e) => e.id === apiRef)!.state = 'running';
  await assert.rejects(
    planner.preview('loto', 'start', undefined, next.planHash),
    (e: unknown) => e instanceof Error && /plan changed/i.test(e.message),
  );
});

test('missing project or mismatched environment is rejected without any mutation', async () => {
  const { planner } = fixture();
  await assert.rejects(planner.preview('missing', 'stop'), /Project not found/);
  await assert.rejects(
    planner.preview('loto', 'start', env('gastos')),
    /Environment not found/,
  );
});

test('selected dev/test profiles use exact binding IDs and change the plan hash', async () => {
  const { planner, bind, store, profiles } = fixture();
  const db = bind('loto', dbRef, 'required');
  const api = bind('loto', apiRef, 'owned', [dbRef]);
  const testProfile = profiles.save(
    'loto',
    {
      environmentInstanceId: env('loto'),
      kind: 'test',
      bindingIds: [db.id],
    },
    profiles.revision('loto'),
    NOW,
  );
  const devProfile = profiles.save(
    'loto',
    {
      environmentInstanceId: env('loto'),
      kind: 'dev',
      bindingIds: [db.id, api.id],
    },
    profiles.revision('loto'),
    NOW,
  );
  const unscoped = await planner.preview('loto', 'start');
  const testPlan = await planner.preview(
    'loto',
    'start',
    env('loto'),
    undefined,
    testProfile.id,
  );
  const devPlan = await planner.preview(
    'loto',
    'start',
    env('loto'),
    undefined,
    devProfile.id,
  );
  assert.deepEqual(testPlan.order, [dbRef]);
  assert.deepEqual(devPlan.order, [dbRef, apiRef]);
  assert.deepEqual(unscoped.order, devPlan.order);
  assert.equal(testPlan.profile?.kind, 'test');
  assert.equal(devPlan.profile?.revision, profiles.revision('loto'));
  assert.equal(testPlan.executable, false);
  assert.notEqual(testPlan.planHash, devPlan.planHash);
  assert.notEqual(testPlan.planHash, unscoped.planHash);
  await planner.preview(
    'loto',
    'start',
    env('loto'),
    testPlan.planHash,
    testProfile.id,
  );

  profiles.save(
    'loto',
    {
      environmentInstanceId: env('loto'),
      kind: 'test',
      bindingIds: [db.id, api.id],
    },
    profiles.revision('loto'),
    NOW,
    testProfile.id,
  );
  await assert.rejects(
    planner.preview(
      'loto',
      'start',
      env('loto'),
      testPlan.planHash,
      testProfile.id,
    ),
    /plan changed/i,
  );
  assert.equal(store.byProject('loto').length, 2);
});

test('profile-scoped Start blocks omitted dependencies; empty selection is not fallback', async () => {
  const { planner, bind, profiles } = fixture();
  bind('loto', dbRef, 'required');
  const api = bind('loto', apiRef, 'owned', [dbRef]);
  const selected = profiles.save(
    'loto',
    {
      environmentInstanceId: env('loto'),
      kind: 'test',
      bindingIds: [api.id],
    },
    profiles.revision('loto'),
    NOW,
  );
  const start = await planner.preview(
    'loto',
    'start',
    env('loto'),
    undefined,
    selected.id,
  );
  assert.equal(start.status, 'blocked');
  assert.equal(
    start.nodes.find((node) => node.serviceRef === dbRef)?.relation,
    'missing',
  );
  assert.equal(
    start.nodes.find((node) => node.serviceRef === apiRef)?.disposition,
    'blocked',
  );
  const empty = profiles.save(
    'loto',
    {
      environmentInstanceId: env('loto'),
      kind: 'dev',
      bindingIds: [],
    },
    profiles.revision('loto'),
    NOW,
  );
  const result = await planner.preview(
    'loto',
    'stop',
    env('loto'),
    undefined,
    empty.id,
  );
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.nodes, []);
  assert.equal(result.executable, false);
});

test('profile-scoped Stop retains resources used by another profile in the same environment', async () => {
  const { planner, bind, entries, profiles } = fixture();
  entries.find((item) => item.id === apiRef)!.state = 'running';
  entries.find((item) => item.id === apiRef)!.readiness = 'ready';
  const binding = bind('loto', apiRef, 'owned');
  const dev = profiles.save(
    'loto',
    {
      environmentInstanceId: env('loto'),
      kind: 'dev',
      bindingIds: [binding.id],
    },
    profiles.revision('loto'),
    NOW,
  );
  const production = profiles.save(
    'loto',
    {
      environmentInstanceId: env('loto'),
      kind: 'production',
      bindingIds: [binding.id],
    },
    profiles.revision('loto'),
    NOW,
  );
  const scoped = await planner.preview(
    'loto',
    'stop',
    env('loto'),
    undefined,
    dev.id,
  );
  assert.equal(scoped.nodes[0]?.disposition, 'retained');
  assert.match(scoped.nodes[0]?.diagnostic ?? '', /Another runtime profile/);
  assert.equal(scoped.executable, false);
  const fallback = await planner.preview('loto', 'stop');
  assert.equal(fallback.nodes[0]?.disposition, 'willStop');
  profiles.delete('loto', production.id, profiles.revision('loto'));
  const released = await planner.preview(
    'loto',
    'stop',
    env('loto'),
    undefined,
    dev.id,
  );
  assert.equal(released.nodes[0]?.disposition, 'willStop');
  await assert.rejects(
    planner.preview('loto', 'stop', env('loto'), scoped.planHash, dev.id),
    /plan changed/i,
  );
});

test('stale and cross-environment profile references fail closed', async () => {
  const { planner, bind, store, profiles } = fixture();
  const binding = bind('loto', dbRef, 'required');
  const selection = profiles.save(
    'loto',
    {
      environmentInstanceId: env('loto'),
      kind: 'test',
      bindingIds: [binding.id],
    },
    profiles.revision('loto'),
    NOW,
  );
  await assert.rejects(
    planner.preview('gastos', 'start', env('gastos'), undefined, selection.id),
    /Runtime profile not found/,
  );
  await assert.rejects(
    planner.preview(
      'loto',
      'start',
      'environment:worktree:loto:one',
      undefined,
      selection.id,
    ),
    /Runtime profile not found/,
  );
  store.save(
    'loto',
    {
      serviceRef: dbRef,
      relation: 'required',
      enabled: false,
      requiredForStart: true,
      dependencies: [],
      environmentInstanceId: env('loto'),
    },
    store.revision('loto'),
    NOW,
    binding.id,
  );
  await assert.rejects(
    planner.preview('loto', 'start', env('loto'), undefined, selection.id),
    /missing or disabled bindings/,
  );
  // Without a profile, a disabled binding still uses the established empty fallback.
  const fallback = await planner.preview('loto', 'start');
  assert.equal(fallback.executable, false);
  assert.equal(fallback.status, 'blocked');
});

test('independent worktree profile selects only its own environment bindings', async () => {
  const { planner, store, profiles } = fixture();
  const worktree = 'environment:worktree:loto:one';
  const primary = store.save(
    'loto',
    {
      ...draft(apiRef, 'owned'),
      environmentInstanceId: env('loto'),
    },
    store.revision('loto'),
    NOW,
  );
  const secondary = store.save(
    'loto',
    {
      ...draft(dbRef, 'required'),
      environmentInstanceId: worktree,
    },
    store.revision('loto'),
    NOW,
  );
  const workProfile = profiles.save(
    'loto',
    {
      environmentInstanceId: worktree,
      kind: 'test',
      bindingIds: [secondary.id],
    },
    profiles.revision('loto'),
    NOW,
  );
  profiles.save(
    'loto',
    {
      environmentInstanceId: env('loto'),
      kind: 'test',
      bindingIds: [primary.id],
    },
    profiles.revision('loto'),
    NOW,
  );
  const workPlan = await planner.preview(
    'loto',
    'start',
    worktree,
    undefined,
    workProfile.id,
  );
  assert.deepEqual(workPlan.order, [dbRef]);
  assert.equal(workPlan.target.environmentInstanceId, worktree);
  assert.equal(workPlan.executable, false);
});

test('systemd capability advice enters plan hash; revoked grant invalidates approved preview', async () => {
  let status: 'permission-required' | 'unsupported' | 'unknown' =
    'permission-required';
  let inspections = 0;
  const f = fixture({
    systemdCapabilities: {
      inspect: async (projectId, environmentInstanceId) => {
        inspections++;
        const record = f.store.byProject(projectId)[0]!;
        return {
          projectId,
          environmentInstanceId: environmentInstanceId!,
          readAt: NOW.toISOString(),
          partial: false,
          services: [
            {
              bindingId: record.id,
              serviceRef: record.serviceRef,
              scope: 'system',
              state: 'running',
              readiness: 'unknown',
              start: { status, reason: 'Authorization status: ' + status },
              stop: { status: 'unsupported', reason: 'System scope is read-only.' },
              restart: { status: 'unsupported', reason: 'No restart plan.' },
              executable: false,
            },
          ],
        };
      },
    },
  });
  f.bind('loto', dbRef, 'required');
  const first = await f.planner.preview('loto', 'start');
  assert.equal(first.nodes[0]?.systemdCapability?.status, 'permission-required');
  assert.equal(first.executable, false);
  const same = await f.planner.preview('loto', 'start', undefined, first.planHash);
  assert.equal(same.planHash, first.planHash);
  assert.equal(inspections, 2);
  status = 'unsupported';
  await assert.rejects(
    f.planner.preview('loto', 'start', undefined, first.planHash),
    /Lifecycle plan changed/,
  );
  const changed = await f.planner.preview('loto', 'start');
  assert.equal(changed.nodes[0]?.systemdCapability?.status, 'unsupported');
  assert.notEqual(changed.planHash, first.planHash);
  assert.equal(changed.executable, false);
  const stop = await f.planner.preview('loto', 'stop');
  assert.equal(stop.nodes[0]?.systemdCapability?.reason, 'System scope is read-only.');
});

test('systemd capability failure, wrong target and duplicate identities fail closed', async () => {
  let kind: 'throw' | 'wrong-target' | 'duplicate' | 'supported' = 'throw';
  const f = fixture({
    systemdCapabilities: {
      inspect: async (projectId, environmentInstanceId) => {
        const record = f.store.byProject(projectId)[0]!;
        if (kind === 'throw') throw new Error('secret path /home/private');
        const item = {
          bindingId: record.id,
          serviceRef: record.serviceRef,
          scope: 'system' as const,
          state: 'running' as const,
          readiness: 'unknown' as const,
          start: {
            status: kind === 'supported' ? 'supported' as const : 'unsupported' as const,
            reason: 'Untrusted source',
          },
          stop: { status: 'unsupported' as const, reason: 'Read-only' },
          restart: { status: 'unsupported' as const, reason: 'Read-only' },
          executable: false as const,
        };
        return {
          projectId: kind === 'wrong-target' ? 'foreign' : projectId,
          environmentInstanceId: environmentInstanceId!,
          readAt: NOW.toISOString(),
          partial: false,
          services: kind === 'duplicate' ? [item, item] : [item],
        };
      },
    },
  });
  f.bind('loto', dbRef, 'required');
  for (const state of ['throw', 'wrong-target', 'duplicate', 'supported'] as const) {
    kind = state;
    const preview = await f.planner.preview('loto', 'start');
    assert.equal(preview.nodes[0]?.systemdCapability?.status, 'unknown');
    assert.doesNotMatch(JSON.stringify(preview), /secret path|private|Untrusted source/);
    assert.equal(preview.executable, false);
  }
});

test('Compose-only plans do not invoke systemd capability reader', async () => {
  const f = fixture({
    systemdCapabilities: {
      inspect: async () => {
        throw new Error('Should not be called for Compose-only plans');
      },
    },
  });
  f.bind('loto', apiRef, 'owned');
  const result = await f.planner.preview('loto', 'start');
  assert.equal(result.nodes[0]?.systemdCapability, undefined);
  assert.equal(result.executable, false);
});
