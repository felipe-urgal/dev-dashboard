import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  Deployment,
  DeploymentHistory,
  ProductionDeploymentStatus,
  Project,
} from '@dev-dashboard/contracts';

import { ProductionOverviewService } from '../src/deployment/production-overview.js';

const REVISION_A = 'a'.repeat(40);
const REVISION_B = 'b'.repeat(40);
const NOW = Date.parse('2026-09-01T15:00:00Z');

function commandProject(id = 'command-project'): Project {
  return {
    id,
    name: 'Command Project',
    path: `/tmp/${id}`,
    type: 'node',
    source: 'standalone',
    enabled: true,
    capabilities: ['production'],
    production: {
      version: 1,
      enabled: true,
      strategy: 'command',
      provider: 'systemd',
      branch: 'main',
      commands: {
        check: 'prod:check',
        deploy: 'prod:deploy',
        verify: 'prod:verify',
      },
      health: {
        type: 'http',
        url: 'https://example.test/health',
      },
      policies: {
        backup: 'required-before-deploy',
        migrations: 'startup',
        rollback: 'not-configured',
      },
    },
  };
}

function vercelProject(id = 'vercel-project'): Project {
  return {
    id,
    name: 'Vercel Project',
    path: `/tmp/${id}`,
    type: 'node',
    source: 'standalone',
    enabled: true,
    capabilities: ['production'],
    production: {
      version: 1,
      enabled: true,
      strategy: 'git-managed',
      provider: 'vercel',
      branch: 'main',
      commands: {
        check: 'prod:check',
        verify: 'prod:verify',
      },
      health: {
        type: 'http',
        url: 'https://example.test/health',
      },
      external: { project: 'vercel-project' },
      policies: {
        backup: 'external',
        migrations: 'startup',
        rollback: 'provider-only-when-schema-compatible',
      },
    },
  };
}

function deployment(
  options: {
    id?: string;
    project?: Project;
    revision?: string;
    status?: Deployment['status'];
    verifyStatus?: 'succeeded' | 'failed';
    branch?: string;
    provider?: Deployment['provider'];
  } = {},
): Deployment {
  const project = options.project ?? commandProject();
  const revision = options.revision ?? REVISION_A;
  const status = options.status ?? 'succeeded';
  return {
    id: options.id ?? 'deployment-1',
    projectId: project.id,
    projectName: project.name,
    provider: options.provider ?? project.production?.provider ?? 'none',
    branch: options.branch ?? project.production?.branch ?? 'main',
    revision,
    planHash: 'c'.repeat(64),
    status,
    createdAt: '2026-09-01T14:00:00.000Z',
    ...(status === 'succeeded'
      ? { finishedAt: '2026-09-01T14:05:00.000Z' }
      : {}),
    timeline: [
      {
        id: 'deploy',
        script: 'prod:deploy',
        phase: 'deploying',
        mutating: true,
        irreversible: true,
        status: 'succeeded',
        finishedAt: '2026-09-01T14:04:00.000Z',
      },
      {
        id: 'verify',
        script: 'prod:verify',
        phase: 'verifying',
        mutating: false,
        irreversible: false,
        status: options.verifyStatus ?? 'succeeded',
        finishedAt: '2026-09-01T14:05:00.000Z',
      },
    ],
  };
}

function history(items: Deployment[]): DeploymentHistory {
  return { items, page: 1, pageSize: 50, total: items.length };
}

function service(options: {
  histories?: Map<string, DeploymentHistory>;
  targetRevision?: string;
  providerStatus?: ProductionDeploymentStatus;
  historyErrorFor?: string;
}) {
  return new ProductionOverviewService({
    now: () => NOW,
    deploymentReader: {
      async history(projectId) {
        if (projectId === options.historyErrorFor) {
          throw new Error('store indisponível');
        }
        return options.histories?.get(projectId) ?? history([]);
      },
    },
    targetRevisionResolver: {
      async resolve() {
        return options.targetRevision;
      },
    },
    providerReader: {
      async read(project) {
        if (options.providerStatus) return options.providerStatus;
        throw new Error(`provider indisponível para ${project.id}`);
      },
    },
  });
}

test('classifica projeto command atualizado e preserva verify como evidência separada', async () => {
  const project = commandProject();
  const deploymentRecord = deployment({ project, revision: REVISION_A });
  const overview = await service({
    histories: new Map([[project.id, history([deploymentRecord])]]),
    targetRevision: REVISION_A,
  }).read([project]);

  assert.equal(overview.generatedAt, '2026-09-01T15:00:00.000Z');
  assert.equal(overview.items[0]?.state, 'in-sync');
  assert.equal(overview.items[0]?.health, 'verified');
  assert.equal(overview.items[0]?.targetRevision, REVISION_A);
  assert.equal(overview.items[0]?.productionRevision, REVISION_A);
  assert.equal(overview.items[0]?.healthCheckedAt, '2026-09-01T14:05:00.000Z');
});

test('classifica drift sem transformar revision divergente em falha operacional', async () => {
  const project = commandProject();
  const deploymentRecord = deployment({ project, revision: REVISION_A });
  const overview = await service({
    histories: new Map([[project.id, history([deploymentRecord])]]),
    targetRevision: REVISION_B,
  }).read([project]);

  assert.equal(overview.items[0]?.state, 'drift');
  assert.equal(overview.items[0]?.health, 'verified');
  assert.equal(overview.items[0]?.productionRevision, REVISION_A);
  assert.equal(overview.items[0]?.targetRevision, REVISION_B);
});

test('estado de execução e recovery tem precedência sobre comparação de revisions', async () => {
  const runningProject = commandProject('running');
  const recoveryProject = commandProject('recovery');
  const overview = await service({
    histories: new Map([
      [
        runningProject.id,
        history([
          deployment({
            project: runningProject,
            revision: REVISION_A,
            status: 'deploying',
          }),
        ]),
      ],
      [
        recoveryProject.id,
        history([
          deployment({
            project: recoveryProject,
            revision: REVISION_A,
            status: 'recovery_required',
            verifyStatus: 'failed',
          }),
        ]),
      ],
    ]),
    targetRevision: REVISION_A,
  }).read([runningProject, recoveryProject]);

  const byId = new Map(overview.items.map((item) => [item.projectId, item]));
  assert.equal(byId.get(runningProject.id)?.state, 'running');
  assert.equal(byId.get(recoveryProject.id)?.state, 'recovery-required');
});

test('ignora histórico de branch ou provider de contratos anteriores', async () => {
  const project = commandProject('contract-changed');
  if (!project.production) throw new Error('produção esperada no fixture');
  project.production.branch = 'release';

  const staleBranch = deployment({
    id: 'old-branch',
    project,
    revision: REVISION_A,
    branch: 'main',
    provider: 'systemd',
  });
  const staleProvider = deployment({
    id: 'old-provider',
    project,
    revision: REVISION_A,
    branch: 'release',
    provider: 'docker-compose',
  });

  const overview = await service({
    histories: new Map([[project.id, history([staleProvider, staleBranch])]]),
    targetRevision: REVISION_A,
  }).read([project]);

  assert.equal(overview.items[0]?.state, 'unknown');
  assert.equal(overview.items[0]?.health, 'unknown');
  assert.equal(overview.items[0]?.productionRevision, undefined);
  assert.equal(overview.items[0]?.deploymentId, undefined);
});

test('Vercel READY e in-sync não inventam health atual sem verify correspondente', async () => {
  const project = vercelProject();
  const providerStatus: ProductionDeploymentStatus = {
    projectId: project.id,
    projectName: project.name,
    strategy: 'git-managed',
    provider: 'vercel',
    branch: 'main',
    externalProject: 'vercel-project',
    providerAvailability: 'available',
    originRevision: REVISION_A,
    productionRevision: REVISION_A,
    drift: 'in-sync',
    localOperations: ['check', 'verify'],
    deployment: {
      id: 'dpl-1',
      url: 'https://example.vercel.app',
      state: 'ready',
      createdAt: '2026-09-01T14:00:00.000Z',
      branch: 'main',
      revision: REVISION_A,
    },
    timeline: [],
  };

  const overview = await service({ providerStatus }).read([project]);
  assert.equal(overview.items[0]?.state, 'in-sync');
  assert.equal(overview.items[0]?.health, 'unknown');
  assert.equal(overview.items[0]?.providerAvailability, 'available');
});

test('falha ao ler um projeto fica isolada e não derruba o overview inteiro', async () => {
  const broken = commandProject('broken');
  const healthy = commandProject('healthy');
  const healthyDeployment = deployment({ project: healthy });
  const overview = await service({
    histories: new Map([[healthy.id, history([healthyDeployment])]]),
    targetRevision: REVISION_A,
    historyErrorFor: broken.id,
  }).read([broken, healthy]);

  assert.equal(overview.items.length, 2);
  const byId = new Map(overview.items.map((item) => [item.projectId, item]));
  assert.equal(byId.get(broken.id)?.state, 'unknown');
  assert.equal(
    byId.get(broken.id)?.errorCode,
    'PRODUCTION_OVERVIEW_HISTORY_UNAVAILABLE',
  );
  assert.equal(byId.get(healthy.id)?.state, 'in-sync');
});
