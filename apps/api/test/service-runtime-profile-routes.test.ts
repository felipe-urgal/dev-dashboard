import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project, ServiceCatalogSnapshot } from '@dev-dashboard/contracts';

import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';
import { ProjectServiceBindingStore } from '../src/store/project-service-binding-store.js';
import { ServiceRuntimeProfileStore } from '../src/store/service-runtime-profile-store.js';

const TOKEN = 'f'.repeat(64);
const NOW = new Date('2026-10-20T18:00:00.000Z');
const ENV = 'environment:primary:gastos';
const REF = 'systemd:system:postgresql.service';
const HEADERS = { 'x-dev-dashboard-token': TOKEN, 'content-type': 'application/json' };

test('profile CRUD validates binding identity, env isolation and revisions; never executes services', async (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'runtime-profile-route-'));
  const context = createAppContext();
  context.projectServiceBindingStore = new ProjectServiceBindingStore({ stateDirectory: directory });
  context.serviceRuntimeProfileStore = new ServiceRuntimeProfileStore({ stateDirectory: directory });
  const projects: Project[] = ['gastos', 'loto'].map((id) => ({
    id, name: id, path: '/tmp/' + id, source: 'workspace', workspaceId: 'w',
    type: 'node', enabled: true, capabilities: [],
  }));
  context.projectStore.saveWorkspaceScan({
    workspaceId: 'w', workspacePath: '/tmp', projects, warnings: [],
  });
  const snapshot: ServiceCatalogSnapshot = {
    status: 'ready', observedAt: NOW.toISOString(), truncated: false, ports: [],
    providers: [], entries: [
      {
        id: REF, provider: 'systemd', name: 'postgresql.service', scope: 'system',
        ownership: 'unmanaged', state: 'running', readiness: 'unknown', ports: [],
        observedAt: NOW.toISOString(),
      },
    ],
  };
  let inspections = 0;
  const app = await buildApp({
    context, localToken: TOKEN,
    serviceCatalog: { inspect: async () => { inspections++; return snapshot; } },
  });
  t.after(async () => {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const url = '/api/projects/gastos/environments/' + ENV + '/service-profiles';
  const get = (target: string) => app.inject({ method: 'GET', url: target, headers: HEADERS });
  const post = (target: string, payload: unknown) =>
    app.inject({ method: 'POST', url: target, headers: HEADERS, payload });

  assert.equal((await app.inject({ method: 'GET', url })).statusCode, 401);
  const initial = await get(url);
  assert.equal(initial.statusCode, 200);
  const first = initial.json<{ revision: string; bindingsRevision: string; fallback: boolean; profiles: unknown[] }>();
  assert.equal(first.fallback, true);
  assert.deepEqual(first.profiles, []);
  assert.equal(inspections, 0, 'profile listing cannot trigger service discovery');

  const binding = context.projectServiceBindingStore.save('gastos', {
    environmentInstanceId: ENV, serviceRef: REF, relation: 'required',
    enabled: true, requiredForStart: true, dependencies: [],
  }, first.bindingsRevision, NOW);

  const staleBindingRevision = await post(url, {
    kind: 'test', bindingIds: [binding.id],
    expectedRevision: first.revision, expectedBindingsRevision: first.bindingsRevision,
  });
  assert.equal(staleBindingRevision.statusCode, 409);

  const bindingRevision = context.projectServiceBindingStore.revision('gastos');
  const createBody = {
    kind: 'test', bindingIds: [binding.id], expectedRevision: first.revision,
    expectedBindingsRevision: bindingRevision,
  };
  const created = await post(url, createBody);
  assert.equal(created.statusCode, 200);
  const info = created.json<{ profile: { id: string; bindingIds: string[]; staleBindingIds: string[] }; revision: string }>();
  assert.deepEqual(info.profile.bindingIds, [binding.id]);
  assert.deepEqual(info.profile.staleBindingIds, []);
  assert.notEqual(info.revision, first.revision);
  assert.equal((await post(url, createBody)).statusCode, 409);

  const duplicate = await post(url, { ...createBody, expectedRevision: info.revision });
  assert.equal(duplicate.statusCode, 409);
  const otherEnv = '/api/projects/gastos/environments/environment:worktree:gastos:unknown/service-profiles';
  assert.equal((await get(otherEnv)).statusCode, 404);
  const otherProject = '/api/projects/loto/environments/environment:primary:loto/service-profiles';
  const other = await get(otherProject);
  assert.equal(other.statusCode, 200);
  assert.deepEqual(other.json<{ profiles: unknown[] }>().profiles, []);

  const foreignBinding = await post(otherProject, {
    ...createBody, expectedRevision: other.json<{ revision: string }>().revision,
    expectedBindingsRevision: context.projectServiceBindingStore.revision('loto'),
  });
  assert.equal(foreignBinding.statusCode, 409);

  const referencedDelete = await app.inject({
    method: 'DELETE',
    url: '/api/projects/gastos/service-bindings/' + binding.id + '?expectedRevision=' + bindingRevision,
    headers: { 'x-dev-dashboard-token': TOKEN },
  });
  assert.equal(referencedDelete.statusCode, 409);
  assert.equal(context.projectServiceBindingStore.byProject('gastos').length, 1);

  const selected = (await get(url)).json<{ fallback: boolean; profiles: unknown[] }>();
  assert.equal(selected.fallback, false);
  assert.equal(selected.profiles.length, 1);

  const removed = await app.inject({
    method: 'DELETE',
    url: url + '/' + info.profile.id + '?expectedRevision=' + info.revision,
    headers: { 'x-dev-dashboard-token': TOKEN },
  });
  assert.equal(removed.statusCode, 200);
  assert.equal((await get(url)).json<{ fallback: boolean }>().fallback, true);
  assert.equal(inspections, 0, 'CRUD is declarative and must not contact any runtime');
});
