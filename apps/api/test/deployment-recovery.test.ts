import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Deployment } from '@dev-dashboard/contracts';

import { DeploymentStore } from '../src/deployment/store.js';

const REVISION = 'a'.repeat(40);

async function temporaryDirectory(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-recovery-'),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('queda durante etapa irreversível exige recuperação manual', async (t) => {
  const directory = await temporaryDirectory(t);
  const store = new DeploymentStore(directory);
  const deployment: Deployment = {
    id: 'deployment-running-migration',
    projectId: 'project-1',
    projectName: 'loto-lab',
    provider: 'docker-compose',
    branch: 'main',
    revision: REVISION,
    planHash: 'b'.repeat(64),
    status: 'migrating',
    createdAt: '2026-08-31T12:00:00.000Z',
    startedAt: '2026-08-31T12:00:01.000Z',
    currentStepId: 'migrate',
    timeline: [
      {
        id: 'migrate',
        script: 'prod:migrate',
        phase: 'migrating',
        mutating: true,
        irreversible: true,
        status: 'running',
        startedAt: '2026-08-31T12:00:02.000Z',
      },
    ],
  };

  await store.save(deployment);
  await store.recoverInterrupted(Date.parse('2026-08-31T12:05:00.000Z'));

  const recovered = await store.get(deployment.id);
  assert.equal(recovered?.status, 'recovery_required');
  assert.equal(recovered?.failurePoint, 'after-irreversible');
  assert.equal(recovered?.errorCode, 'DEPLOYMENT_INTERRUPTED');
  assert.equal(recovered?.timeline[0]?.status, 'failed');
});

test('restore falha fechado quando registro de deployment está corrompido', async (t) => {
  const directory = await temporaryDirectory(t);
  await writeFile(
    path.join(directory, 'deployment-corrompido.json'),
    '{"id":"deployment-corrompido"',
    'utf8',
  );

  const store = new DeploymentStore(directory);

  await assert.rejects(
    store.recoverInterrupted(),
    /Estado persistido de deployment inválido em deployment-corrompido\.json/,
  );
});

test('restore falha fechado quando registro persistido não passa na validação', async (t) => {
  const directory = await temporaryDirectory(t);
  await writeFile(
    path.join(directory, 'deployment-invalido.json'),
    JSON.stringify({
      id: 'deployment-invalido',
      projectId: 'project-1',
      status: 'deploying',
    }),
    'utf8',
  );

  const store = new DeploymentStore(directory);

  await assert.rejects(
    store.ready(),
    /Estado persistido de deployment inválido em deployment-invalido\.json/,
  );
});
