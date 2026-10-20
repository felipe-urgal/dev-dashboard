import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  Project,
  ProjectServiceBindingDraft,
  ServiceCatalogEntry,
  ServiceCatalogSnapshot,
} from '@dev-dashboard/contracts';

import { ServiceLifecyclePlanningService } from '../src/services/service-lifecycle-planning-service.js';
import { ProjectServiceBindingStore } from '../src/store/project-service-binding-store.js';

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

function fixture() {
  const store = new ProjectServiceBindingStore();
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
      projects: {
        findProject: (projectId: string) =>
          projects.find((p) => p.id === projectId) ?? null,
      },
      environments: {
        findById: (id: string) => {
          const project = projects.find((p) => env(p.id) === id);
          return project
            ? {
                id,
                projectId: project.id,
                source: { kind: 'primary' as const, path: project.path },
                runtime: { kind: 'host' as const },
                lifecycle: 'ready' as const,
              }
            : null;
        },
      },
      catalog: { inspect: async () => snapshot },
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
  return { planner, store, snapshot, entries, bind };
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
