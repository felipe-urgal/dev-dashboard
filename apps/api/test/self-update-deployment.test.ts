import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type {
  DeploymentPlanStep,
  Project,
} from '@dev-dashboard/contracts';
import type { MaskedLogContent } from '@dev-dashboard/process-manager';

import { DeploymentPlanner } from '../src/deployment/planner.js';
import {
  DeploymentService,
  type DeploymentCommandRunner,
  type DeploymentSelfUpdateHandoff,
} from '../src/deployment/service.js';
import { DeploymentStore } from '../src/deployment/store.js';
import type {
  SelfUpdateHandoff,
  SelfUpdateHandoffInput,
  SelfUpdateHandoffInspectInput,
} from '../src/services/self-update-handoff-service.js';

const LOCAL_REVISION = 'a'.repeat(40);
const TARGET_REVISION = 'b'.repeat(40);

function makeProject(): Project {
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

class FixedRevisionResolver {
  async resolve() {
    return { revision: LOCAL_REVISION, branch: 'main' };
  }
}

class FixedOriginRevisionResolver {
  revision: string | undefined = TARGET_REVISION;

  async resolve() {
    return this.revision;
  }
}

class CheckRunner implements DeploymentCommandRunner {
  readonly calls: string[] = [];

  async run(
    _project: Project,
    step: DeploymentPlanStep,
    _signal: AbortSignal,
    onOutput: (output: MaskedLogContent) => void,
  ) {
    this.calls.push(step.id);
    onOutput({ content: `step=${step.id}\n`, masked: false, redactionCount: 0 });
    return { exitCode: 0, cancelled: false };
  }
}

class FakeSelfUpdateHandoff implements DeploymentSelfUpdateHandoff {
  readonly prepareCalls: SelfUpdateHandoffInput[] = [];
  status: SelfUpdateHandoff['status'] = 'accepted';
  result: SelfUpdateHandoff['result'];

  private handoff(input: SelfUpdateHandoffInspectInput): SelfUpdateHandoff {
    return {
      version: 1,
      id: input.handoffId,
      action: 'self-update',
      projectId: input.projectId,
      targetRevision: input.targetRevision,
      planHash: input.planHash,
      status: this.status,
      createdAt: '2026-09-02T12:00:00.000Z',
      updatedAt: '2026-09-02T12:00:01.000Z',
      ...(this.result ? { result: this.result } : {}),
    };
  }

  async prepareAndExecute(input: SelfUpdateHandoffInput) {
    this.prepareCalls.push(input);
    assert.ok(input.handoffId);
    this.status = 'accepted';
    this.result = undefined;
    return this.handoff(input as SelfUpdateHandoffInspectInput);
  }

  async inspect(input: SelfUpdateHandoffInspectInput) {
    return this.handoff(input);
  }
}

async function temporaryStore(t: test.TestContext) {
  const directory = await mkdtemp(path.join(tmpdir(), 'self-update-deployment-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return new DeploymentStore(directory);
}

async function waitUntil(
  read: () => Promise<boolean>,
  attempts = 200,
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await read()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('estado esperado não foi observado');
}

function makeService(
  store: DeploymentStore,
  handoff: FakeSelfUpdateHandoff,
  runner = new CheckRunner(),
) {
  return {
    runner,
    service: new DeploymentService({
      revisionResolver: new FixedRevisionResolver(),
      originRevisionResolver: new FixedOriginRevisionResolver(),
      adapter: runner,
      selfUpdateHandoffService: handoff,
      store,
    }),
  };
}

test('planner self-update usa somente check e handoff irreversível', () => {
  const plan = new DeploymentPlanner(() =>
    Date.parse('2026-09-02T12:00:00Z'),
  ).build(makeProject(), {
    revision: TARGET_REVISION,
    branch: 'main',
  });

  assert.deepEqual(
    plan.steps.map((step) => step.id),
    ['check', 'self-update'],
  );
  assert.equal(plan.provider, 'none');
  assert.deepEqual(plan.steps[1], {
    id: 'self-update',
    phase: 'deploying',
    mutating: true,
    irreversible: true,
  });
});

test('deployment entrega revision de origin/main ao handoff e reconcilia sucesso após restart', async (t) => {
  const store = await temporaryStore(t);
  const handoff = new FakeSelfUpdateHandoff();
  const { service, runner } = makeService(store, handoff);
  const project = makeProject();

  const plan = await service.plan(project);
  assert.equal(plan.revision, TARGET_REVISION);
  const confirmation = await service.prepareConfirmation(project, plan.planHash);
  const started = await service.start(
    project,
    plan.planHash,
    confirmation.token,
  );

  await waitUntil(async () => {
    const current = await store.get(started.id);
    return current?.currentStepId === 'self-update';
  });

  const handedOff = await store.get(started.id);
  assert.equal(handedOff?.status, 'deploying');
  assert.deepEqual(runner.calls, ['check']);
  assert.equal(handoff.prepareCalls.length, 1);
  assert.equal(handoff.prepareCalls[0]?.targetRevision, TARGET_REVISION);
  assert.equal(
    handoff.prepareCalls[0]?.handoffId,
    `self-update-${started.id}`,
  );

  handoff.status = 'succeeded';
  handoff.result = {
    code: 'SELF_UPDATE_SUCCEEDED',
    message: 'Nova API validada.',
    finishedAt: '2026-09-02T12:01:00.000Z',
    appliedRevision: TARGET_REVISION,
  };

  const restarted = makeService(store, handoff).service;
  const finished = await restarted.get(project.id, started.id);
  assert.equal(finished.status, 'succeeded');
  assert.equal(finished.timeline[0]?.status, 'succeeded');
  assert.equal(finished.timeline[1]?.status, 'succeeded');
  assert.equal(finished.timeline[1]?.exitCode, 0);
  assert.match((await restarted.log(project.id, started.id)).content, /Nova API validada/);
});

test('reconciliação mantém recovery_required quando worker não comprova conclusão segura', async (t) => {
  const store = await temporaryStore(t);
  const handoff = new FakeSelfUpdateHandoff();
  const { service } = makeService(store, handoff);
  const project = makeProject();
  const plan = await service.plan(project);
  const confirmation = await service.prepareConfirmation(project, plan.planHash);
  const started = await service.start(project, plan.planHash, confirmation.token);

  await waitUntil(async () => (await store.get(started.id))?.currentStepId === 'self-update');

  handoff.status = 'recovery_required';
  handoff.result = {
    code: 'SELF_UPDATE_READINESS_TIMEOUT',
    message: 'Nova API não comprovou readiness.',
    finishedAt: '2026-09-02T12:02:00.000Z',
    appliedRevision: TARGET_REVISION,
  };

  const restarted = makeService(store, handoff).service;
  const recovered = await restarted.get(project.id, started.id);
  assert.equal(recovered.status, 'recovery_required');
  assert.equal(recovered.failurePoint, 'after-irreversible');
  assert.equal(recovered.errorCode, 'SELF_UPDATE_READINESS_TIMEOUT');
  assert.equal(recovered.timeline[1]?.status, 'failed');
});
