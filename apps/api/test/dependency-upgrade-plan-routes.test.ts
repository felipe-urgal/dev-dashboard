import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import type { Project } from '@dev-dashboard/contracts';

import { registerApiErrorHandling } from '../src/http/api-error.js';
import { dependencyUpgradePlanRoutes } from '../src/routes/dependency-upgrade-plan.js';
import type { ProjectDependencyUpgradePlan } from '../src/services/project-dependency-upgrade-plan-service.js';
import { ProjectStore } from '../src/store/project-store.js';

const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/project-1',
  type: 'node',
  source: 'workspace',
  workspaceId: 'workspace-1',
  enabled: true,
  capabilities: [],
};

const plan: ProjectDependencyUpgradePlan = {
  generatedAt: '2026-09-19T18:10:00.000Z',
  projectId: project.id,
  packageManager: 'npm',
  status: 'ready',
  items: [
    {
      name: 'fastify',
      kind: 'dependency',
      declaredRange: '^5.0.0',
      state: 'upgrade',
      update: 'major',
      currentVersion: '5.6.0',
      targetVersion: '6.0.0',
      affectedFiles: ['package.json', 'package-lock.json'],
      warnings: [
        'A atualização é major e pode conter breaking changes; o planner não afirma compatibilidade de API.',
      ],
      gates: ['review-major-change', 'verify-target-advisories', 'run-tests'],
    },
  ],
  groups: [
    {
      id: 'root-package-manifest',
      basis: 'shared-manifest',
      dependencies: ['fastify'],
      affectedFiles: ['package.json', 'package-lock.json'],
      lockstep: 'unknown',
    },
  ],
  warnings: [],
};

test('Upgrade Planner HTTP seleciona projeto no backend e retorna 404 determinístico', async (context) => {
  const projectStore = new ProjectStore();
  projectStore.saveWorkspaceScan({
    workspaceId: 'workspace-1',
    workspacePath: '/workspace',
    projects: [project],
    warnings: [],
  });

  const calls: string[] = [];
  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(dependencyUpgradePlanRoutes, {
    prefix: '/api',
    projectStore,
    dependencyUpgradePlanService: {
      inspect: async (selectedProject) => {
        calls.push(selectedProject.id);
        return plan;
      },
    },
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/dependency-upgrade-plan',
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { plan });
  assert.deepEqual(calls, ['project-1']);

  const missing = await app.inject({
    method: 'GET',
    url: '/api/projects/missing/dependency-upgrade-plan',
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json<{ error: string }>().error, 'PROJECT_NOT_FOUND');
  assert.deepEqual(calls, ['project-1']);
});

test('Upgrade Planner response schema remove campos não públicos', async (context) => {
  const projectStore = new ProjectStore();
  projectStore.saveWorkspaceScan({
    workspaceId: 'workspace-1',
    workspacePath: '/workspace',
    projects: [project],
    warnings: [],
  });

  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(dependencyUpgradePlanRoutes, {
    prefix: '/api',
    projectStore,
    dependencyUpgradePlanService: {
      inspect: async () =>
        ({
          ...plan,
          internalSecret: 'não pode sair',
          items: [
            {
              ...plan.items[0]!,
              internalSecret: 'não pode sair',
            },
          ],
          groups: [
            {
              ...plan.groups[0]!,
              internalSecret: 'não pode sair',
            },
          ],
        }) as ProjectDependencyUpgradePlan,
    },
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/dependency-upgrade-plan',
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { plan });
});
