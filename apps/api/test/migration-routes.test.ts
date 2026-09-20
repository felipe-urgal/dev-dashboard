import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import type { Project } from '@dev-dashboard/contracts';

import { registerApiErrorHandling } from '../src/http/api-error.js';
import { migrationRoutes } from '../src/routes/migrations.js';
import type { MigrationMutationPlan } from '../src/services/migration-mutation-provider.js';
import type { MigrationOverview } from '../src/services/migration-provider.js';
import { ProjectStore } from '../src/store/project-store.js';

const OBSERVED_AT = '2026-09-07T16:00:00.000Z';
const PLAN_HASH = 'a'.repeat(64);
const ENVIRONMENT_ID = 'environment:primary:project-1';

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

function mutationPlan(overrides: Partial<MigrationMutationPlan> = {}): MigrationMutationPlan {
  return {
    projectId: 'project-1',
    provider: 'rails',
    operation: 'apply',
    database: 'primary',
    environmentInstanceId: ENVIRONMENT_ID,
    runtime: 'host',
    executionContextHash: 'b'.repeat(64),
    overviewHash: 'c'.repeat(64),
    createdAt: '2026-09-20T10:00:00.000Z',
    overviewObservedAt: OBSERVED_AT,
    planHash: PLAN_HASH,
    preflight: {
      state: 'ready',
      reason: 'ready',
      observedAt: OBSERVED_AT,
      evidence: 'Rails db:migrate:status',
    },
    command: {
      file: '/workspace/projeto/bin/rails',
      args: ['db:migrate'],
    },
    ...overrides,
  };
}

function projectStore(): ProjectStore {
  const store = new ProjectStore();
  store.saveWorkspaceScan({
    workspaceId: 'workspace-1',
    workspacePath: '/workspace',
    projects: [project()],
    warnings: [],
  });
  return store;
}

function baseMutationOptions(plan = mutationPlan()) {
  return {
    migrationMutationPlanningService: {
      plan: async () => plan,
    },
    migrationMutationConfirmationService: {
      prepare: () => ({
        token: 'confirmation-token',
        projectId: plan.projectId,
        environmentInstanceId: plan.environmentInstanceId,
        provider: plan.provider,
        operation: plan.operation,
        planHash: plan.planHash,
        expiresAt: '2026-09-20T10:01:00.000Z',
      }),
    },
    migrationMutationExecutionService: {
      start: async () => ({
        provider: plan.provider,
        operation: plan.operation,
        database: plan.database,
        environmentInstanceId: plan.environmentInstanceId,
        planHash: plan.planHash,
        status: 'running' as const,
        buffer: '',
        truncated: false,
        exitCode: null,
        exitSignal: null,
        startedAt: '2026-09-20T10:00:05.000Z',
        endedAt: null,
      }),
      snapshot: () => undefined,
      attach: () => {
        throw new Error('não usado');
      },
      cancel: () => undefined,
    },
  };
}

test('Migrations HTTP expõe contrato comum, database validado e erros determinísticos', async (context) => {
  const store = projectStore();

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
    projectStore: store,
    migrationOverviewService: service,
    ...baseMutationOptions(),
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

test('mutation HTTP mantém comando/contexto privados e exige o planHash observado antes da confirmação', async (context) => {
  const store = projectStore();
  const plan = mutationPlan();
  const started: Array<{ token: string | undefined; database?: string }> = [];
  let cancelledEnvironment = '';

  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(migrationRoutes, {
    prefix: '/api',
    projectStore: store,
    migrationOverviewService: {
      inspect: async () => overview('primary'),
    },
    migrationMutationPlanningService: {
      plan: async () => plan,
    },
    migrationMutationConfirmationService: {
      prepare: () => ({
        token: 'confirmation-token',
        projectId: plan.projectId,
        environmentInstanceId: plan.environmentInstanceId,
        provider: plan.provider,
        operation: plan.operation,
        planHash: plan.planHash,
        expiresAt: '2026-09-20T10:01:00.000Z',
      }),
    },
    migrationMutationExecutionService: {
      start: async (_project, input, token) => {
        started.push({ token, database: input.database });
        return {
          provider: plan.provider,
          operation: plan.operation,
          database: plan.database,
          environmentInstanceId: plan.environmentInstanceId,
          planHash: plan.planHash,
          status: 'running',
          buffer: '',
          truncated: false,
          exitCode: null,
          exitSignal: null,
          startedAt: '2026-09-20T10:00:05.000Z',
          endedAt: null,
        };
      },
      snapshot: (_projectId, environmentInstanceId) =>
        environmentInstanceId === ENVIRONMENT_ID
          ? {
              provider: plan.provider,
              operation: plan.operation,
              database: plan.database,
              environmentInstanceId: plan.environmentInstanceId,
              planHash: plan.planHash,
              status: 'running',
              buffer: 'Migrating...',
              truncated: false,
              exitCode: null,
              exitSignal: null,
              startedAt: '2026-09-20T10:00:05.000Z',
              endedAt: null,
            }
          : undefined,
      attach: () => {
        throw new Error('não usado');
      },
      cancel: (_projectId, environmentInstanceId) => {
        cancelledEnvironment = environmentInstanceId;
      },
    },
  });
  context.after(() => app.close());

  const planned = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/migrations/mutations/plan',
    payload: { operation: 'apply', database: 'primary' },
  });
  assert.equal(planned.statusCode, 200);
  const publicPlan = planned.json<{ plan: Record<string, unknown> }>().plan;
  assert.equal(publicPlan.planHash, PLAN_HASH);
  assert.equal(publicPlan.environmentInstanceId, ENVIRONMENT_ID);
  assert.equal('command' in publicPlan, false);
  assert.equal('executionContextHash' in publicPlan, false);
  assert.equal('overviewHash' in publicPlan, false);

  const stale = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/migrations/mutations/confirmation',
    payload: {
      operation: 'apply',
      database: 'primary',
      environmentInstanceId: ENVIRONMENT_ID,
      planHash: 'd'.repeat(64),
    },
  });
  assert.equal(stale.statusCode, 409);
  assert.equal(
    stale.json<{ error: string }>().error,
    'MIGRATION_MUTATION_PLAN_CHANGED',
  );

  const confirmed = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/migrations/mutations/confirmation',
    payload: {
      operation: 'apply',
      database: 'primary',
      environmentInstanceId: ENVIRONMENT_ID,
      planHash: PLAN_HASH,
    },
  });
  assert.equal(confirmed.statusCode, 201);
  assert.equal(
    confirmed.json<{ confirmation: { token: string } }>().confirmation.token,
    'confirmation-token',
  );

  const startedResponse = await app.inject({
    method: 'POST',
    url: '/api/projects/project-1/migrations/mutations/start',
    payload: {
      operation: 'apply',
      database: 'primary',
      environmentInstanceId: ENVIRONMENT_ID,
      confirmationToken: 'confirmation-token',
    },
  });
  assert.equal(startedResponse.statusCode, 201);
  assert.deepEqual(started, [
    { token: 'confirmation-token', database: 'primary' },
  ]);

  const status = await app.inject({
    method: 'GET',
    url: `/api/projects/project-1/migrations/mutations/status?environmentInstanceId=${encodeURIComponent(ENVIRONMENT_ID)}`,
  });
  assert.equal(status.statusCode, 200);
  assert.equal(
    status.json<{ snapshot: { buffer: string } }>().snapshot.buffer,
    'Migrating...',
  );

  const cancelled = await app.inject({
    method: 'POST',
    url: `/api/projects/project-1/migrations/mutations/cancel?environmentInstanceId=${encodeURIComponent(ENVIRONMENT_ID)}`,
    payload: {},
  });
  assert.equal(cancelled.statusCode, 200);
  assert.equal(cancelledEnvironment, ENVIRONMENT_ID);
});
