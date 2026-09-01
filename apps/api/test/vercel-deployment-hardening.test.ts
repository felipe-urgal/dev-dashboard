import assert from 'node:assert/strict';
import test from 'node:test';

import type { Deployment, Project } from '@dev-dashboard/contracts';

import { DeploymentError } from '../src/deployment/errors.js';
import { GitDeploymentOriginRevisionResolver } from '../src/deployment/origin-revision.js';
import { DeploymentPlanner } from '../src/deployment/planner.js';
import { isPersistedDeployment } from '../src/deployment/persistence-validation.js';
import { VercelProviderStepAdapter } from '../src/deployment/step-adapter.js';
import { VercelDeploymentAdapter } from '../src/deployment/vercel-adapter.js';

const REVISION_A = 'a'.repeat(40);
const REVISION_B = 'b'.repeat(40);

function project(externalProject = 'portfolio-copilot'): Project {
  return {
    id: 'portfolio-copilot',
    name: 'portfolio-copilot',
    path: '/tmp/portfolio-copilot',
    type: 'node',
    source: 'standalone',
    enabled: true,
    capabilities: ['git', 'production'],
    production: {
      version: 1,
      enabled: true,
      strategy: 'git-managed',
      provider: 'vercel',
      branch: 'main',
      commands: {
        check: 'prod:check',
        migrate: 'prod:migrate',
        verify: 'prod:verify',
      },
      external: { project: externalProject },
      policies: {
        backup: 'external',
        migrations: 'before-deploy',
        rollback: 'provider-only-when-schema-compatible',
      },
    },
  };
}

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

test('planner vincula external.project e revision ao preflight e ao provider-deploy', () => {
  const planner = new DeploymentPlanner(() => 1_000);
  const first = planner.build(project('portfolio-copilot'), {
    branch: 'main',
    revision: REVISION_A,
  });
  const second = planner.build(project('portfolio-copilot-outro'), {
    branch: 'main',
    revision: REVISION_A,
  });

  const check = first.steps[0];
  const migrate = first.steps.find((step) => step.id === 'migrate');
  const provider = first.steps.find((step) => step.id === 'provider-deploy');

  assert.ok(check && 'providerPreflight' in check);
  assert.deepEqual(check.providerPreflight, {
    externalProject: 'portfolio-copilot',
    branch: 'main',
    revision: REVISION_A,
  });
  assert.ok(migrate && 'providerPreflight' in migrate);
  assert.equal(migrate.providerPreflight?.revision, REVISION_A);
  assert.ok(provider && provider.id === 'provider-deploy');
  assert.deepEqual(provider.target, {
    externalProject: 'portfolio-copilot',
    branch: 'main',
    revision: REVISION_A,
  });
  assert.notEqual(first.planHash, second.planHash);
});

test('persistência aceita provider-deploy tipado com alvo confirmado', () => {
  const deployment: Deployment = {
    id: 'deployment-vercel',
    projectId: 'portfolio-copilot',
    projectName: 'portfolio-copilot',
    provider: 'vercel',
    branch: 'main',
    revision: REVISION_A,
    planHash: 'c'.repeat(64),
    status: 'deploying',
    currentStepId: 'provider-deploy',
    createdAt: '2026-09-01T11:00:00.000Z',
    timeline: [
      {
        id: 'provider-deploy',
        phase: 'deploying',
        mutating: true,
        irreversible: true,
        target: {
          externalProject: 'portfolio-copilot',
          branch: 'main',
          revision: REVISION_A,
        },
        status: 'running',
      },
    ],
  };

  assert.equal(isPersistedDeployment(deployment), true);
});

test('resolver remoto propaga timeout e AbortSignal ao git ls-remote', async () => {
  const controller = new AbortController();
  let observedTimeout = 0;
  let observedSignal: AbortSignal | undefined;
  const resolver = new GitDeploymentOriginRevisionResolver({
    timeoutMs: 3210,
    execGit: async (args, options) => {
      assert.deepEqual(args, [
        'ls-remote',
        '--heads',
        'origin',
        'refs/heads/main',
      ]);
      observedTimeout = options.timeoutMs;
      observedSignal = options.signal;
      return { stdout: `${REVISION_A}\trefs/heads/main\n` };
    },
  });

  const revision = await resolver.resolve(project(), 'main', controller.signal);
  assert.equal(revision, REVISION_A);
  assert.equal(observedTimeout, 3210);
  assert.equal(observedSignal, controller.signal);
});

test('preflight bloqueia provider já ativo antes de qualquer nova promoção', async () => {
  const adapter = new VercelDeploymentAdapter({
    token: 'token-local',
    fetchRequest: async (input) => {
      const url = new URL(input);
      if (url.pathname.startsWith('/v9/projects/')) {
        return response(200, { id: 'prj_1', name: 'portfolio-copilot' });
      }
      return response(200, {
        deployments: [
          {
            id: 'dpl_ativo',
            url: 'portfolio-copilot.vercel.app',
            created: Date.parse('2026-09-01T11:00:00Z'),
            state: 'BUILDING',
            target: 'production',
            meta: {
              githubCommitRef: 'main',
              githubCommitSha: REVISION_A,
            },
          },
        ],
      });
    },
  });
  const stepAdapter = new VercelProviderStepAdapter({
    vercelAdapter: adapter,
    revisionResolver: {
      async resolve() {
        return { branch: 'main', revision: REVISION_A };
      },
    },
    originRevisionResolver: {
      async resolve() {
        return REVISION_A;
      },
    },
    githubOriginResolver: {
      async resolve() {
        return { owner: 'felipe-urgal', repo: 'portfolio-copilot' };
      },
    },
  });

  await assert.rejects(
    stepAdapter.preflight(
      project(),
      {
        externalProject: 'portfolio-copilot',
        branch: 'main',
        revision: REVISION_A,
      },
      new AbortController().signal,
    ),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_PROVIDER_DEPLOYMENT_ACTIVE',
  );
});

test('provider-deploy usa somente o alvo confirmado e o preflight imediatamente anterior', async () => {
  const requests: Array<{ method: string; path: string; body?: unknown }> = [];
  let detailReads = 0;
  const adapter = new VercelDeploymentAdapter({
    token: 'token-local',
    pollIntervalMs: 0,
    sleep: async () => true,
    fetchRequest: async (input, init) => {
      const url = new URL(input);
      requests.push({
        method: init.method,
        path: url.pathname,
        ...(init.body ? { body: JSON.parse(init.body) } : {}),
      });
      if (url.pathname.startsWith('/v9/projects/')) {
        return response(200, { id: 'prj_1', name: 'portfolio-copilot' });
      }
      if (url.pathname === '/v7/deployments') {
        return response(200, { deployments: [] });
      }
      if (url.pathname === '/v13/deployments' && init.method === 'POST') {
        return response(200, { id: 'dpl_novo' });
      }
      if (url.pathname === '/v13/deployments/dpl_novo') {
        detailReads += 1;
        return response(200, {
          id: 'dpl_novo',
          url: 'portfolio-copilot.vercel.app',
          created: Date.parse('2026-09-01T11:00:00Z'),
          readyState: 'READY',
          meta: {
            githubCommitRef: 'main',
            githubCommitSha: REVISION_A,
          },
        });
      }
      return response(404, { error: { code: 'not_found' } });
    },
  });
  const stepAdapter = new VercelProviderStepAdapter({
    vercelAdapter: adapter,
    revisionResolver: {
      async resolve() {
        return { branch: 'main', revision: REVISION_A };
      },
    },
    originRevisionResolver: {
      async resolve() {
        return REVISION_A;
      },
    },
    githubOriginResolver: {
      async resolve() {
        return { owner: 'felipe-urgal', repo: 'portfolio-copilot' };
      },
    },
  });
  const target = {
    externalProject: 'portfolio-copilot',
    branch: 'main',
    revision: REVISION_A,
  } as const;
  const signal = new AbortController().signal;

  await stepAdapter.preflight(project(), target, signal);
  const result = await stepAdapter.run(
    project(),
    {
      id: 'provider-deploy',
      phase: 'deploying',
      mutating: true,
      irreversible: true,
      target,
    },
    signal,
    () => undefined,
  );

  assert.equal(result.cancelled, false);
  assert.equal(detailReads, 1);
  const create = requests.find(
    (request) =>
      request.path === '/v13/deployments' && request.method === 'POST',
  );
  assert.deepEqual(create?.body, {
    name: 'portfolio-copilot',
    target: 'production',
    gitSource: {
      type: 'github',
      org: 'felipe-urgal',
      repo: 'portfolio-copilot',
      ref: 'main',
      sha: REVISION_A,
    },
  });
  assert.equal(
    requests.filter((request) => request.path.startsWith('/v9/projects/'))
      .length,
    1,
  );
});

test('mensagem bruta de erro da Vercel não é propagada', async () => {
  const adapter = new VercelDeploymentAdapter({
    token: 'token-local',
    fetchRequest: async () =>
      response(500, {
        error: {
          code: 'internal_error',
          message: `connection=postgres://usuario:segredo@host/${REVISION_B}`,
        },
      }),
  });

  await assert.rejects(
    adapter.readProduction('portfolio-copilot'),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_PROVIDER_UNAVAILABLE' &&
      !error.message.includes('segredo') &&
      !error.message.includes('postgres://'),
  );
});
