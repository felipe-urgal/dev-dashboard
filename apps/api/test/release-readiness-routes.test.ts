import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import type { Project } from '@dev-dashboard/contracts';

import { registerApiErrorHandling } from '../src/http/api-error.js';
import { releaseReadinessRoutes } from '../src/routes/release-readiness.js';
import type {
  ReleaseReadinessSnapshot,
  ReleaseReadinessState,
} from '../src/services/release-readiness.js';
import { ProjectStore } from '../src/store/project-store.js';

const GENERATED_AT = '2026-09-06T12:00:00.000Z';

function project(id: string): Project {
  return {
    id,
    name: id,
    path: `/workspace/${id}`,
    type: 'node',
    source: 'workspace',
    workspaceId: 'workspace-1',
    enabled: true,
    capabilities: ['git', 'tests'],
  };
}

function snapshot(state: ReleaseReadinessState): ReleaseReadinessSnapshot {
  return {
    state,
    generatedAt: GENERATED_AT,
    checks: [
      {
        id: 'git',
        state,
        summary: `Git ${state}`,
        evidence: `evidence-${state}`,
        observedAt: GENERATED_AT,
        action: { label: 'Abrir Sincronização', target: 'synchronization' },
      },
    ],
  };
}

test('Release Readiness HTTP expõe contrato, freshness bounded e erros determinísticos', async (context) => {
  const projectStore = new ProjectStore();
  const projects = (['pass', 'warning', 'block', 'unknown'] as const).map(
    (state) => project(`project-${state}`),
  );
  projectStore.saveWorkspaceScan({
    workspaceId: 'workspace-1',
    workspacePath: '/workspace',
    projects,
    warnings: [],
  });

  const calls: Array<{ projectId: string; testMaxAgeMs: number }> = [];
  const service = {
    getSnapshot: async (
      selectedProject: Project,
      options: { testMaxAgeMs: number },
    ) => {
      calls.push({
        projectId: selectedProject.id,
        testMaxAgeMs: options.testMaxAgeMs,
      });
      const state = selectedProject.id.replace(
        'project-',
        '',
      ) as ReleaseReadinessState;
      return snapshot(state);
    },
  };

  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(releaseReadinessRoutes, {
    prefix: '/api',
    projectStore,
    releaseReadinessService: service,
  });
  context.after(() => app.close());

  for (const state of ['pass', 'warning', 'block', 'unknown'] as const) {
    await context.test(`serializa estado ${state}`, async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/projects/project-${state}/release-readiness`,
      });
      assert.equal(response.statusCode, 200);
      const body = response.json<{ readiness: ReleaseReadinessSnapshot }>();
      assert.equal(body.readiness.state, state);
      assert.equal(body.readiness.checks[0]?.state, state);
      assert.equal(body.readiness.checks[0]?.action.target, 'synchronization');
    });
  }

  assert.equal(calls[0]?.testMaxAgeMs, 30 * 60 * 1_000);

  const customFreshness = await app.inject({
    method: 'GET',
    url: '/api/projects/project-pass/release-readiness?testMaxAgeSeconds=60',
  });
  assert.equal(customFreshness.statusCode, 200);
  assert.equal(calls.at(-1)?.testMaxAgeMs, 60_000);

  for (const invalidValue of ['0', '59', '86401', 'abc']) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/project-pass/release-readiness?testMaxAgeSeconds=${invalidValue}`,
    });
    assert.equal(response.statusCode, 400);
  }

  const missing = await app.inject({
    method: 'GET',
    url: '/api/projects/missing/release-readiness',
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json<{ error: string }>().error, 'PROJECT_NOT_FOUND');
});
