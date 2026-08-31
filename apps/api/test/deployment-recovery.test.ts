import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Deployment } from '@dev-dashboard/contracts';

import { DeploymentStore } from '../src/deployment/store.js';

const REVISION = 'a'.repeat(40);

async function temporaryDirectory(t: test.TestContext): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-recovery-'));
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
