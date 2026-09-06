import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import type {
  AttachHandle,
  DetachableExecutionSnapshot,
  StartExecutionOptions,
} from '../src/services/detachable-execution-service.js';
import {
  LocalCiExecutionError,
  LocalCiExecutionService,
} from '../src/services/local-ci-execution-service.js';
import type { LocalCiJobRequest } from '../src/services/local-ci-act.js';

const project: Project = {
  id: 'project-1',
  workspaceId: 'workspace-1',
  name: 'Project',
  path: '/workspace/project',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: ['git'],
};

const request: LocalCiJobRequest = {
  workflowFile: '.github/workflows/ci.yml',
  jobId: 'test',
  event: 'pull_request',
};

function catalog() {
  return {
    provider: 'act' as const,
    approximation: true as const,
    availability: { state: 'available' as const },
    jobs: [
      {
        workflowFile: request.workflowFile,
        workflow: 'CI',
        jobId: request.jobId,
        job: 'Tests',
        events: [request.event],
      },
    ],
  };
}

class FakeExecutions {
  public readonly starts: Array<{
    key: string;
    options: StartExecutionOptions;
  }> = [];
  public readonly cancels: string[] = [];
  private readonly snapshots = new Map<string, DetachableExecutionSnapshot>();
  private readonly exits = new Map<
    string,
    (snapshot: DetachableExecutionSnapshot) => void
  >();

  public start(
    key: string,
    options: StartExecutionOptions,
  ): DetachableExecutionSnapshot {
    this.starts.push({ key, options });
    const snapshot: DetachableExecutionSnapshot = {
      status: 'running',
      buffer: '',
      truncated: false,
      exitCode: null,
      exitSignal: null,
      startedAt: '2026-09-06T17:00:00.000Z',
      endedAt: null,
    };
    this.snapshots.set(key, snapshot);
    return snapshot;
  }

  public attach(
    key: string,
    _onData: (chunk: string) => void,
    onExit: (snapshot: DetachableExecutionSnapshot) => void,
  ): AttachHandle {
    this.exits.set(key, onExit);
    return {
      snapshot: this.snapshots.get(key)!,
      detach: () => this.exits.delete(key),
    };
  }

  public snapshotOf(key: string): DetachableExecutionSnapshot | undefined {
    return this.snapshots.get(key);
  }

  public cancel(key: string): void {
    this.cancels.push(key);
  }

  public exit(key: string, exitCode = 0): void {
    const current = this.snapshots.get(key);
    if (!current) throw new Error('snapshot ausente');
    const snapshot: DetachableExecutionSnapshot = {
      ...current,
      status: 'exited',
      exitCode,
      endedAt: '2026-09-06T17:01:00.000Z',
    };
    this.snapshots.set(key, snapshot);
    this.exits.get(key)?.(snapshot);
  }
}

function createService(
  executions: FakeExecutions,
  options: ConstructorParameters<typeof LocalCiExecutionService>[2] = {},
) {
  return new LocalCiExecutionService(
    { discover: async () => catalog() },
    executions,
    {
      createId: () => 'run-1',
      environment: {
        PATH: '/usr/bin',
        HOME: '/home/dev',
        GITHUB_TOKEN: 'secret-token',
        DATABASE_URL: 'postgres://secret',
      },
      ...options,
    },
  );
}

test('executa somente o job validado pelo catálogo com ambiente isolado', async () => {
  const executions = new FakeExecutions();
  const service = createService(executions);

  const result = await service.start(project, request);

  assert.equal(result.provider, 'act');
  assert.equal(result.approximation, true);
  assert.equal(result.status, 'running');
  assert.equal(executions.starts.length, 1);
  const start = executions.starts[0]!;
  assert.equal(start.options.file, 'act');
  assert.deepEqual(start.options.args, [
    'pull_request',
    '--job',
    'test',
    '--workflows',
    '.github/workflows/ci.yml',
  ]);
  assert.equal(start.options.cwd, project.path);
  assert.equal(start.options.env?.PATH, '/usr/bin');
  assert.equal(start.options.env?.HOME, '/home/dev');
  assert.equal(start.options.env?.CI, 'true');
  assert.equal(start.options.env?.GITHUB_TOKEN, undefined);
  assert.equal(start.options.env?.DATABASE_URL, undefined);
});

test('limita concorrência e libera slot depois do exit', async () => {
  const executions = new FakeExecutions();
  let sequence = 0;
  const service = createService(executions, {
    maxConcurrent: 1,
    createId: () => `run-${++sequence}`,
  });

  const first = await service.start(project, request);
  await assert.rejects(
    service.start(project, request),
    (error: unknown) =>
      error instanceof LocalCiExecutionError && error.code === 'LOCAL_CI_BUSY',
  );

  executions.exit(`local-ci:${project.id}:${first.id}`);
  const second = await service.start(project, request);
  assert.equal(second.id, 'run-2');
});

test('timeout cancela somente a execução possuída e marca o snapshot', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const executions = new FakeExecutions();
  const service = createService(executions, { timeoutMs: 1_000 });
  const run = await service.start(project, request);

  t.mock.timers.tick(1_000);

  assert.deepEqual(executions.cancels, [`local-ci:${project.id}:${run.id}`]);
  assert.equal(service.get(project.id, run.id).timedOut, true);
});

test('ownership impede consultar ou cancelar run de outro projeto', async () => {
  const executions = new FakeExecutions();
  const service = createService(executions);
  const run = await service.start(project, request);

  assert.throws(
    () => service.get('outro-projeto', run.id),
    (error: unknown) =>
      error instanceof LocalCiExecutionError &&
      error.code === 'LOCAL_CI_NOT_FOUND',
  );
  assert.throws(
    () => service.cancel('outro-projeto', run.id),
    (error: unknown) =>
      error instanceof LocalCiExecutionError &&
      error.code === 'LOCAL_CI_NOT_FOUND',
  );
  assert.deepEqual(executions.cancels, []);
});

test('shutdown cancela runs ativos sem operar execuções externas', async () => {
  const executions = new FakeExecutions();
  let sequence = 0;
  const service = createService(executions, {
    maxConcurrent: 2,
    createId: () => `run-${++sequence}`,
  });
  const first = await service.start(project, request);
  const second = await service.start(project, request);

  service.shutdown();

  assert.deepEqual(executions.cancels.sort(), [
    `local-ci:${project.id}:${first.id}`,
    `local-ci:${project.id}:${second.id}`,
  ]);
});
