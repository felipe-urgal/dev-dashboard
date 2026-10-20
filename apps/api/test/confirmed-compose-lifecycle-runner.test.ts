import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ConfirmedLifecycleRequest,
  DevelopmentEnvironmentInstance,
  Project,
  ServiceLifecyclePlanNode,
} from '@dev-dashboard/contracts';

import { ConfirmedComposeLifecycleRunner } from '../src/services/confirmed-compose-lifecycle-runner.js';
import type { DockerComposeLifecycleService } from '../src/services/docker-compose-lifecycle-service.js';
import type { DockerComposeInspection } from '../src/services/docker-compose-provider.js';

const PROJECT: Project = {
  id: 'loto',
  workspaceId: 'dev',
  name: 'Loto Lab',
  path: '/workspace/loto',
  source: 'workspace',
  type: 'node',
  enabled: true,
  capabilities: [],
};
const ENVIRONMENT: DevelopmentEnvironmentInstance = {
  id: 'environment:primary:loto',
  projectId: 'loto',
  source: { kind: 'primary', path: PROJECT.path },
  runtime: { kind: 'host' },
  lifecycle: 'ready',
};
const CONFIRMATION: ConfirmedLifecycleRequest = {
  projectId: PROJECT.id,
  environmentInstanceId: ENVIRONMENT.id,
  action: 'start',
  expectedRevision: 'a'.repeat(64),
  expectedPlanHash: 'b'.repeat(64),
  acceptedObservedAt: '2026-10-20T10:00:00.000Z',
};
const NODE: ServiceLifecyclePlanNode = {
  serviceRef: 'compose:loto:app',
  name: 'Application',
  provider: 'compose',
  relation: 'owned',
  consumerCount: 1,
  disposition: 'willStart',
  state: 'stopped',
  readiness: 'unknown',
  ports: [],
  dependencies: [],
};

function fixture() {
  let environment: DevelopmentEnvironmentInstance | null = structuredClone(ENVIRONMENT);
  let project: Project | null = structuredClone(PROJECT);
  let owner: { projectId: string; projectPath: string;
    composeProjectName: string; startedAt: string } | undefined = {
      projectId: PROJECT.id, projectPath: PROJECT.path,
      composeProjectName: 'loto-prod', startedAt: '2026-10-20T08:00:00.000Z',
    };
  let inspected: DockerComposeInspection = {
    state: 'available',
    observedAt: '2026-10-20T10:00:00.000Z',
    config: {
      projectName: 'loto-prod',
      observedAt: '2026-10-20T10:00:00.000Z',
      declaredPorts: [],
      services: [
        { name: 'app', dependsOn: [], profiles: [], ports: [] },
        { name: 'db', dependsOn: [], profiles: [], ports: [] },
      ],
    },
    runtime: {
      observedAt: '2026-10-20T10:00:00.000Z',
      services: [
        { service: 'app', state: 'exited', health: 'none', ports: [] },
        { service: 'db', state: 'exited', health: 'none', ports: [] },
      ],
    },
  };

  const mutations: string[] = [];
  const lifecycle = {
    start: async (target: Project, _input: unknown, service?: string) => {
      mutations.push('start:' + target.id + ':' + service);
      return undefined;
    },
    stop: async (target: Project, service?: string) => {
      mutations.push('stop:' + target.id + ':' + service);
      return undefined;
    },
  } as unknown as Pick<DockerComposeLifecycleService, 'start' | 'stop'>;

  const runner = new ConfirmedComposeLifecycleRunner({
    projects: { findProject: () => project },
    environments: { findById: () => environment },
    provider: { inspect: async () => inspected },
    ownership: { get: async () => owner },
    lifecycle,
  });
  return {
    runner, mutations,
    setProject: (value: Project | null) => { project = value; },
    setEnvironment: (value: DevelopmentEnvironmentInstance | null) => { environment = value; },
    setOwner: (value: typeof owner) => { owner = value; },
    setInspection: (value: DockerComposeInspection) => { inspected = value; },
    inspection: () => inspected,
  };
}

test('delegates start to existing Compose owner for an exclusive primary service', async () => {
  const f = fixture();
  await f.runner.run('start', NODE, CONFIRMATION);
  assert.deepEqual(f.mutations, ['start:loto:app']);
});

test('delegates stop only when all declared Compose dependents are proven inactive', async () => {
  const f = fixture();
  f.inspection().config!.services[1]!.dependsOn = ['app'];
  const request: ConfirmedLifecycleRequest = { ...CONFIRMATION, action: 'stop' };
  await f.runner.run('stop', {
    ...NODE, disposition: 'willStop', state: 'running', readiness: 'ready',
  }, request);
  assert.deepEqual(f.mutations, ['stop:loto:app']);
});

test('rejects forged resource reference, mismatched project, shared and unowned targets', async () => {
  const f = fixture();
  await assert.rejects(f.runner.run('start', {
    ...NODE, serviceRef: 'compose:gastos:app',
  }, CONFIRMATION), /does not belong/);
  await assert.rejects(f.runner.run('start', {
    ...NODE, consumerCount: 2,
  }, CONFIRMATION), /not an authorized/);
  await assert.rejects(f.runner.run('start', {
    ...NODE, relation: 'required',
  }, CONFIRMATION), /not an authorized/);
  await assert.rejects(f.runner.run('start', {
    ...NODE, provider: 'systemd',
  }, CONFIRMATION), /not an authorized/);
  await assert.rejects(f.runner.run('stop', {
    ...NODE, disposition: 'willStop',
  }, CONFIRMATION), /not an authorized/);
  assert.deepEqual(f.mutations, []);
});

test('rejects worktree or Dev Container environment without adopting primary project', async () => {
  const f = fixture();
  await assert.rejects(f.runner.run('start', NODE, {
    ...CONFIRMATION, environmentInstanceId: 'environment:worktree:loto:42',
  }), /primary host environment/);
  f.setEnvironment({
    ...ENVIRONMENT, runtime: { kind: 'devcontainer', containerId: 'test' },
  } as DevelopmentEnvironmentInstance);
  await assert.rejects(f.runner.run('start', NODE, CONFIRMATION), /no longer valid/);
  f.setEnvironment(null);
  await assert.rejects(f.runner.run('start', NODE, CONFIRMATION), /no longer valid/);
  assert.deepEqual(f.mutations, []);
});

test('refuses missing, mismatched and unverifiable Compose ownership', async () => {
  const f = fixture();
  f.setOwner(undefined);
  await assert.rejects(f.runner.run('start', NODE, CONFIRMATION), /ownership/);
  f.setOwner({
    projectId: 'other', projectPath: PROJECT.path,
    composeProjectName: 'loto-prod', startedAt: '2026-10-20T08:00:00.000Z',
  });
  await assert.rejects(f.runner.run('start', NODE, CONFIRMATION), /ownership/);
  f.setOwner({
    projectId: PROJECT.id, projectPath: PROJECT.path,
    composeProjectName: 'loto-prod', startedAt: '2026-10-20T08:00:00.000Z',
  });
  f.inspection().config!.projectName = 'different';
  await assert.rejects(f.runner.run('start', NODE, CONFIRMATION), /ownership/);
  f.inspection().config!.projectName = 'loto-prod';
  f.inspection().state = 'runtime-unavailable';
  await assert.rejects(f.runner.run('start', NODE, CONFIRMATION), /ownership/);
  assert.deepEqual(f.mutations, []);
});

test('refuses automatic dependency cascade on Compose up SERVICE', async () => {
  const f = fixture();
  f.inspection().config!.services[0]!.dependsOn = ['db'];
  await assert.rejects(
    f.runner.run('start', NODE, CONFIRMATION),
    /implicit dependencies/,
  );
  assert.deepEqual(f.mutations, []);
});

test('refuses stop when dependents are running or missing from observed runtime', async () => {
  const f = fixture();
  f.inspection().config!.services[1]!.dependsOn = ['app'];
  f.inspection().runtime!.services[1]!.state = 'running';
  const request = { ...CONFIRMATION, action: 'stop' as const };
  const node = { ...NODE, disposition: 'willStop' as const };
  await assert.rejects(f.runner.run('stop', node, request), /dependents/);
  f.inspection().runtime!.services.pop();
  await assert.rejects(f.runner.run('stop', node, request), /dependents/);
  assert.deepEqual(f.mutations, []);
});

test('rejects unlisted service or missing runtime identity; never trusts node.name', async () => {
  const f = fixture();
  await assert.rejects(f.runner.run('start', {
    ...NODE, serviceRef: 'compose:loto:unknown',
  }, CONFIRMATION), /not present/);
  const config = f.inspection().config!;
  config.services[0]!.name = 'other-app';
  await assert.rejects(f.runner.run('start', NODE, CONFIRMATION), /not present/);
  assert.deepEqual(f.mutations, []);
});

test('does not call owner if project disappears or environment identity drifts', async () => {
  const f = fixture();
  f.setProject(null);
  await assert.rejects(f.runner.run('start', NODE, CONFIRMATION), /no longer valid/);
  f.setProject(PROJECT);
  f.setEnvironment({
    ...ENVIRONMENT, source: { kind: 'primary', path: '/other/location' },
  });
  await assert.rejects(f.runner.run('start', NODE, CONFIRMATION), /no longer valid/);
  assert.deepEqual(f.mutations, []);
});
