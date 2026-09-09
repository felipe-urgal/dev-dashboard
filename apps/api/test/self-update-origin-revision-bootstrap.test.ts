import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { GitDeploymentOriginRevisionResolver } from '../src/deployment/origin-revision.js';

const TARGET_REVISION = 'b'.repeat(40);

function project(): Project {
  return {
    id: 'dev-dashboard',
    name: 'dev-dashboard',
    path: '/tmp/dev-dashboard',
    type: 'node',
    source: 'standalone',
    enabled: true,
    capabilities: ['git', 'production'],
    production: {
      version: 1,
      enabled: true,
      strategy: 'self-update',
      provider: 'none',
      branch: 'main',
      commands: {
        status: 'prod:status',
        check: 'prod:check',
      },
      policies: {
        backup: 'not-configured',
        migrations: 'not-configured',
        rollback: 'not-configured',
      },
    },
  };
}

test('resolver prepara o agent antes de consultar origin/main', async () => {
  const calls: string[] = [];
  const resolver = new GitDeploymentOriginRevisionResolver({
    prepareAgent: async (_project, options) => {
      calls.push(`agent:${options.timeoutMs}`);
    },
    execGit: async (args, options) => {
      calls.push(`git:${args.join(' ')}:${options.cwd}`);
      return { stdout: `${TARGET_REVISION}\trefs/heads/main\n` };
    },
  });

  const revision = await resolver.resolve(project(), 'main');

  assert.equal(revision, TARGET_REVISION);
  assert.deepEqual(calls, [
    'agent:15000',
    'git:ls-remote --heads origin refs/heads/main:/tmp/dev-dashboard',
  ]);
});

test('resolver não consulta origin quando o preparo automático do agent falha', async () => {
  let gitCalled = false;
  const resolver = new GitDeploymentOriginRevisionResolver({
    prepareAgent: async () => {
      throw new Error('agent indisponível');
    },
    execGit: async () => {
      gitCalled = true;
      return { stdout: `${TARGET_REVISION}\trefs/heads/main\n` };
    },
  });

  assert.equal(await resolver.resolve(project(), 'main'), undefined);
  assert.equal(gitCalled, false);
});
