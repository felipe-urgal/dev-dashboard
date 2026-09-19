import assert from 'node:assert/strict';
import test from 'node:test';

import type { ExecutionContext, Project } from '@dev-dashboard/contracts';

import type { MigrationOverview } from '../src/services/migration-provider.js';
import type { MigrationMutationProvider } from '../src/services/migration-mutation-provider.js';
import {
  MigrationMutationPlanningError,
  MigrationMutationPlanningService,
} from '../src/services/migration-mutation-planning-service.js';

const NOW = new Date('2026-09-19T18:20:00.000Z');

const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/project-1',
  type: 'rails',
  source: 'workspace',
  enabled: true,
  capabilities: [],
};

const hostContext: ExecutionContext = {
  projectId: project.id,
  environmentInstanceId: 'environment:primary:project-1',
  cwd: '/workspace/project-1-worktree',
  runtime: 'host',
};

const pendingOverview: MigrationOverview = {
  provider: 'rails',
  status: 'pending',
  database: 'primary',
  applied: [],
  pending: [{ id: '20260919000100', name: 'CreateUsers' }],
  observedAt: '2026-09-19T18:19:00.000Z',
  evidence: 'Rails db:migrate:status',
  warnings: [],
};

function provider(
  overrides: Partial<MigrationMutationProvider> = {},
): MigrationMutationProvider {
  return {
    id: 'rails',
    supports: () => true,
    inspect: async () => pendingOverview,
    planMutation: async () => ({
      command: {
        file: 'bundle',
        args: ['exec', 'rails', 'db:migrate'],
      },
    }),
    executeMutation: async () => ({
      status: 'succeeded',
      finishedAt: NOW.toISOString(),
    }),
    ...overrides,
  };
}

test('planeja mutation usando somente cwd/runtime resolvidos pelo backend e não executa o provider', async () => {
  let inspectedProjectPath: string | undefined;
  let plannedProjectPath: string | undefined;
  let executed = 0;

  const mutationProvider = provider({
    planMutation: async (context) => {
      plannedProjectPath = context.project.path;
      assert.equal(context.executionContext, hostContext);
      assert.equal(context.database, 'primary');
      assert.equal(context.overview, pendingOverview);
      return {
        command: {
          file: 'bundle',
          args: ['exec', 'rails', 'db:migrate'],
        },
      };
    },
    executeMutation: async () => {
      executed += 1;
      return { status: 'succeeded', finishedAt: NOW.toISOString() };
    },
  });

  const service = new MigrationMutationPlanningService(
    [mutationProvider],
    {
      inspect: async (selectedProject, database) => {
        inspectedProjectPath = selectedProject.path;
        assert.equal(database, 'primary');
        return pendingOverview;
      },
    },
    {
      resolveForProject: (projectId, environmentInstanceId) => {
        assert.equal(projectId, project.id);
        assert.equal(environmentInstanceId, undefined);
        return hostContext;
      },
    },
    { now: () => NOW },
  );

  const plan = await service.plan(project, { operation: 'apply' });

  assert.equal(inspectedProjectPath, hostContext.cwd);
  assert.equal(plannedProjectPath, hostContext.cwd);
  assert.equal(executed, 0);
  assert.equal(plan.projectId, project.id);
  assert.equal(plan.provider, 'rails');
  assert.equal(plan.environmentInstanceId, hostContext.environmentInstanceId);
  assert.equal(plan.runtime, 'host');
  assert.equal(plan.createdAt, NOW.toISOString());
  assert.equal(plan.overviewObservedAt, pendingOverview.observedAt);
  assert.deepEqual(plan.preflight, {
    state: 'ready',
    reason: 'ready',
    observedAt: pendingOverview.observedAt,
    evidence: pendingOverview.evidence,
  });
  assert.deepEqual(plan.command, {
    file: 'bundle',
    args: ['exec', 'rails', 'db:migrate'],
  });
  assert.match(plan.planHash, /^[a-f0-9]{64}$/u);
});

test('environment desconhecido falha antes de consultar provider ou overview', async () => {
  let calls = 0;
  const service = new MigrationMutationPlanningService(
    [
      provider({
        supports: () => {
          calls += 1;
          return true;
        },
      }),
    ],
    {
      inspect: async () => {
        calls += 1;
        return pendingOverview;
      },
    },
    {
      resolveForProject: () => null,
    },
    { now: () => NOW },
  );

  await assert.rejects(
    () =>
      service.plan(project, {
        operation: 'apply',
        environmentInstanceId: 'environment:missing',
      }),
    (error: unknown) => {
      assert.ok(error instanceof MigrationMutationPlanningError);
      assert.equal(error.code, 'MIGRATION_MUTATION_ENVIRONMENT_NOT_FOUND');
      return true;
    },
  );
  assert.equal(calls, 0);
});

test('devcontainer permanece bloqueado sem executar inspeção host', async () => {
  let calls = 0;
  const service = new MigrationMutationPlanningService(
    [
      provider({
        supports: () => {
          calls += 1;
          return true;
        },
      }),
    ],
    {
      inspect: async () => {
        calls += 1;
        return pendingOverview;
      },
    },
    {
      resolveForProject: () => ({ ...hostContext, runtime: 'devcontainer' }),
    },
    { now: () => NOW },
  );

  const plan = await service.plan(project, { operation: 'apply' });

  assert.equal(calls, 0);
  assert.equal(plan.provider, 'none');
  assert.equal(plan.preflight.state, 'blocked');
  assert.equal(plan.preflight.reason, 'runtime-unsupported');
  assert.equal(plan.command, undefined);
});

test('up-to-date bloqueia mutation sem pedir plano ao provider', async () => {
  let planCalls = 0;
  const service = new MigrationMutationPlanningService(
    [
      provider({
        planMutation: async () => {
          planCalls += 1;
          return { command: { file: 'bundle', args: [] } };
        },
      }),
    ],
    {
      inspect: async () => ({
        ...pendingOverview,
        status: 'up-to-date',
        pending: [],
      }),
    },
    {
      resolveForProject: () => hostContext,
    },
    { now: () => NOW },
  );

  const plan = await service.plan(project, { operation: 'apply' });

  assert.equal(planCalls, 0);
  assert.equal(plan.preflight.state, 'blocked');
  assert.equal(plan.preflight.reason, 'nothing-pending');
  assert.equal(plan.command, undefined);
});

test('evidência unknown/unavailable e falha da inspeção permanecem unavailable', async () => {
  for (const status of ['unknown', 'unavailable'] as const) {
    const service = new MigrationMutationPlanningService(
      [provider()],
      {
        inspect: async () => ({ ...pendingOverview, status }),
      },
      { resolveForProject: () => hostContext },
      { now: () => NOW },
    );

    const plan = await service.plan(project, { operation: 'apply' });
    assert.equal(plan.preflight.state, 'unavailable');
    assert.equal(plan.preflight.reason, 'inspection-inconclusive');
  }

  const failing = new MigrationMutationPlanningService(
    [provider()],
    {
      inspect: async () => {
        throw new Error('secret database error');
      },
    },
    { resolveForProject: () => hostContext },
    { now: () => NOW },
  );
  const failedPlan = await failing.plan(project, { operation: 'apply' });
  assert.equal(failedPlan.preflight.state, 'unavailable');
  assert.equal(failedPlan.preflight.reason, 'inspection-inconclusive');
  assert.doesNotMatch(
    failedPlan.preflight.diagnostic ?? '',
    /secret database error/u,
  );
});

test('provider de mutation precisa coincidir com a evidência read-only', async () => {
  const service = new MigrationMutationPlanningService(
    [provider()],
    {
      inspect: async () => ({ ...pendingOverview, provider: 'prisma' }),
    },
    { resolveForProject: () => hostContext },
    { now: () => NOW },
  );

  const plan = await service.plan(project, { operation: 'apply' });

  assert.equal(plan.provider, 'rails');
  assert.equal(plan.preflight.state, 'unavailable');
  assert.equal(plan.preflight.reason, 'provider-evidence-mismatch');
  assert.equal(plan.command, undefined);
});

test('shell wrapper ou plano inválido do provider falha fechado', async () => {
  const invalidShell = new MigrationMutationPlanningService(
    [
      provider({
        planMutation: async () => ({
          command: { file: '/bin/bash', args: ['-lc', 'rails db:migrate'] },
        }),
      }),
    ],
    { inspect: async () => pendingOverview },
    { resolveForProject: () => hostContext },
    { now: () => NOW },
  );

  const shellPlan = await invalidShell.plan(project, { operation: 'apply' });
  assert.equal(shellPlan.preflight.state, 'unavailable');
  assert.equal(shellPlan.preflight.reason, 'provider-plan-invalid');
  assert.equal(shellPlan.command, undefined);

  const throwing = new MigrationMutationPlanningService(
    [
      provider({
        planMutation: async () => {
          throw new Error('provider details');
        },
      }),
    ],
    { inspect: async () => pendingOverview },
    { resolveForProject: () => hostContext },
    { now: () => NOW },
  );

  const failedPlan = await throwing.plan(project, { operation: 'apply' });
  assert.equal(failedPlan.preflight.reason, 'provider-plan-invalid');
  assert.doesNotMatch(
    failedPlan.preflight.diagnostic ?? '',
    /provider details/u,
  );
});

test('ausência de provider comum produz plano unavailable sem inventar execução', async () => {
  const service = new MigrationMutationPlanningService(
    [],
    {
      inspect: async () => {
        throw new Error('não deve consultar');
      },
    },
    { resolveForProject: () => hostContext },
    { now: () => NOW },
  );

  const plan = await service.plan(project, {
    operation: 'apply',
    database: 'analytics',
  });

  assert.equal(plan.provider, 'none');
  assert.equal(plan.database, 'analytics');
  assert.equal(plan.preflight.state, 'unavailable');
  assert.equal(plan.preflight.reason, 'provider-unavailable');
  assert.equal(plan.command, undefined);
});
