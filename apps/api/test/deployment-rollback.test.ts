import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { DeploymentError } from '../src/deployment/errors.js';
import { DeploymentPlanner } from '../src/deployment/planner.js';

const CURRENT = 'a'.repeat(40);
const TARGET = 'b'.repeat(40);

function makeProject(
  production: Partial<NonNullable<Project['production']>> = {},
): Project {
  return {
    id: 'project-1',
    name: 'home-music',
    path: '/tmp/home-music',
    type: 'node',
    source: 'standalone',
    enabled: true,
    capabilities: ['production'],
    production: {
      version: 1,
      enabled: true,
      strategy: 'command',
      provider: 'systemd',
      branch: 'main',
      commands: {
        status: 'prod:status',
        check: 'prod:check',
        backup: 'prod:backup',
        deploy: 'prod:deploy',
        verify: 'prod:verify',
        rollback: 'prod:rollback',
      },
      policies: {
        backup: 'required-before-deploy',
        migrations: 'before-deploy',
        rollback: 'restore-backup-when-schema-changed',
      },
      ...production,
    },
  } as Project;
}

const planner = new DeploymentPlanner(() => 0);
const current = { revision: CURRENT, branch: 'main' };

test('o plano de rollback faz backup, executa prod:rollback e verifica — sem check nem migrations', () => {
  const plan = planner.buildRollback(makeProject(), current, TARGET);

  assert.equal(plan.kind, 'rollback');
  assert.equal(plan.revision, TARGET);
  assert.equal(plan.fromRevision, CURRENT);
  assert.deepEqual(
    plan.steps.map((step) => step.id),
    ['backup', 'rollback', 'verify'],
  );
  const rollback = plan.steps.find((step) => step.id === 'rollback')!;
  assert.equal(rollback.mutating, true);
  assert.equal(rollback.irreversible, true);
});

test('o hash do plano muda com a revisão alvo e com a revisão de origem', () => {
  const base = planner.buildRollback(makeProject(), current, TARGET).planHash;
  assert.notEqual(
    planner.buildRollback(makeProject(), current, 'c'.repeat(40)).planHash,
    base,
  );
  assert.notEqual(
    planner.buildRollback(
      makeProject(),
      { revision: 'd'.repeat(40), branch: 'main' },
      TARGET,
    ).planHash,
    base,
  );
});

test('recusa rollback sem prod:rollback ou com política manual', () => {
  const withoutCommand = makeProject();
  delete withoutCommand.production!.commands.rollback;
  for (const project of [
    withoutCommand,
    makeProject({
      policies: {
        backup: 'required-before-deploy',
        migrations: 'startup',
        rollback: 'manual-restore',
      },
    }),
  ]) {
    assert.throws(
      () => planner.buildRollback(project, current, TARGET),
      (error: unknown) =>
        error instanceof DeploymentError &&
        error.code === 'DEPLOYMENT_PRODUCTION_UNAVAILABLE',
    );
  }
});
