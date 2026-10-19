import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type {
  Project, ProjectServiceBindingView, ServiceCatalogSnapshot,
} from '@dev-dashboard/contracts';

import { buildApp } from '../src/app.js';
import { createAppContext } from '../src/app-context.js';
import { ProjectServiceBindingStore } from '../src/store/project-service-binding-store.js';

const TOKEN = 'b'.repeat(64);
const HOST_REF = 'systemd:system:postgresql.service';
const NOW = '2026-10-19T15:00:00.000Z';

test('HTTP enforces token, versioned mutations and shared consumers without lifecycle', async (context) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'project-service-route-'));
  const appContext = createAppContext();
  appContext.projectServiceBindingStore = new ProjectServiceBindingStore({
    stateDirectory: directory,
  });
  const projects: Project[] = ['loto', 'gastos'].map((id) => ({
    id, name: id, path: '/tmp/' + id, source: 'workspace',
    workspaceId: 'test', type: 'node', enabled: true, capabilities: [],
  }));
  appContext.projectStore.saveWorkspaceScan({
    workspaceId: 'test', workspacePath: '/tmp', projects, warnings: [],
  });
  const snapshot: ServiceCatalogSnapshot = {
    status: 'ready', observedAt: NOW, truncated: false,
    ports: [], providers: [],
    entries: [{
      id: HOST_REF, provider: 'systemd', name: 'postgresql.service',
      state: 'running', readiness: 'unknown', ownership: 'unmanaged',
      scope: 'system', ports: [], observedAt: NOW,
    }],
  };
  const app = await buildApp({
    context: appContext, localToken: TOKEN,
    serviceCatalog: { inspect: async () => snapshot },
  });
  context.after(async () => {
    await app.close(); rmSync(directory, { recursive: true, force: true });
  });

  const denied = await app.inject({
    method: 'GET', url: '/api/projects/loto/service-bindings',
  });
  assert.equal(denied.statusCode, 401);
  const headers = {
    'x-dev-dashboard-token': TOKEN, 'content-type': 'application/json',
  };
  const get = (url: string) => app.inject({ method: 'GET', url, headers });
  const listed = await get('/api/projects/loto/service-bindings');
  assert.equal(listed.statusCode, 200);
  const initialRevision = listed.json<{ revision: string }>().revision;
  assert.match(initialRevision, /^[a-f0-9]{64}$/);

  const preview = await get('/api/projects/loto/service-bindings/preview');
  assert.equal(preview.statusCode, 200);
  assert.equal(preview.json<{ candidates: Array<{linkableAsOwned: boolean}> }>()
    .candidates[0]?.linkableAsOwned, false);

  const createBody = {
    expectedRevision: initialRevision,
    serviceRef: HOST_REF,
    relation: 'required',
    requiredForStart: true,
    enabled: true,
    dependencies: [],
  };
  const deniedOwnership = await app.inject({
    method: 'POST', url: '/api/projects/loto/service-bindings', headers,
    payload: { ...createBody, relation: 'owned' },
  });
  assert.equal(deniedOwnership.statusCode, 409);

  const created = await app.inject({
    method: 'POST', url: '/api/projects/loto/service-bindings', headers,
    payload: createBody,
  });
  assert.equal(created.statusCode, 200);
  const info = created.json<{ binding: ProjectServiceBindingView; revision: string }>();
  assert.equal(info.binding.serviceRef, HOST_REF);
  assert.notEqual(info.revision, initialRevision);
  const stale = await app.inject({
    method: 'POST', url: '/api/projects/loto/service-bindings', headers,
    payload: createBody,
  });
  assert.equal(stale.statusCode, 409);

  const otherRevision = (await get('/api/projects/gastos/service-bindings'))
    .json<{revision:string}>().revision;
  const other = await app.inject({
    method: 'POST', url: '/api/projects/gastos/service-bindings', headers,
    payload: { ...createBody, expectedRevision: otherRevision },
  });
  assert.equal(other.statusCode, 200);
  const consumers = await get('/api/services/bindings/consumers?serviceRef=' +
    encodeURIComponent(HOST_REF));
  assert.equal(consumers.statusCode, 200);
  assert.equal(consumers.json<{bindings:ProjectServiceBindingView[]}>()
    .bindings.every((b) => b.shared && b.consumerCount === 2), true);

  const deleteResult = await app.inject({
    method: 'DELETE',
    url: '/api/projects/loto/service-bindings/' + info.binding.id +
      '?expectedRevision=' + info.revision,
    headers,
  });
  assert.equal(deleteResult.statusCode, 200);
  const missing = await get('/api/projects/unknown/service-bindings');
  assert.equal(missing.statusCode, 404);
  const arbitrary = await app.inject({
    method: 'POST', url: '/api/projects/loto/service-bindings', headers,
    payload: { ...createBody, expectedRevision: info.revision,
      serviceRef: 'systemd:system:nonexistent.service' },
  });
  assert.equal(arbitrary.statusCode, 409);
});
