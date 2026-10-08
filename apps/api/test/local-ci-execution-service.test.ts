import assert from 'node:assert/strict';
import test from 'node:test';

import type { ActivityEvent, Project } from '@dev-dashboard/contracts';
import type { AppendActivityEventInput } from '@dev-dashboard/core';

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
    discovery: {
      workflowsExamined: 1,
      workflowsAccepted: 1,
      workflowsSkipped: 0,
      truncated: false,
      reasons: [],
    },
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
    Set<(snapshot: DetachableExecutionSnapshot) => void>
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
    const listeners = this.exits.get(key) ?? new Set();
    listeners.add(onExit);
    this.exits.set(key, listeners);
    return {
      snapshot: this.snapshots.get(key)!,
      detach: () => listeners.delete(onExit),
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
    for (const listener of [...(this.exits.get(key) ?? [])]) listener(snapshot);
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
  assert.equal(result.outcome, null);
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
  executions.exit(`local-ci:${project.id}:${run.id}`, 143);
  assert.equal(service.get(project.id, run.id).outcome, 'timeout');
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

test('normaliza request fora do catálogo sem expor erro interno', async () => {
  const executions = new FakeExecutions();
  const service = new LocalCiExecutionService(
    {
      discover: async () => ({
        ...catalog(),
        jobs: [],
      }),
    },
    executions,
    { createId: () => 'run-invalid' },
  );

  await assert.rejects(
    service.start(project, request),
    (error: unknown) =>
      error instanceof LocalCiExecutionError &&
      error.code === 'LOCAL_CI_INVALID_REQUEST',
  );
  assert.equal(executions.starts.length, 0);
});

test('normaliza indisponibilidade de act/docker antes de tentar executar', async () => {
  const executions = new FakeExecutions();
  const service = new LocalCiExecutionService(
    {
      discover: async () => ({
        ...catalog(),
        availability: { state: 'act-missing' as const },
      }),
    },
    executions,
    { createId: () => 'run-unavailable' },
  );

  await assert.rejects(
    service.start(project, request),
    (error: unknown) =>
      error instanceof LocalCiExecutionError &&
      error.code === 'LOCAL_CI_UNAVAILABLE',
  );
  assert.equal(executions.starts.length, 0);
});

test('normaliza falha do executor sem transportar erro bruto', async () => {
  const executions = new FakeExecutions();
  executions.start = () => {
    throw new Error('spawn /private/path secret=abc failed');
  };
  const service = createService(executions);

  await assert.rejects(
    service.start(project, request),
    (error: unknown) =>
      error instanceof LocalCiExecutionError &&
      error.code === 'LOCAL_CI_START_FAILED' &&
      !error.message.includes('secret') &&
      !error.message.includes('/private/path'),
  );
});

test('outcomes distinguem sucesso, falha e cancelamento mantendo exit code', async () => {
  const executions = new FakeExecutions();
  let sequence = 0;
  const service = createService(executions, {
    createId: () => `run-${++sequence}`,
  });
  const success = await service.start(project, request);
  executions.exit(`local-ci:${project.id}:${success.id}`, 0);
  assert.equal(service.get(project.id, success.id).outcome, 'success');

  const failure = await service.start(project, request);
  executions.exit(`local-ci:${project.id}:${failure.id}`, 2);
  assert.equal(service.get(project.id, failure.id).outcome, 'failure');

  const cancelled = await service.start(project, request);
  service.cancel(project.id, cancelled.id);
  executions.exit(`local-ci:${project.id}:${cancelled.id}`, 143);
  const snapshot = service.get(project.id, cancelled.id);
  assert.equal(snapshot.outcome, 'cancelled');
  assert.equal(snapshot.exitCode, 143);
  assert.equal(snapshot.status, 'exited');
});

test('reserva capacidade mesmo durante o discovery assíncrono', async () => {
  const executions = new FakeExecutions();
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const service = new LocalCiExecutionService(
    {
      discover: async () => {
        await barrier;
        return catalog();
      },
    },
    executions,
    { maxConcurrent: 1, createId: () => 'run-reserved' },
  );
  const pending = service.start(project, request);
  assert.deepEqual(service.capacity(), { running: 1, limit: 1, busy: true });
  await assert.rejects(
    service.start(project, request),
    (error: unknown) =>
      error instanceof LocalCiExecutionError && error.code === 'LOCAL_CI_BUSY',
  );
  assert.equal(executions.starts.length, 0);
  release();
  const started = await pending;
  assert.equal(executions.starts.length, 1);
  assert.equal(started.id, 'run-reserved');
});

test('Activity registra apenas start/terminal por run; Jobs some no exit mesmo após reattach', async () => {
  const executions = new FakeExecutions();
  const events: AppendActivityEventInput[] = [];
  const service = createService(executions, {
    activityEvents: {
      append: async (
        input: AppendActivityEventInput,
      ): Promise<ActivityEvent> => {
        events.push(input);
        return {} as ActivityEvent;
      },
    },
  });
  const run = await service.start(project, request);
  const key = `local-ci:${project.id}:${run.id}`;
  assert.equal(service.activityJobs(project.id).length, 1);
  assert.equal(service.activityJobs(project.id)[0]?.id, key);
  const attached = service.reattach(
    project.id,
    run.id,
    () => undefined,
    () => undefined,
  );
  assert.equal(executions.starts.length, 1);
  assert.equal(events.length, 1);

  executions.exit(key, 0);
  attached.detach();
  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((event) => event.status),
    ['started', 'succeeded'],
  );
  assert.equal(service.activityJobs(project.id).length, 0);
  assert.ok(events.every((event) => event.jobId === key));
  assert.ok(events.every((event) => event.resourceRef?.id === run.id));
  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes('secret-token'), false);
  assert.equal(serialized.includes('DATABASE_URL'), false);
  assert.equal(serialized.includes('GITHUB_TOKEN'), false);
  assert.equal(serialized.includes('--workflows'), false);
  assert.equal(serialized.includes('buffer'), false);
});
