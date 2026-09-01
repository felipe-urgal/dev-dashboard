import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { DeploymentError } from '../src/deployment/errors.js';
import { ProductionDeploymentStatusService } from '../src/deployment/production-status.js';
import { VercelDeploymentAdapter } from '../src/deployment/vercel-adapter.js';

const REVISION_A = 'a'.repeat(40);
const REVISION_B = 'b'.repeat(40);

function project(): Project {
  return {
    id: 'project-1',
    name: 'controle-gastos',
    path: '/tmp/controle-gastos',
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
        migrate: 'prod:migrate',
        verify: 'prod:verify',
      },
      external: { project: 'controle-gastos' },
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

function adapterWithDeployment(options: {
  state?: string;
  revision?: string;
  branch?: string;
  deploymentTarget?: string | null;
  identifierField?: 'id' | 'uid';
  url?: string;
  created?: number;
}) {
  const requests: string[] = [];
  const adapter = new VercelDeploymentAdapter({
    token: 'token-local-de-teste',
    teamId: 'team_teste',
    fetchRequest: async (input) => {
      requests.push(input);
      const url = new URL(input);
      if (url.pathname.startsWith('/v9/projects/')) {
        return response(200, {
          id: 'prj_controle_gastos',
          name: 'controle-gastos',
        });
      }
      const identifier =
        options.identifierField === 'uid'
          ? { uid: 'dpl_producao' }
          : { id: 'dpl_producao' };
      return response(200, {
        deployments: [
          {
            ...identifier,
            url: options.url ?? 'controle-gastos-exemplo.vercel.app',
            created: options.created ?? Date.parse('2026-08-31T12:00:00Z'),
            state: options.state ?? 'READY',
            target: options.deploymentTarget ?? 'production',
            meta: {
              githubCommitRef: options.branch ?? 'main',
              githubCommitSha: options.revision ?? REVISION_A,
            },
          },
        ],
      });
    },
  });
  return { adapter, requests };
}

test('adapter usa external.project explicitamente e restringe leitura à produção', async () => {
  const { adapter, requests } = adapterWithDeployment({
    identifierField: 'uid',
  });
  const snapshot = await adapter.readProduction('controle-gastos');

  assert.equal(snapshot.projectId, 'prj_controle_gastos');
  assert.equal(snapshot.projectName, 'controle-gastos');
  assert.equal(snapshot.deployment?.id, 'dpl_producao');
  assert.equal(snapshot.deployment?.revision, REVISION_A);
  assert.equal(snapshot.deployment?.state, 'ready');
  assert.equal(
    snapshot.deployment?.url,
    'https://controle-gastos-exemplo.vercel.app',
  );
  assert.equal(requests.length, 2);

  const projectRequest = new URL(requests[0]!);
  assert.equal(projectRequest.pathname, '/v9/projects/controle-gastos');
  assert.equal(projectRequest.searchParams.get('teamId'), 'team_teste');

  const deploymentsRequest = new URL(requests[1]!);
  assert.equal(deploymentsRequest.pathname, '/v7/deployments');
  assert.equal(
    deploymentsRequest.searchParams.get('projectId'),
    'prj_controle_gastos',
  );
  assert.equal(deploymentsRequest.searchParams.get('target'), 'production');
  assert.equal(deploymentsRequest.searchParams.get('teamId'), 'team_teste');
});

test('status compara origin/main com produção e preserva operações locais separadas', async () => {
  const { adapter } = adapterWithDeployment({ revision: REVISION_A });
  const service = new ProductionDeploymentStatusService({
    provider: adapter,
    originRevisionResolver: {
      async resolve() {
        return REVISION_A;
      },
    },
  });

  const status = await service.read(project());
  assert.equal(status.providerAvailability, 'available');
  assert.equal(status.originRevision, REVISION_A);
  assert.equal(status.productionRevision, REVISION_A);
  assert.equal(status.drift, 'in-sync');
  assert.deepEqual(status.localOperations, ['check', 'migrate', 'verify']);
  assert.deepEqual(status.timeline, [
    {
      id: 'provider-deploy',
      phase: 'deploying',
      status: 'succeeded',
      startedAt: '2026-08-31T12:00:00.000Z',
    },
  ]);
});

test('status representa revision divergente e deployment Vercel com erro', async () => {
  const { adapter } = adapterWithDeployment({
    revision: REVISION_A,
    state: 'ERROR',
  });
  const service = new ProductionDeploymentStatusService({
    provider: adapter,
    originRevisionResolver: {
      async resolve() {
        return REVISION_B;
      },
    },
  });

  const status = await service.read(project());
  assert.equal(status.drift, 'drift');
  assert.equal(status.deployment?.state, 'error');
  assert.equal(status.timeline[0]?.status, 'failed');
});

test('status mantém drift desconhecido quando a ref origin ainda não existe localmente', async () => {
  const { adapter } = adapterWithDeployment({ revision: REVISION_A });
  const service = new ProductionDeploymentStatusService({
    provider: adapter,
    originRevisionResolver: {
      async resolve() {
        return undefined;
      },
    },
  });

  const status = await service.read(project());
  assert.equal(status.originRevision, undefined);
  assert.equal(status.productionRevision, REVISION_A);
  assert.equal(status.drift, 'unknown');
});

test('status traduz ausência de integração sem expor segredo', async () => {
  const service = new ProductionDeploymentStatusService({
    provider: {
      async readProduction() {
        throw new DeploymentError(
          'DEPLOYMENT_PROVIDER_INTEGRATION_UNAVAILABLE',
          'A integração Vercel não está configurada neste Dev Dashboard.',
        );
      },
    },
    originRevisionResolver: {
      async resolve() {
        return REVISION_A;
      },
    },
  });

  const status = await service.read(project());
  assert.equal(status.providerAvailability, 'not-configured');
  assert.equal(status.errorCode, 'DEPLOYMENT_PROVIDER_INTEGRATION_UNAVAILABLE');
  assert.equal(status.drift, 'unknown');
  assert.deepEqual(status.timeline, []);
});

test('adapter traduz autenticação e quota em erros tipados e seguros', async () => {
  const authAdapter = new VercelDeploymentAdapter({
    token: 'segredo-que-nao-pode-vazar',
    fetchRequest: async () =>
      response(401, {
        error: { code: 'forbidden', message: 'token=segredo-remoto' },
      }),
  });
  await assert.rejects(
    () => authAdapter.readProduction('controle-gastos'),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_PROVIDER_AUTH_FAILED' &&
      !error.message.includes('segredo'),
  );

  let call = 0;
  const quotaAdapter = new VercelDeploymentAdapter({
    token: 'token-local',
    fetchRequest: async () => {
      call += 1;
      if (call === 1) {
        return response(200, {
          id: 'prj_controle_gastos',
          name: 'controle-gastos',
        });
      }
      return response(429, {
        error: {
          code: 'api-deployments-free-per-day',
          message: 'Resource is limited - try again in 24 hours',
        },
      });
    },
  });
  await assert.rejects(
    () => quotaAdapter.readProduction('controle-gastos'),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_PROVIDER_QUOTA_EXCEEDED',
  );
});

test('adapter falha fechado para resposta externa inválida', async () => {
  const adapter = new VercelDeploymentAdapter({
    token: 'token-local',
    fetchRequest: async () => response(200, { name: 'sem-id' }),
  });

  await assert.rejects(
    () => adapter.readProduction('controle-gastos'),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_PROVIDER_RESPONSE_INVALID',
  );
});

test('adapter rejeita esquema não HTTPS e timestamp fora do intervalo de Date', async () => {
  const { adapter: insecureUrlAdapter } = adapterWithDeployment({
    url: 'http://exemplo.test/app',
  });
  await assert.rejects(
    () => insecureUrlAdapter.readProduction('controle-gastos'),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_PROVIDER_RESPONSE_INVALID',
  );

  const { adapter: invalidTimestampAdapter } = adapterWithDeployment({
    created: Number.MAX_VALUE,
  });
  await assert.rejects(
    () => invalidTimestampAdapter.readProduction('controle-gastos'),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_PROVIDER_RESPONSE_INVALID',
  );
});

test('adapter interrompe resposta em stream quando excede o limite aceito', async () => {
  let textCalled = false;
  const oversizedChunk = new Uint8Array(300 * 1024);
  const adapter = new VercelDeploymentAdapter({
    token: 'token-local',
    fetchRequest: async () => ({
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(oversizedChunk);
          controller.enqueue(oversizedChunk);
          controller.close();
        },
      }),
      async text() {
        textCalled = true;
        return '{}';
      },
    }),
  });

  await assert.rejects(
    () => adapter.readProduction('controle-gastos'),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_PROVIDER_RESPONSE_INVALID',
  );
  assert.equal(textCalled, false);
});

test('adapter normaliza revisão de GitLab e Bitbucket', async () => {
  for (const provider of ['gitlab', 'bitbucket'] as const) {
    let call = 0;
    const adapter = new VercelDeploymentAdapter({
      token: 'token-local',
      fetchRequest: async () => {
        call += 1;
        if (call === 1) {
          return response(200, {
            id: 'prj_controle_gastos',
            name: 'controle-gastos',
          });
        }

        const meta =
          provider === 'gitlab'
            ? {
                gitlabCommitRef: 'main',
                gitlabCommitSha: REVISION_A,
              }
            : {
                bitbucketCommitRef: 'main',
                bitbucketCommitSha: REVISION_B,
              };
        return response(200, {
          deployments: [
            {
              id: `dpl_${provider}`,
              url: `controle-gastos-${provider}.vercel.app`,
              created: Date.parse('2026-08-31T12:00:00Z'),
              state: 'READY',
              target: 'production',
              meta,
            },
          ],
        });
      },
    });

    const snapshot = await adapter.readProduction('controle-gastos');
    assert.equal(snapshot.deployment?.branch, 'main');
    assert.equal(
      snapshot.deployment?.revision,
      provider === 'gitlab' ? REVISION_A : REVISION_B,
    );
  }
});

test('adapter cria deployment production no projeto Vercel e aguarda a revisão confirmada ficar READY', async () => {
  const requests: Array<{
    url: URL;
    method: string;
    body?: unknown;
  }> = [];
  let deploymentReads = 0;
  const adapter = new VercelDeploymentAdapter({
    token: 'token-local',
    teamId: 'team_teste',
    pollIntervalMs: 0,
    sleep: async () => true,
    fetchRequest: async (input, init) => {
      const url = new URL(input);
      requests.push({
        url,
        method: init.method,
        ...(init.body ? { body: JSON.parse(init.body) } : {}),
      });
      if (url.pathname === '/v9/projects/controle-gastos') {
        return response(200, {
          id: 'prj_controle_gastos',
          name: 'controle-gastos',
        });
      }
      if (url.pathname === '/v13/deployments' && init.method === 'POST') {
        return response(200, { id: 'dpl_novo' });
      }
      if (url.pathname === '/v13/deployments/dpl_novo') {
        deploymentReads += 1;
        return response(200, {
          id: 'dpl_novo',
          url: 'controle-gastos-novo.vercel.app',
          created: Date.parse('2026-08-31T12:00:00Z'),
          readyState: deploymentReads === 1 ? 'BUILDING' : 'READY',
          meta: {
            githubCommitRef: 'main',
            githubCommitSha: REVISION_A,
          },
        });
      }
      return response(404, { error: { code: 'not_found' } });
    },
  });
  const controller = new AbortController();
  const messages: string[] = [];

  const result = await adapter.deployProduction('controle-gastos', {
    repository: { owner: 'felipe-urgal', repo: 'controle-gastos' },
    branch: 'main',
    revision: REVISION_A,
    signal: controller.signal,
    onStatus: (message) => messages.push(message),
  });

  assert.equal(result.cancelled, false);
  assert.equal(result.deployment?.state, 'ready');
  assert.equal(result.deployment?.revision, REVISION_A);
  assert.equal(deploymentReads, 2);
  const createRequest = requests.find(
    (item) => item.url.pathname === '/v13/deployments' && item.method === 'POST',
  );
  assert.deepEqual(createRequest?.body, {
    name: 'controle-gastos',
    target: 'production',
    gitSource: {
      type: 'github',
      org: 'felipe-urgal',
      repo: 'controle-gastos',
      ref: 'main',
      sha: REVISION_A,
    },
  });
  assert.equal(createRequest?.url.searchParams.get('teamId'), 'team_teste');
  assert.match(messages.join(''), /Vercel: building/);
  assert.match(messages.join(''), /Vercel: ready/);
});
