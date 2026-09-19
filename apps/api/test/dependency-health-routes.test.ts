import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import type { Project } from '@dev-dashboard/contracts';

import { registerApiErrorHandling } from '../src/http/api-error.js';
import { dependencyHealthRoutes } from '../src/routes/dependency-health.js';
import type { ProjectDependencyHealthSnapshot } from '../src/services/project-dependency-health-service.js';
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

const health: ProjectDependencyHealthSnapshot = {
  generatedAt: '2026-09-19T17:45:00.000Z',
  inventory: {
    status: 'ready',
    projectId: project.id,
    packageManager: 'npm',
    observedAt: '2026-09-19T17:44:00.000Z',
    lockfile: 'present',
    lockfileVersion: 3,
    dependencies: [
      {
        name: 'fastify',
        kind: 'dependency',
        declaredRange: '^5.0.0',
        resolution: 'resolved',
        resolvedVersion: '5.6.0',
      },
    ],
    warnings: [],
  },
  runtime: {
    state: 'declared',
    observedAt: '2026-09-19T17:44:10.000Z',
    declarations: [
      {
        source: '.node-version',
        raw: '22.12.0',
        version: '22.12.0',
      },
    ],
    version: '22.12.0',
  },
  metadata: [
    {
      name: 'fastify',
      state: 'available',
      source: 'npm-registry',
      observedAt: '2026-09-19T17:44:20.000Z',
      latestVersion: '6.0.0',
      runtimeVersion: '22.12.0',
      latestRuntimeCompatibility: 'unknown',
      update: 'major',
    },
  ],
  advisories: [
    {
      name: 'fastify',
      state: 'available',
      source: 'osv',
      observedAt: '2026-09-19T17:44:30.000Z',
      resolvedVersion: '5.6.0',
      advisories: [
        {
          id: 'GHSA-test-0001',
          modified: '2026-09-18T12:00:00Z',
        },
      ],
      complete: true,
    },
  ],
};

test('Dependency Health HTTP expõe snapshot read-only por projeto e 404 determinístico', async (context) => {
  const projectStore = new ProjectStore();
  projectStore.saveWorkspaceScan({
    workspaceId: 'workspace-1',
    workspacePath: '/workspace',
    projects: [project],
    warnings: [],
  });

  const calls: string[] = [];
  const service = {
    inspect: async (selectedProject: Project) => {
      calls.push(selectedProject.id);
      return health;
    },
  };

  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(dependencyHealthRoutes, {
    prefix: '/api',
    projectStore,
    dependencyHealthService: service,
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/dependency-health',
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { health });
  assert.deepEqual(calls, ['project-1']);

  const missing = await app.inject({
    method: 'GET',
    url: '/api/projects/missing/dependency-health',
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json<{ error: string }>().error, 'PROJECT_NOT_FOUND');
  assert.deepEqual(calls, ['project-1']);
});

test('Dependency Health response schema remove campos não públicos', async (context) => {
  const projectStore = new ProjectStore();
  projectStore.saveWorkspaceScan({
    workspaceId: 'workspace-1',
    workspacePath: '/workspace',
    projects: [project],
    warnings: [],
  });

  const app = Fastify();
  registerApiErrorHandling(app);
  app.register(dependencyHealthRoutes, {
    prefix: '/api',
    projectStore,
    dependencyHealthService: {
      inspect: async () =>
        ({
          ...health,
          internalSecret: 'não pode sair',
          metadata: [
            {
              ...health.metadata[0]!,
              internalSecret: 'não pode sair',
            },
          ],
        }) as ProjectDependencyHealthSnapshot,
    },
  });
  context.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/api/projects/project-1/dependency-health',
  });

  assert.equal(response.statusCode, 200);
  const body = response.json<{
    health: ProjectDependencyHealthSnapshot & {
      internalSecret?: string;
      metadata: Array<{ internalSecret?: string }>;
    };
  }>();
  assert.equal(body.health.internalSecret, undefined);
  assert.equal(body.health.metadata[0]?.internalSecret, undefined);
});
