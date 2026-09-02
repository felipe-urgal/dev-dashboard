import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { detectProject } from '../src/index.js';

async function withProject(
  production: Record<string, unknown>,
  run: (projectPath: string) => Promise<void>,
): Promise<void> {
  const projectPath = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-self-production-'),
  );
  try {
    await writeFile(
      path.join(projectPath, 'package.json'),
      JSON.stringify({
        name: 'dev-dashboard-fixture',
        private: true,
        scripts: {
          'prod:status': 'node status.mjs',
          'prod:check': 'node check.mjs',
          'prod:deploy': 'node deploy.mjs',
          'prod:verify': 'node verify.mjs',
        },
      }),
    );
    const directory = path.join(projectPath, '.dev-dashboard');
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, 'production.json'),
      JSON.stringify({ version: 1, production }, null, 2),
    );
    await run(projectPath);
  } finally {
    await rm(projectPath, { recursive: true, force: true });
  }
}

const policies = {
  backup: 'not-configured',
  migrations: 'not-configured',
  rollback: 'not-configured',
};

const base = {
  enabled: true,
  strategy: 'self-update',
  provider: 'none',
  branch: 'main',
  commands: {
    status: 'prod:status',
    check: 'prod:check',
  },
  policies,
};

test('contrato self-update fechado habilita capability production', async () => {
  await withProject(base, async (projectPath) => {
    const project = await detectProject(projectPath);
    assert.ok(project?.production);
    assert.equal(project.production.enabled, true);
    assert.equal(project.production.strategy, 'self-update');
    assert.equal(project.production.provider, 'none');
    assert.deepEqual(project.production.commands, base.commands);
    assert.ok(project.capabilities.includes('production'));
    assert.equal(project.productionWarning, undefined);
  });
});

test('self-update rejeita comando mutável ou blocker residual', async () => {
  await withProject(
    {
      ...base,
      commands: {
        ...base.commands,
        deploy: 'prod:deploy',
      },
    },
    async (projectPath) => {
      const project = await detectProject(projectPath);
      assert.equal(project?.production, undefined);
      assert.equal(
        project?.productionWarning?.code,
        'PRODUCTION_CONTRACT_INVALID_SHAPE',
      );
    },
  );

  await withProject(
    {
      ...base,
      blockedBy: ['security-review'],
    },
    async (projectPath) => {
      const project = await detectProject(projectPath);
      assert.equal(project?.production, undefined);
      assert.equal(
        project?.productionWarning?.code,
        'PRODUCTION_CONTRACT_INVALID_SHAPE',
      );
    },
  );
});

test('self-update rejeita provider e políticas que ampliem privilégio', async () => {
  await withProject(
    {
      ...base,
      provider: 'systemd',
    },
    async (projectPath) => {
      const project = await detectProject(projectPath);
      assert.equal(project?.production, undefined);
    },
  );

  await withProject(
    {
      ...base,
      policies: {
        ...policies,
        backup: 'required-before-deploy',
      },
    },
    async (projectPath) => {
      const project = await detectProject(projectPath);
      assert.equal(project?.production, undefined);
    },
  );
});
