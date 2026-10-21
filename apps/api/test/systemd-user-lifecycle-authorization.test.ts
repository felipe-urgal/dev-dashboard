import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type {
  ProjectServiceBinding,
  ServiceLifecyclePlan,
} from '@dev-dashboard/contracts';

import {
  SystemdUserLifecycleAuthorizer,
  SystemdUserLifecycleGrantPolicy,
} from '../src/services/systemd-user-lifecycle-authorization.js';
import type { SystemdUserLifecycleRequest } from '../src/services/systemd-user-lifecycle-service.js';

const REV = 'a'.repeat(64);
const HASH = 'b'.repeat(64);
const SERVICE = 'systemd:user:fixture-worker.service';
const BINDING = '11111111-1111-4111-8111-111111111111';
const REQUEST: SystemdUserLifecycleRequest = {
  projectId: 'project-a',
  environmentInstanceId: 'environment:primary:project-a',
  serviceRef: SERVICE,
  expectedRevision: REV,
  planHash: HASH,
  action: 'start',
};
const GRANT = {
  projectId: REQUEST.projectId,
  environmentInstanceId: REQUEST.environmentInstanceId,
  bindingId: BINDING,
  serviceRef: SERVICE,
  bindingRevision: REV,
  actions: ['start', 'stop'],
  expiresAt: '2026-10-22T12:00:00.000Z',
};
const CLOCK = new Date('2026-10-21T12:00:00.000Z');

function withPolicy(
  run: (
    policy: SystemdUserLifecycleGrantPolicy,
    file: string,
  ) => void | Promise<void>,
): Promise<void> {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'systemd-user-policy-'));
  const file = path.join(folder, 'policy.json');
  const policy = new SystemdUserLifecycleGrantPolicy({
    policyPath: file,
    now: () => CLOCK,
  });
  return Promise.resolve()
    .then(() => run(policy, file))
    .finally(() => rmSync(folder, { recursive: true, force: true }));
}

function writePolicy(file: string, grants: unknown[], version = 1): void {
  writeFileSync(file, JSON.stringify({ version, grants }), { mode: 0o600 });
  chmodSync(file, 0o600);
}

function binding(
  overrides: Partial<ProjectServiceBinding> = {},
): ProjectServiceBinding {
  return {
    id: BINDING,
    projectId: REQUEST.projectId,
    environmentInstanceId: REQUEST.environmentInstanceId,
    serviceRef: SERVICE,
    enabled: true,
    relation: 'required',
    requiredForStart: true,
    dependencies: [],
    createdAt: CLOCK.toISOString(),
    updatedAt: CLOCK.toISOString(),
    ...overrides,
  };
}

type ConfirmablePlan = Omit<ServiceLifecyclePlan, 'executable'> & {
  executable: boolean;
};

function plan(
  overrides: Partial<ConfirmablePlan> = {},
): ConfirmablePlan {
  return {
    target: {
      kind: 'project-environment',
      projectId: REQUEST.projectId,
      environmentInstanceId: REQUEST.environmentInstanceId,
    },
    action: 'start',
    status: 'ready',
    expectedRevision: REV,
    planHash: HASH,
    observedAt: CLOCK.toISOString(),
    expiresAt: new Date(CLOCK.getTime() + 30_000).toISOString(),
    order: [SERVICE],
    nodes: [
      {
        serviceRef: SERVICE,
        name: 'fixture-worker.service',
        provider: 'systemd',
        relation: 'required',
        disposition: 'willStart',
        state: 'stopped',
        readiness: 'unknown',
        dependencies: [],
        ports: [],
        consumerCount: 1,
      },
    ],
    diagnostics: [],
    executable: true,
    ...overrides,
  };
}

function fixture(policy: SystemdUserLifecycleGrantPolicy) {
  let observedBindings: ProjectServiceBinding[] = [binding()];
  let lastPlan = plan();
  let revision = REV;
  let planCalls = 0;
  let projectExists = true;
  let environmentKind = 'host';
  const authorizer = new SystemdUserLifecycleAuthorizer({
    policy,
    projects: {
      findProject: (id) =>
        projectExists && id === REQUEST.projectId ? { id } : null,
    },
    environments: {
      findById: (id) =>
        id === REQUEST.environmentInstanceId
          ? { projectId: REQUEST.projectId, runtime: { kind: environmentKind } }
          : null,
    },
    bindings: {
      revision: () => revision,
      byProject: () => observedBindings,
      byResource: (ref) =>
        observedBindings.filter((item) => item.serviceRef === ref),
    },
    planner: {
      preview: async () => {
        planCalls++;
        return lastPlan;
      },
    },
  });
  return {
    authorizer,
    setBindings: (items: ProjectServiceBinding[]) => (observedBindings = items),
    setPlan: (value: ConfirmablePlan) => (lastPlan = value),
    setRevision: (value: string) => (revision = value),
    setProjectExists: (value: boolean) => (projectExists = value),
    setEnvironmentKind: (value: string) => (environmentKind = value),
    get planCalls() {
      return planCalls;
    },
  };
}

test('missing policy never grants, valid secure file grants exact scoped action', async () => {
  await withPolicy(async (policy, file) => {
    assert.equal(policy.find(REQUEST), null);
    writePolicy(file, [GRANT]);
    assert.equal(policy.find(REQUEST)?.bindingId, BINDING);
    assert.equal(policy.find({ ...REQUEST, action: 'restart' }), null);
    assert.equal(policy.find({ ...REQUEST, projectId: 'other-project' }), null);
    assert.equal(
      policy.find({ ...REQUEST, environmentInstanceId: 'another-environment' }),
      null,
    );
    assert.equal(
      policy.find({
        ...REQUEST,
        serviceRef: 'systemd:system:fixture-worker.service',
      }),
      null,
    );
  });
});

test('policy is read-through: revocation and expiry deny without process restart', async () => {
  await withPolicy(async (policy, file) => {
    writePolicy(file, [GRANT]);
    assert.ok(policy.find(REQUEST));
    writePolicy(file, []);
    assert.equal(policy.find(REQUEST), null);
    writePolicy(file, [{ ...GRANT, expiresAt: CLOCK.toISOString() }]);
    assert.equal(policy.find(REQUEST), null);
  });
});

test('malformed, duplicate, future-version, long and unsafe policies deny all', async () => {
  await withPolicy(async (policy, file) => {
    for (const grants of [
      [GRANT, GRANT],
      [{ ...GRANT, serviceRef: 'systemd:user:dev-dashboard.service' }],
      [{ ...GRANT, actions: ['start', 'start'] }],
      [{ ...GRANT, serviceRef: 'systemd:user:worker@.service' }],
      [{ ...GRANT, bindingRevision: 'wrong' }],
      [{ ...GRANT, expiresAt: 'not-a-date' }],
      [{ ...GRANT, unexpected: 'field' }],
    ]) {
      writePolicy(file, grants);
      assert.equal(policy.find(REQUEST), null);
    }
    writePolicy(file, [GRANT], 2);
    assert.equal(policy.find(REQUEST), null);
    writeFileSync(file, 'X'.repeat(64 * 1024 + 1));
    assert.equal(policy.find(REQUEST), null);
    assert.equal(readFileSync(file, 'utf8').length, 64 * 1024 + 1);
  });
});

test('world/group readable policy and symlink deny, even with matching grant', async () => {
  await withPolicy(async (policy, file) => {
    writePolicy(file, [GRANT]);
    chmodSync(file, 0o644);
    assert.equal(policy.find(REQUEST), null);
    chmodSync(file, 0o600);
    assert.ok(policy.find(REQUEST));
    const source = file + '.real';
    writePolicy(source, [GRANT]);
    rmSync(file);
    symlinkSync(source, file);
    assert.equal(policy.find(REQUEST), null);
  });
});

test('authorization accepts only an independently executable matching plan', async () => {
  await withPolicy(async (policy, file) => {
    writePolicy(file, [GRANT]);
    const f = fixture(policy);
    assert.equal(await f.authorizer.authorize(REQUEST), true);
    assert.equal(f.planCalls, 1);
    f.setPlan(plan({ executable: false }));
    assert.equal(await f.authorizer.authorize(REQUEST), false);
    f.setPlan(plan({ planHash: 'c'.repeat(64) }));
    assert.equal(await f.authorizer.authorize(REQUEST), false);
    f.setPlan(plan({ status: 'blocked' }));
    assert.equal(await f.authorizer.authorize(REQUEST), false);
    f.setPlan(plan({ nodes: [plan().nodes[0]!, plan().nodes[0]!] }));
    assert.equal(await f.authorizer.authorize(REQUEST), false);
    f.setPlan(plan({ nodes: [{ ...plan().nodes[0]!, provider: 'compose' }] }));
    assert.equal(await f.authorizer.authorize(REQUEST), false);
  });
});

test('revocation, stale revision, missing project and non-host environment deny', async () => {
  await withPolicy(async (policy, file) => {
    writePolicy(file, [GRANT]);
    const f = fixture(policy);
    f.setRevision('c'.repeat(64));
    assert.equal(await f.authorizer.authorize(REQUEST), false);
    f.setRevision(REV);
    f.setProjectExists(false);
    assert.equal(await f.authorizer.authorize(REQUEST), false);
    f.setProjectExists(true);
    f.setEnvironmentKind('dev-container');
    assert.equal(await f.authorizer.authorize(REQUEST), false);
    f.setEnvironmentKind('host');
    writePolicy(file, []);
    assert.equal(await f.authorizer.authorize(REQUEST), false);
  });
});

test('observed-only, disabled, changed or shared binding never becomes ownership', async () => {
  await withPolicy(async (policy, file) => {
    writePolicy(file, [GRANT]);
    const f = fixture(policy);
    for (const b of [
      binding({ relation: 'observed' }),
      binding({ relation: 'owned', enabled: false }),
      binding({ requiredForStart: false }),
      binding({ id: '22222222-2222-4222-8222-222222222222' }),
      binding({ environmentInstanceId: 'another-environment' }),
    ]) {
      f.setBindings([b]);
      assert.equal(await f.authorizer.authorize(REQUEST), false);
    }
    f.setBindings([
      binding(),
      binding({
        id: '22222222-2222-4222-8222-222222222222',
        projectId: 'another-project',
        enabled: false,
      }),
    ]);
    assert.equal(await f.authorizer.authorize(REQUEST), false);
  });
});

test('restart and mismatched plan disposition fail closed', async () => {
  await withPolicy(async (policy, file) => {
    writePolicy(file, [{ ...GRANT, actions: ['start', 'stop', 'restart'] }]);
    const f = fixture(policy);
    assert.equal(
      await f.authorizer.authorize({ ...REQUEST, action: 'restart' }),
      false,
    );
    f.setPlan(
      plan({ nodes: [{ ...plan().nodes[0]!, disposition: 'retained' }] }),
    );
    assert.equal(await f.authorizer.authorize(REQUEST), false);
  });
});
