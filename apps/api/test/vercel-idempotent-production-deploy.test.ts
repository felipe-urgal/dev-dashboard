import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { VercelProviderStepAdapter } from '../src/deployment/step-adapter.js';
import { VercelDeploymentAdapter } from '../src/deployment/vercel-adapter.js';

const REVISION = 'a'.repeat(40);

function project(): Project {
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
      external: { project: 'portfolio-copilot' },
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

test('provider-deploy reutiliza a mesma revision já READY sem criar deployment duplicado', async () => {
  let createCalls = 0;
  const adapter = new VercelDeploymentAdapter({
    token: 'token-local',
    fetchRequest: async (input, init) => {
      const url = new URL(input);
      if (url.pathname === '/v9/projects/portfolio-copilot') {
        return response(200, {
          id: 'prj_portfolio_copilot',
          name: 'portfolio-copilot',
        });
      }
      if (url.pathname === '/v7/deployments') {
        return response(200, {
          deployments: [
            {
              id: 'dpl_ready',
              url: 'portfolio-copilot.vercel.app',
              created: Date.parse('2026-09-02T20:30:00Z'),
              state: 'READY',
              target: 'production',
              meta: {
                githubCommitRef: 'main',
                githubCommitSha: REVISION,
              },
            },
          ],
        });
      }
      if (url.pathname === '/v13/deployments' && init.method === 'POST') {
        createCalls += 1;
        return response(200, { id: 'dpl_duplicado' });
      }
      return response(404, { error: { code: 'not_found' } });
    },
  });
  const stepAdapter = new VercelProviderStepAdapter({
    vercelAdapter: adapter,
    revisionResolver: {
      async resolve() {
        return { branch: 'main', revision: REVISION };
      },
    },
    originRevisionResolver: {
      async resolve() {
        return REVISION;
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
    revision: REVISION,
  } as const;
  const signal = new AbortController().signal;
  const output: string[] = [];

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
    (message) => output.push(message.content),
  );

  assert.equal(result.exitCode, 0);
  assert.equal(result.cancelled, false);
  assert.equal(createCalls, 0);
  assert.match(output.join(''), /já está READY/);
  assert.match(output.join(''), /dpl_ready/);
});
