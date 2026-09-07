import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import type { Project } from '@dev-dashboard/contracts';

import { registerApiErrorHandling } from '../src/http/api-error.js';
import { migrationRoutes } from '../src/routes/migrations.js';
import type { MigrationOverview } from '../src/services/migration-provider.js';
import { ProjectStore } from '../src/store/project-store.js';

const OBSERVED_AT = '2026-09-07T16:00:00.000Z';

function project(): Project {
  return {
    id: 'project-1',
    name: 'Projeto',
    path: '/workspace/projeto',
    type: 'node',
    source: 'workspace',
    workspaceId: 'workspace-1',
    enabled: true,
    capabilities: ['database'],
  };
}

function overview(database: string): MigrationOverview {
  return {
    provider: 'fixture',
    status: 'pending',
    database,
    applied: [{ id: '001', name: 'Create users' }],
    pending: [{ id: '002', name: 'Add index' }],
    observedAt: OBSERVED_AT,
    evidence: 'fixture status',
    warnings: ['warning'],
  };
}

test('Migrations HTTP expõe contrato comum, database validado e erros determinísticos', async (context) => {
  const projectStore = new ProjectStore();
  projectStore.saveWorkspaceScan({
    workspaceId: 'workspace-1',
    workspacePath: '/workspace',
    projects: [project()],
    warnings: [],
  });

  const calls: Array<{ projectId: string; database: string | undefined }> = [];
  const service = {
    inspect: async (selectedProject: Project, database?: string) => {
      calls.push({ projectId: selectedProject.id, database });
      return overview(database ?? 'primary');
    },
  };

  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(migrationRoutes, {
    prefix: '/api',
    projectStore,
    migrationOverviewService: service,
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/migrations?database=analytics_2',
  });
  assert.equal(response.statusCode, 200);
  const body = response.json<{ migration: MigrationOverview }>();
  assert.equal(body.migration.status, 'pending');
  assert.equal(body.migration.provider, 'fixture');
  assert.equal(body.migration.database, 'analytics_2');
  assert.equal(body.migration.pending[0]?.id, '002');
  assert.deepEqual(calls, [
    { projectId: 'project-1', database: 'analytics_2' },
  ]);

  for (const invalidDatabase of [
    '../primary',
    'primary.db',
    '-primary',
    'a'.repeat(129),
  ]) {
    const invalid = await app.inject({
      method: 'GET',
      url: `/api/projects/project-1/migrations?database=${encodeURIComponent(invalidDatabase)}`,
    });
    assert.equal(invalid.statusCode, 400);
  }
  assert.equal(calls.length, 1);

  const missing = await app.inject({
    method: 'GET',
    url: '/api/projects/missing/migrations',
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json<{ error: string }>().error, 'PROJECT_NOT_FOUND');
});
