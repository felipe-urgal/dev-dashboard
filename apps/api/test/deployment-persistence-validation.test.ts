import assert from 'node:assert/strict';
import test from 'node:test';

import type { Deployment, DeploymentLog } from '@dev-dashboard/contracts';

import {
  isPersistedDeployment,
  isPersistedDeploymentLog,
} from '../src/deployment/persistence-validation.js';

const deployment: Deployment = {
  id: 'deployment-1',
  projectId: 'project-1',
  projectName: 'home-music',
  provider: 'systemd',
  branch: 'main',
  revision: 'a'.repeat(40),
  planHash: 'b'.repeat(64),
  status: 'deploying',
  createdAt: '2026-08-31T12:00:00.000Z',
  currentStepId: 'deploy',
  timeline: [
    {
      id: 'deploy',
      script: 'prod:deploy',
      phase: 'deploying',
      mutating: true,
      irreversible: true,
      status: 'running',
    },
  ],
};

const log: DeploymentLog = {
  deploymentId: 'deployment-1',
  content: 'saida\n',
  truncated: false,
  masked: true,
  redactionCount: 1,
};

test('aceita registros íntegros', () => {
  assert.equal(isPersistedDeployment(deployment), true);
  assert.equal(isPersistedDeploymentLog(log), true);
});

test('recusa deployment adulterado ou incompleto', () => {
  assert.equal(isPersistedDeployment(null), false);
  assert.equal(isPersistedDeployment({ ...deployment, id: '' }), false);
  assert.equal(
    isPersistedDeployment({ ...deployment, revision: 'revision-invalida' }),
    false,
  );
  assert.equal(
    isPersistedDeployment({
      ...deployment,
      timeline: [{ ...deployment.timeline[0]!, script: 'script-nao-canonico' }],
    }),
    false,
  );
  assert.equal(isPersistedDeployment({ ...deployment, timeline: null }), false);
});

test('recusa log adulterado', () => {
  assert.equal(isPersistedDeploymentLog(undefined), false);
  assert.equal(
    isPersistedDeploymentLog({ ...log, redactionCount: -1 }),
    false,
  );
  assert.equal(isPersistedDeploymentLog({ ...log, masked: 'sim' }), false);
});
