import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type {
  Deployment,
  DeploymentPlanStep,
  Project,
} from '@dev-dashboard/contracts';

import { ProductionCommandAdapter } from '../src/deployment/command-adapter.js';
import { DeploymentError } from '../src/deployment/errors.js';
import {
  DeploymentService,
  type DeploymentCommandRunner,
} from '../src/deployment/service.js';
import { DeploymentStore } from '../src/deployment/store.js';

const REVISION = 'a'.repeat(40);

function makeProject(pathname: string): Project {
  return {
    id: 'home-music',
    name: 'home-music',
    path: pathname,
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
        check: 'prod:check',
        backup: 'prod:backup',
        deploy: 'prod:deploy',
        verify: 'prod:verify',
      },
      policies: {
        backup: 'required-before-deploy',
        migrations: 'startup',
        rollback: 'manual-restore',
      },
    },
  };
}

class FakeChild extends EventEmitter {
  public stdout = new EventEmitter();
  public stderr = new EventEmitter();

  public kill(): boolean {
    return true;
  }
}

class FixedRevisionResolver {
  public async resolve() {
    return { revision: REVISION, branch: 'main' };
  }
}

class PrivilegeRunner implements DeploymentCommandRunner {
  public async run(
    _project: Project,
    step: DeploymentPlanStep,
    _signal: AbortSignal,
    _onOutput: Parameters<DeploymentCommandRunner['run']>[3],
  ) {
    if (step.id === 'deploy') {
      throw new DeploymentError(
        'DEPLOYMENT_PRIVILEGE_REQUIRED',
        'O comando de produção requer sudo interativo.',
      );
    }
    return { exitCode: 0, cancelled: false };
  }
}

async function waitForTerminal(
  service: DeploymentService,
  deployment: Deployment,
): Promise<Deployment> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const current = await service.get(deployment.projectId, deployment.id);
    if (
      ['succeeded', 'failed', 'recovery_required', 'cancelled'].includes(
        current.status,
      )
    ) {
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('deployment não terminou dentro do limite do teste');
}

test('command adapter classifica sudo sem TTY como configuração de privilégio', async (t) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-deployment-sudo-'),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({
      packageManager: 'npm@11.0.0',
      scripts: { 'prod:deploy': 'sudo systemctl restart home-music' },
    }),
  );

  const child = new FakeChild();
  const adapter = new ProductionCommandAdapter({
    spawnProcess: (() => {
      queueMicrotask(() => {
        child.stderr.emit(
          'data',
          'sudo: a terminal is required to read the password; either use the -S option to read from standard input or configure an askpass helper\n',
        );
        child.emit('close', 1);
      });
      return child as never;
    }) as never,
  });

  await assert.rejects(
    adapter.run(
      makeProject(directory),
      {
        id: 'deploy',
        script: 'prod:deploy',
        phase: 'deploying',
        mutating: true,
        irreversible: true,
      },
      new AbortController().signal,
      () => undefined,
    ),
    (error: unknown) => {
      assert.ok(error instanceof DeploymentError);
      assert.equal(error.code, 'DEPLOYMENT_PRIVILEGE_REQUIRED');
      assert.match(error.message, /NOPASSWD/);
      assert.match(error.message, /senha ou TTY/);
      return true;
    },
  );
});

test('sudo bloqueado no início de etapa irreversível termina failed sem exigir recuperação', async (t) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-deployment-privilege-'),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));

  const project = makeProject(directory);
  const service = new DeploymentService({
    revisionResolver: new FixedRevisionResolver(),
    adapter: new PrivilegeRunner(),
    store: new DeploymentStore(path.join(directory, 'state')),
  });
  const plan = await service.plan(project);
  const confirmation = await service.prepareConfirmation(
    project,
    plan.planHash,
  );
  const started = await service.start(
    project,
    plan.planHash,
    confirmation.token,
  );
  const finished = await waitForTerminal(service, started);

  assert.equal(finished.status, 'failed');
  assert.equal(finished.failurePoint, 'before-irreversible');
  assert.equal(finished.errorCode, 'DEPLOYMENT_PRIVILEGE_REQUIRED');
  assert.match(finished.errorMessage ?? '', /sudo interativo/);
  assert.equal(
    finished.timeline.find((step) => step.id === 'deploy')?.status,
    'failed',
  );
});
