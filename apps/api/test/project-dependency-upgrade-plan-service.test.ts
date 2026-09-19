import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import type { ProjectDependencyHealthSnapshot } from '../src/services/project-dependency-health-service.js';
import { ProjectDependencyUpgradePlanService } from '../src/services/project-dependency-upgrade-plan-service.js';

const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/project-1',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: [],
};

const health: ProjectDependencyHealthSnapshot = {
  generatedAt: '2026-09-19T18:00:00.000Z',
  inventory: {
    status: 'ready',
    projectId: project.id,
    packageManager: 'npm',
    observedAt: '2026-09-19T17:59:00.000Z',
    lockfile: 'present',
    lockfileVersion: 3,
    dependencies: [
      {
        name: 'eslint',
        kind: 'devDependency',
        declaredRange: '^9.0.0',
        resolution: 'unknown',
      },
      {
        name: 'fastify',
        kind: 'dependency',
        declaredRange: '^5.0.0',
        resolution: 'resolved',
        resolvedVersion: '5.6.0',
      },
      {
        name: 'typescript',
        kind: 'devDependency',
        declaredRange: '^5.9.0',
        resolution: 'resolved',
        resolvedVersion: '5.9.3',
      },
      {
        name: 'vue',
        kind: 'dependency',
        declaredRange: '^3.5.0',
        resolution: 'resolved',
        resolvedVersion: '3.5.20',
      },
    ],
    warnings: [],
  },
  runtime: {
    state: 'declared',
    observedAt: '2026-09-19T17:59:10.000Z',
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
      name: 'eslint',
      state: 'available',
      source: 'npm-registry',
      observedAt: '2026-09-19T17:59:20.000Z',
      latestVersion: '9.35.0',
      runtimeVersion: '22.12.0',
      latestRuntimeCompatibility: 'compatible',
      update: 'unknown',
    },
    {
      name: 'fastify',
      state: 'available',
      source: 'npm-registry',
      observedAt: '2026-09-19T17:59:20.000Z',
      latestVersion: '6.0.0',
      runtimeVersion: '22.12.0',
      latestRuntimeCompatibility: 'compatible',
      update: 'major',
    },
    {
      name: 'typescript',
      state: 'available',
      source: 'npm-registry',
      observedAt: '2026-09-19T17:59:20.000Z',
      latestVersion: '5.9.3',
      runtimeVersion: '22.12.0',
      latestRuntimeCompatibility: 'compatible',
      update: 'none',
    },
    {
      name: 'vue',
      state: 'available',
      source: 'npm-registry',
      observedAt: '2026-09-19T17:59:20.000Z',
      latestVersion: '3.5.21',
      runtimeVersion: '22.12.0',
      latestRuntimeCompatibility: 'unknown',
      update: 'patch',
    },
  ],
  advisories: [
    {
      name: 'eslint',
      state: 'unknown-version',
      source: 'osv',
      observedAt: '2026-09-19T17:59:30.000Z',
      advisories: [],
      complete: false,
    },
    {
      name: 'fastify',
      state: 'available',
      source: 'osv',
      observedAt: '2026-09-19T17:59:30.000Z',
      resolvedVersion: '5.6.0',
      advisories: [
        {
          id: 'GHSA-test-0001',
          modified: '2026-09-18T12:00:00Z',
        },
      ],
      complete: true,
    },
    {
      name: 'typescript',
      state: 'available',
      source: 'osv',
      observedAt: '2026-09-19T17:59:30.000Z',
      resolvedVersion: '5.9.3',
      advisories: [],
      complete: true,
    },
    {
      name: 'vue',
      state: 'available',
      source: 'osv',
      observedAt: '2026-09-19T17:59:30.000Z',
      resolvedVersion: '3.5.20',
      advisories: [],
      complete: true,
    },
  ],
};

test('monta plano read-only sem promover evidência inconclusiva a upgrade acionável', async () => {
  const service = new ProjectDependencyUpgradePlanService({
    dependencyHealthService: {
      inspect: async (selectedProject) => {
        assert.equal(selectedProject, project);
        return health;
      },
    },
  });

  const plan = await service.inspect(project);

  assert.equal(plan.generatedAt, health.generatedAt);
  assert.equal(plan.projectId, project.id);
  assert.equal(plan.packageManager, 'npm');
  assert.equal(plan.status, 'partial');

  const eslint = plan.items.find((item) => item.name === 'eslint');
  assert.equal(eslint?.state, 'unknown');
  assert.equal(eslint?.targetVersion, '9.35.0');
  assert.deepEqual(eslint?.affectedFiles, []);
  assert.deepEqual(eslint?.gates, ['resolve-current-version']);

  const fastify = plan.items.find((item) => item.name === 'fastify');
  assert.equal(fastify?.state, 'upgrade');
  assert.equal(fastify?.currentVersion, '5.6.0');
  assert.equal(fastify?.targetVersion, '6.0.0');
  assert.deepEqual(fastify?.affectedFiles, [
    'package.json',
    'package-lock.json',
  ]);
  assert.deepEqual(fastify?.gates, [
    'review-major-change',
    'review-current-advisories',
    'verify-target-advisories',
    'run-tests',
  ]);
  assert.match(fastify?.warnings[0] ?? '', /major/);
  assert.match(fastify?.warnings[1] ?? '', /advisories conhecidos/);

  const typescript = plan.items.find((item) => item.name === 'typescript');
  assert.equal(typescript?.state, 'current');
  assert.deepEqual(typescript?.affectedFiles, []);
  assert.deepEqual(typescript?.gates, []);

  const vue = plan.items.find((item) => item.name === 'vue');
  assert.equal(vue?.state, 'upgrade');
  assert.deepEqual(vue?.gates, [
    'verify-node-runtime',
    'verify-target-advisories',
    'run-tests',
  ]);

  assert.deepEqual(plan.groups, [
    {
      id: 'root-package-manifest',
      basis: 'shared-manifest',
      dependencies: ['fastify', 'vue'],
      affectedFiles: ['package.json', 'package-lock.json'],
      lockstep: 'unknown',
    },
  ]);
});

test('metadata indisponível mantém alvo desconhecido e exige refresh explícito', async () => {
  const degraded: ProjectDependencyHealthSnapshot = {
    ...health,
    metadata: health.metadata.map((item) =>
      item.name === 'fastify'
        ? {
            name: item.name,
            state: 'unavailable',
            source: 'npm-registry',
            observedAt: item.observedAt,
            runtimeVersion: item.runtimeVersion,
            latestRuntimeCompatibility: 'unknown',
            update: 'unknown',
            diagnostic: 'registry indisponível',
          }
        : item,
    ),
  };
  const service = new ProjectDependencyUpgradePlanService({
    dependencyHealthService: { inspect: async () => degraded },
  });

  const plan = await service.inspect(project);
  const fastify = plan.items.find((item) => item.name === 'fastify');

  assert.equal(plan.status, 'partial');
  assert.equal(fastify?.state, 'unknown');
  assert.equal(fastify?.currentVersion, '5.6.0');
  assert.equal(fastify?.targetVersion, undefined);
  assert.deepEqual(fastify?.gates, ['refresh-metadata']);
});

test('runtime incompatível e advisories incompletos viram gates sem bloquear a geração do plano', async () => {
  const degraded: ProjectDependencyHealthSnapshot = {
    ...health,
    inventory: {
      ...health.inventory,
      dependencies: health.inventory.dependencies.filter(
        (item) => item.name === 'vue',
      ),
    },
    metadata: health.metadata
      .filter((item) => item.name === 'vue')
      .map((item) => ({
        ...item,
        latestRuntimeCompatibility: 'incompatible' as const,
      })),
    advisories: [
      {
        name: 'vue',
        state: 'partial',
        source: 'osv',
        observedAt: '2026-09-19T17:59:30.000Z',
        resolvedVersion: '3.5.20',
        advisories: [],
        complete: false,
      },
    ],
  };
  const service = new ProjectDependencyUpgradePlanService({
    dependencyHealthService: { inspect: async () => degraded },
  });

  const plan = await service.inspect(project);
  const vue = plan.items[0];

  assert.equal(plan.status, 'ready');
  assert.equal(vue?.state, 'upgrade');
  assert.deepEqual(vue?.gates, [
    'update-node-runtime',
    'refresh-current-advisories',
    'verify-target-advisories',
    'run-tests',
  ]);
  assert.match(vue?.warnings[0] ?? '', /incompatível/);
  assert.match(vue?.warnings[1] ?? '', /incompleta/);
});

test('inventário indisponível não produz plano falso', async () => {
  const unavailable: ProjectDependencyHealthSnapshot = {
    ...health,
    inventory: {
      status: 'unavailable',
      projectId: project.id,
      packageManager: 'npm',
      observedAt: '2026-09-19T17:59:00.000Z',
      lockfile: 'missing',
      dependencies: [],
      warnings: ['inventário indisponível'],
    },
    metadata: [],
    advisories: [],
  };
  const service = new ProjectDependencyUpgradePlanService({
    dependencyHealthService: { inspect: async () => unavailable },
  });

  const plan = await service.inspect(project);

  assert.equal(plan.status, 'unavailable');
  assert.deepEqual(plan.items, []);
  assert.deepEqual(plan.groups, []);
  assert.deepEqual(plan.warnings, ['inventário indisponível']);
});
