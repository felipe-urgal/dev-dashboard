import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type {
  Project,
  ProjectServiceBinding,
  ServiceCatalogEntry,
  ServiceCatalogSnapshot,
  ServiceLifecyclePlan,
  ServiceRuntimeProfileView,
} from '@dev-dashboard/contracts';

import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';
import { worktreeEnvironmentInstanceId } from '../src/store/development-environment-instance-store.js';
import { ProjectServiceBindingStore } from '../src/store/project-service-binding-store.js';
import { ServiceRuntimeProfileStore } from '../src/store/service-runtime-profile-store.js';

const TOKEN = 'f'.repeat(64);
const HEADERS = { 'x-dev-dashboard-token': TOKEN };
const WRITE_HEADERS = { ...HEADERS, 'content-type': 'application/json' };
const NOW = new Date('2026-10-20T18:00:00.000Z');
const GASTOS = 'gastos';
const LOTO = 'loto';
const PRIMARY = 'environment:primary:gastos';
const WORKTREE = worktreeEnvironmentInstanceId(GASTOS, 'qa-1');
const LOTO_ENV = 'environment:primary:loto';
const TEST_DB = 'compose:gastos:test-db';
const TEST_API = 'compose:gastos:test-api';
const PROD_DB = 'compose:gastos:production-db';
const WORKTREE_DB = 'compose:gastos-worktree:test-db';
const SHARED_CACHE = 'compose:gastos:shared-cache';
const LOTO_API = 'compose:loto:api';

function project(id: string): Project {
  return {
    id,
    name: id === GASTOS ? 'Controle Gastos' : 'Loto Lab',
    workspaceId: 'local-test',
    path: '/tmp/' + id,
    source: 'workspace',
    type: 'node',
    enabled: true,
    capabilities: [],
  };
}

function entry(
  id: string,
  projectId: string,
  environmentInstanceId: string,
  state: 'running' | 'stopped',
  port: number,
): ServiceCatalogEntry {
  return {
    id,
    name: id,
    projectId,
    environmentInstanceId,
    provider: 'compose',
    scope: 'environment',
    ownership: 'confirmed',
    state,
    readiness: state === 'running' ? 'ready' : 'unknown',
    ports: [port],
    observedAt: NOW.toISOString(),
  };
}

function profileUrl(projectId: string, env: string): string {
  return (
    '/api/projects/' +
    encodeURIComponent(projectId) +
    '/environments/' +
    encodeURIComponent(env) +
    '/service-profiles'
  );
}

function planUrl(
  projectId: string,
  env: string,
  action: 'start' | 'stop',
  profileId?: string,
  expectedPlanHash?: string,
): string {
  const params = new URLSearchParams({
    action,
    environmentInstanceId: env,
  });
  if (profileId) params.set('profileId', profileId);
  if (expectedPlanHash) params.set('expectedPlanHash', expectedPlanHash);
  return (
    '/api/projects/' + encodeURIComponent(projectId) + '/service-plan?' + params
  );
}

interface ProfileList {
  revision: string;
  bindingsRevision: string;
  fallback: boolean;
  profiles: ServiceRuntimeProfileView[];
}

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const stateDirectory = mkdtempSync(
    path.join(os.tmpdir(), 'service-profiles-isolation-'),
  );
  const context = createAppContext();
  context.projectServiceBindingStore = new ProjectServiceBindingStore({
    stateDirectory,
  });
  context.serviceRuntimeProfileStore = new ServiceRuntimeProfileStore({
    stateDirectory,
  });
  context.projectStore.saveWorkspaceScan({
    workspaceId: 'local-test',
    workspacePath: '/tmp',
    projects: [project(GASTOS), project(LOTO)],
    warnings: [],
  });
  context.developmentEnvironmentInstanceStore.reconcileWorktrees(GASTOS, [
    {
      id: 'qa-1',
      kind: 'linked',
      path: '/tmp/gastos-qa-1',
    },
  ]);
  assert.equal(
    context.developmentEnvironmentInstanceStore.findById(WORKTREE)?.source.kind,
    'worktree',
  );

  const entries: ServiceCatalogEntry[] = [
    entry(TEST_DB, GASTOS, PRIMARY, 'stopped', 5544),
    entry(TEST_API, GASTOS, PRIMARY, 'stopped', 4001),
    entry(PROD_DB, GASTOS, PRIMARY, 'running', 5432),
    entry(WORKTREE_DB, GASTOS, WORKTREE, 'stopped', 5545),
    entry(SHARED_CACHE, GASTOS, PRIMARY, 'running', 6380),
    entry(LOTO_API, LOTO, LOTO_ENV, 'running', 4200),
  ];
  const catalog: ServiceCatalogSnapshot = {
    status: 'ready',
    observedAt: NOW.toISOString(),
    truncated: false,
    entries,
    ports: [],
    providers: [
      { provider: 'compose', status: 'ready' },
      { provider: 'ports', status: 'ready' },
    ],
  };
  let inspections = 0;
  const saveBinding = (
    projectId: string,
    environmentInstanceId: string,
    serviceRef: string,
    relation: 'owned' | 'required' = 'owned',
    dependencies: string[] = [],
  ): ProjectServiceBinding =>
    context.projectServiceBindingStore.save(
      projectId,
      {
        environmentInstanceId,
        serviceRef,
        ...(serviceRef.includes('db') ? { role: 'database' } : {}),
        relation,
        enabled: true,
        requiredForStart: true,
        dependencies: dependencies.map((serviceRef) => ({
          serviceRef,
          source: 'manual' as const,
        })),
      },
      context.projectServiceBindingStore.revision(projectId),
      NOW,
    );
  const testDb = saveBinding(GASTOS, PRIMARY, TEST_DB);
  const testApi = saveBinding(GASTOS, PRIMARY, TEST_API, 'owned', [TEST_DB]);
  const prodDb = saveBinding(GASTOS, PRIMARY, PROD_DB);
  const worktreeDb = saveBinding(GASTOS, WORKTREE, WORKTREE_DB);
  const cache = saveBinding(GASTOS, PRIMARY, SHARED_CACHE);
  const lotoCache = saveBinding(LOTO, LOTO_ENV, SHARED_CACHE, 'required');
  const lotoApi = saveBinding(LOTO, LOTO_ENV, LOTO_API, 'owned', [
    SHARED_CACHE,
  ]);

  const app = await buildApp({
    context,
    localToken: TOKEN,
    serviceCatalog: {
      inspect: async () => {
        inspections++;
        return catalog;
      },
    },
  });
  t.after(async () => {
    await app.close();
    rmSync(stateDirectory, { recursive: true, force: true });
  });

  const get = (url: string) =>
    app.inject({ method: 'GET', url, headers: HEADERS });
  const list = async (projectId: string, env: string): Promise<ProfileList> => {
    const response = await get(profileUrl(projectId, env));
    assert.equal(response.statusCode, 200, response.body);
    return response.json<ProfileList>();
  };
  const create = async (
    projectId: string,
    env: string,
    kind: 'dev' | 'test' | 'production',
    bindingIds: string[],
  ): Promise<ServiceRuntimeProfileView> => {
    const current = await list(projectId, env);
    const response = await app.inject({
      method: 'POST',
      url: profileUrl(projectId, env),
      headers: WRITE_HEADERS,
      payload: {
        kind,
        bindingIds,
        expectedRevision: current.revision,
        expectedBindingsRevision: current.bindingsRevision,
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json<{ profile: ServiceRuntimeProfileView }>().profile;
  };
  const plan = async (
    projectId: string,
    env: string,
    action: 'start' | 'stop',
    profileId?: string,
  ): Promise<ServiceLifecyclePlan> => {
    const response = await get(planUrl(projectId, env, action, profileId));
    assert.equal(response.statusCode, 200, response.body);
    return response.json<ServiceLifecyclePlan>();
  };

  return {
    app,
    context,
    stateDirectory,
    catalog,
    entries,
    get,
    list,
    create,
    plan,
    get inspections() {
      return inspections;
    },
    bindings: {
      testDb,
      testApi,
      prodDb,
      worktreeDb,
      cache,
      lotoCache,
      lotoApi,
    },
  };
}

test('HTTP qualification: test, production, worktree and shared Loto runtime remain isolated', async (t) => {
  const f = await fixture(t);
  const initialLoto = await f.list(LOTO, LOTO_ENV);
  assert.equal(
    initialLoto.fallback,
    true,
    'Loto without profiles keeps legacy behavior',
  );
  assert.equal((await f.list(GASTOS, PRIMARY)).fallback, true);
  assert.equal((await f.list(GASTOS, WORKTREE)).fallback, true);
  assert.equal(
    f.inspections,
    0,
    'profiles CRUD must not inspect or operate runtimes',
  );

  const testProfile = await f.create(GASTOS, PRIMARY, 'test', [
    f.bindings.testDb.id,
    f.bindings.testApi.id,
  ]);
  const prodProfile = await f.create(GASTOS, PRIMARY, 'production', [
    f.bindings.prodDb.id,
  ]);
  const worktreeProfile = await f.create(GASTOS, WORKTREE, 'test', [
    f.bindings.worktreeDb.id,
  ]);
  const devProfile = await f.create(GASTOS, PRIMARY, 'dev', [
    f.bindings.cache.id,
  ]);
  assert.notEqual(testProfile.id, worktreeProfile.id);
  assert.equal(f.inspections, 0);

  const originalEvidence = structuredClone(f.catalog);
  const testStart = await f.plan(GASTOS, PRIMARY, 'start', testProfile.id);
  assert.deepEqual(testStart.order, [TEST_DB, TEST_API]);
  assert.deepEqual(
    testStart.nodes.map((node) => node.disposition),
    ['willStart', 'willStart'],
  );
  assert.equal(testStart.nodes[0]?.ports[0], 5544);
  assert.equal(testStart.profile?.kind, 'test');
  assert.equal(testStart.executable, false);
  assert.equal(
    testStart.nodes.some((node) => node.serviceRef === PROD_DB),
    false,
  );

  const productionStart = await f.plan(
    GASTOS,
    PRIMARY,
    'start',
    prodProfile.id,
  );
  assert.deepEqual(productionStart.order, [PROD_DB]);
  assert.equal(productionStart.nodes[0]?.ports[0], 5432);
  assert.equal(productionStart.nodes[0]?.disposition, 'alreadyReady');
  assert.equal(productionStart.profile?.kind, 'production');
  assert.equal(productionStart.executable, false);
  assert.notEqual(testStart.planHash, productionStart.planHash);
  const productionStop = await f.plan(GASTOS, PRIMARY, 'stop', prodProfile.id);
  assert.equal(
    productionStop.executable,
    false,
    'production preview cannot stop DB',
  );
  assert.equal(
    f.catalog.entries.find((item) => item.id === PROD_DB)?.state,
    'running',
  );

  const worktreeStart = await f.plan(
    GASTOS,
    WORKTREE,
    'start',
    worktreeProfile.id,
  );
  assert.deepEqual(worktreeStart.order, [WORKTREE_DB]);
  assert.equal(worktreeStart.nodes[0]?.ports[0], 5545);
  assert.equal(worktreeStart.target.environmentInstanceId, WORKTREE);
  assert.equal(worktreeStart.executable, false);
  assert.equal(
    worktreeStart.nodes.some((node) => node.serviceRef === TEST_DB),
    false,
  );

  const devStop = await f.plan(GASTOS, PRIMARY, 'stop', devProfile.id);
  assert.deepEqual(devStop.order, [SHARED_CACHE]);
  assert.equal(devStop.nodes[0]?.consumerCount, 2);
  assert.equal(devStop.nodes[0]?.disposition, 'retained');
  assert.match(
    devStop.nodes[0]?.diagnostic ?? '',
    /Another project or environment/,
  );
  const lotoFallback = await f.plan(LOTO, LOTO_ENV, 'stop');
  assert.deepEqual(lotoFallback.order, [LOTO_API, SHARED_CACHE]);
  assert.equal(
    lotoFallback.nodes.find((n) => n.serviceRef === SHARED_CACHE)?.disposition,
    'retained',
  );
  assert.equal((await f.list(LOTO, LOTO_ENV)).fallback, true);
  assert.equal(
    (await f.list(GASTOS, WORKTREE)).profiles.length,
    1,
    'primary profiles must not appear in worktree UI',
  );
  assert.equal(
    (await f.list(GASTOS, PRIMARY)).profiles.length,
    3,
    'worktree profiles must not appear in primary UI',
  );

  const mismatched = await f.get(
    planUrl(GASTOS, PRIMARY, 'start', testProfile.id, productionStart.planHash),
  );
  assert.equal(mismatched.statusCode, 409, mismatched.body);
  const mutation = await f.app.inject({
    method: 'POST',
    url: planUrl(GASTOS, PRIMARY, 'stop', prodProfile.id),
    headers: WRITE_HEADERS,
    payload: {},
  });
  assert.notEqual(
    mutation.statusCode,
    200,
    'preview route must not execute POST',
  );
  assert.deepEqual(
    f.catalog,
    originalEvidence,
    'no DB/stack/process state mutation',
  );
  assert.equal(
    f.context.serviceRuntimeProfileStore.byProject(GASTOS).length,
    4,
  );
  assert.equal(f.context.projectServiceBindingStore.byProject(LOTO).length, 2);

  const restoredProfiles = new ServiceRuntimeProfileStore({
    stateDirectory: f.stateDirectory,
  });
  const restoredBindings = new ProjectServiceBindingStore({
    stateDirectory: f.stateDirectory,
  });
  assert.deepEqual(
    restoredProfiles.byProject(GASTOS).map((item) => item.id),
    f.context.serviceRuntimeProfileStore
      .byProject(GASTOS)
      .map((item) => item.id),
  );
  assert.equal(restoredBindings.byProject(GASTOS).length, 5);
  assert.equal(restoredProfiles.byProject(LOTO).length, 0);
});

test('HTTP qualification: reject foreign, stale and Dev Container profile selection', async (t) => {
  const f = await fixture(t);
  const testProfile = await f.create(GASTOS, PRIMARY, 'test', [
    f.bindings.testDb.id,
  ]);
  const primary = await f.list(GASTOS, PRIMARY);
  const loto = await f.list(LOTO, LOTO_ENV);

  const forbiddenWorktreeBinding = await f.app.inject({
    method: 'POST',
    url: profileUrl(GASTOS, PRIMARY),
    headers: WRITE_HEADERS,
    payload: {
      kind: 'dev',
      bindingIds: [f.bindings.worktreeDb.id],
      expectedRevision: primary.revision,
      expectedBindingsRevision: primary.bindingsRevision,
    },
  });
  assert.equal(
    forbiddenWorktreeBinding.statusCode,
    409,
    forbiddenWorktreeBinding.body,
  );
  const forbiddenLotoBinding = await f.app.inject({
    method: 'POST',
    url: profileUrl(LOTO, LOTO_ENV),
    headers: WRITE_HEADERS,
    payload: {
      kind: 'test',
      bindingIds: [f.bindings.testDb.id],
      expectedRevision: loto.revision,
      expectedBindingsRevision: loto.bindingsRevision,
    },
  });
  assert.equal(forbiddenLotoBinding.statusCode, 409, forbiddenLotoBinding.body);
  assert.equal(
    (await f.get(planUrl(LOTO, LOTO_ENV, 'start', testProfile.id))).statusCode,
    404,
  );
  assert.equal(
    (await f.get(planUrl(GASTOS, WORKTREE, 'start', testProfile.id)))
      .statusCode,
    404,
  );
  assert.equal(
    (
      await f.get(
        planUrl(
          GASTOS,
          PRIMARY,
          'start',
          '00000000-0000-4000-8000-000000000000',
        ),
      )
    ).statusCode,
    404,
  );
  assert.equal(
    (await f.app.inject({ method: 'GET', url: profileUrl(GASTOS, PRIMARY) }))
      .statusCode,
    401,
  );

  // A binding can become stale after the profile was stored, but it must
  // never be substituted by another DB with the same descriptive role.
  f.context.projectServiceBindingStore.save(
    GASTOS,
    {
      environmentInstanceId: PRIMARY,
      serviceRef: TEST_DB,
      role: 'database',
      relation: 'owned',
      enabled: false,
      requiredForStart: true,
      dependencies: [],
    },
    f.context.projectServiceBindingStore.revision(GASTOS),
    NOW,
    f.bindings.testDb.id,
  );
  const stale = await f.list(GASTOS, PRIMARY);
  assert.deepEqual(stale.profiles[0]?.staleBindingIds, [f.bindings.testDb.id]);
  assert.equal(
    (await f.get(planUrl(GASTOS, PRIMARY, 'start', testProfile.id))).statusCode,
    409,
  );
  assert.equal(
    f.context.serviceRuntimeProfileStore.byProject(GASTOS).length,
    1,
  );
  assert.equal((await f.list(LOTO, LOTO_ENV)).fallback, true);

  // Even an observed worktree may be hosted in a Dev Container. The host
  // service planner/configuration cannot be used to control that runtime.
  const environment =
    f.context.developmentEnvironmentInstanceStore.findById(WORKTREE);
  assert.ok(environment);
  f.context.developmentEnvironmentInstanceStore.upsert({
    ...environment,
    runtime: { kind: 'devcontainer', runtimeId: 'isolated-qa-container' },
  });
  assert.equal((await f.get(profileUrl(GASTOS, WORKTREE))).statusCode, 409);
  assert.equal(
    (await f.get(planUrl(GASTOS, WORKTREE, 'stop'))).statusCode,
    409,
  );
  assert.equal(
    f.catalog.entries.find((item) => item.id === PROD_DB)?.state,
    'running',
  );
});
