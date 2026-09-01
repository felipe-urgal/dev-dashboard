import assert from 'node:assert/strict';
import test from 'node:test';

import { DeploymentError } from '../src/deployment/errors.js';
import { VercelDeploymentAdapter } from '../src/deployment/vercel-adapter.js';

const REVISION = 'a'.repeat(40);

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

function adapterWithInspectorUrl(inspectorUrl: string) {
  return new VercelDeploymentAdapter({
    token: 'token-local-de-teste',
    teamId: 'team_teste',
    fetchRequest: async (input) => {
      const url = new URL(input);
      if (url.pathname.startsWith('/v9/projects/')) {
        return response(200, {
          id: 'prj_controle_gastos',
          name: 'controle-gastos',
        });
      }

      return response(200, {
        deployments: [
          {
            id: 'dpl_producao',
            url: 'controle-gastos-pessoal.vercel.app',
            inspectorUrl,
            created: Date.parse('2026-09-01T12:00:00Z'),
            state: 'READY',
            target: 'production',
            meta: {
              githubCommitRef: 'main',
              githubCommitSha: REVISION,
            },
          },
        ],
      });
    },
  });
}

test('status de produção preserva inspectorUrl HTTPS separado da URL pública', async () => {
  const adapter = adapterWithInspectorUrl(
    'https://vercel.com/felipeurgals-projects/controle-gastos/dpl_producao',
  );

  const snapshot = await adapter.readProduction('controle-gastos');

  assert.equal(
    snapshot.deployment?.url,
    'https://controle-gastos-pessoal.vercel.app',
  );
  assert.equal(
    snapshot.deployment?.inspectorUrl,
    'https://vercel.com/felipeurgals-projects/controle-gastos/dpl_producao',
  );
});

test('status rejeita inspectorUrl não HTTPS', async () => {
  const adapter = adapterWithInspectorUrl(
    'http://vercel.example/controle-gastos/dpl_producao',
  );

  await assert.rejects(
    () => adapter.readProduction('controle-gastos'),
    (error: unknown) =>
      error instanceof DeploymentError &&
      error.code === 'DEPLOYMENT_PROVIDER_RESPONSE_INVALID',
  );
});
