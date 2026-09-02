import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { detectProject } from '../src/index.js';

async function fixture(t: test.TestContext): Promise<string> {
  const projectPath = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-production-prepare-'),
  );
  t.after(() => rm(projectPath, { recursive: true, force: true }));
  await mkdir(path.join(projectPath, '.dev-dashboard'));
  return projectPath;
}

function manifest(commands: Record<string, string>): string {
  return JSON.stringify(
    {
      version: 1,
      production: {
        enabled: true,
        strategy: 'git-managed',
        provider: 'vercel',
        branch: 'main',
        commands,
        external: { project: 'fixture' },
        policies: {
          backup: 'external',
          migrations: 'not-configured',
          rollback: 'provider-only-when-schema-compatible',
        },
      },
    },
    null,
    2,
  );
}

test('reconhece prod:prepare como hook canônico opcional', async (t) => {
  const projectPath = await fixture(t);
  await writeFile(
    path.join(projectPath, 'package.json'),
    JSON.stringify({
      name: 'fixture',
      scripts: {
        'prod:prepare': 'node prepare.mjs',
        'prod:check': 'node check.mjs',
        'prod:verify': 'node verify.mjs',
      },
    }),
  );
  await writeFile(
    path.join(projectPath, '.dev-dashboard', 'production.json'),
    manifest({
      prepare: 'prod:prepare',
      check: 'prod:check',
      verify: 'prod:verify',
    }),
  );

  const project = await detectProject(projectPath);

  assert.ok(project?.production);
  assert.equal(project.production.commands.prepare, 'prod:prepare');
  assert.equal(project.productionWarning, undefined);
});

test('mantém contratos sem prepare válidos e rejeita prepare sem script', async (t) => {
  const projectPath = await fixture(t);
  await writeFile(
    path.join(projectPath, 'package.json'),
    JSON.stringify({
      name: 'fixture',
      scripts: {
        'prod:check': 'node check.mjs',
        'prod:verify': 'node verify.mjs',
      },
    }),
  );

  await writeFile(
    path.join(projectPath, '.dev-dashboard', 'production.json'),
    manifest({ check: 'prod:check', verify: 'prod:verify' }),
  );
  const withoutPrepare = await detectProject(projectPath);
  assert.ok(withoutPrepare?.production);
  assert.equal(withoutPrepare.production.commands.prepare, undefined);

  await writeFile(
    path.join(projectPath, '.dev-dashboard', 'production.json'),
    manifest({
      prepare: 'prod:prepare',
      check: 'prod:check',
      verify: 'prod:verify',
    }),
  );
  const missingScript = await detectProject(projectPath);
  assert.equal(missingScript?.production, undefined);
  assert.equal(
    missingScript?.productionWarning?.code,
    'PRODUCTION_CONTRACT_SCRIPT_MISSING',
  );
});
