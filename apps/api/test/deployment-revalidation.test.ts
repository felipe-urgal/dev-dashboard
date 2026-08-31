import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { DeploymentPlanStep, Project } from '@dev-dashboard/contracts';

import type { DeploymentCommandRunner } from '../src/deployment/service.js';
import { DeploymentService } from '../src/deployment/service.js';
import type {
  DeploymentRevision,
  DeploymentRevisionResolver,
} from '../src/deployment/revision.js';
import { DeploymentStore } from '../src/deployment/store.js';

const REVISION_A = 'a'.repeat(40);
const REVISION_B = 'b'.repeat(40);

class MutableRevisionResolver implements DeploymentRevisionResolver {
  public current: DeploymentRevision = {
    revision: REVISION_A,
    branch: 'main',
  };

  public async resolve(): Promise<DeploymentRevision> {
    return { ...this.current };
  }
}

class RevisionChangingRunner implements DeploymentCommandRunner {
  public readonly calls: string[] = [];

  public constructor(private readonly revision: MutableRevisionResolver) {}

  public async run(
    _project: Project,
    step: DeploymentPlanStep,
  ): Promise<{ exitCode: number; cancelled: boolean }> {
    this.calls.push(step.id);
    if (step.id === 'check') {
      this.revision.current = { revision: REVISION_B, branch: 'main' };
    }
    return { exitCode: 0, cancelled: false };
  }
}

function project(projectPath: string): Project {
  return {
    id: 'project-1',
    name: 'home-music',
    path: projectPath,
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
      },
      policies: {
        backup: 'required-before-migration',
        migrations: 'startup',
        rollback: 'restore-backup-when-schema-changed',
      },
    },
  };
}

async function waitForTerminal(
  service: DeploymentService,
  deploymentId: string,
): Promise<Awaited<ReturnType<DeploymentService['get']>>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const current = await service.get('project-1', deploymentId);
    if (
      current.status === 'succeeded' ||
      current.status === 'failed' ||
      current.status === 'cancelled' ||
      current.status === 'recovery_required'
    ) {
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error('deployment não chegou a um estado terminal');
}

test('mudança de revision depois do check impede a próxima etapa', async (t) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-revalidate-'),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));

  const revision = new MutableRevisionResolver();
  const runner = new RevisionChangingRunner(revision);
  const service = new DeploymentService({
    revisionResolver: revision,
    adapter: runner,
    store: new DeploymentStore(directory),
  });
  t.after(() => service.close());

  const target = project(directory);
  const plan = await service.plan(target);
  const confirmation = await service.prepareConfirmation(target, plan.planHash);
  const started = await service.start(
    target,
    plan.planHash,
    confirmation.token,
  );
  const finished = await waitForTerminal(service, started.id);

  assert.deepEqual(runner.calls, ['check']);
  assert.equal(finished.status, 'failed');
  assert.equal(finished.failurePoint, 'before-irreversible');
  assert.equal(finished.errorCode, 'DEPLOYMENT_PLAN_STALE');
  assert.equal(finished.timeline[0]?.status, 'succeeded');
  assert.equal(finished.timeline[1]?.status, 'pending');
});
