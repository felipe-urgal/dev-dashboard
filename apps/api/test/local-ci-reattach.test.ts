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

class FakeExecutions {
  public starts = 0;
  private readonly snapshots = new Map<string, DetachableExecutionSnapshot>();
  private readonly dataListeners = new Map<
    string,
    Set<(chunk: string) => void>
  >();
  private readonly exitListeners = new Map<
    string,
    Set<(snapshot: DetachableExecutionSnapshot) => void>
  >();

  public start(_key: string, _options: StartExecutionOptions) {
    this.starts += 1;
    const snapshot: DetachableExecutionSnapshot = {
      status: 'running',
      buffer: 'buffer inicial\n',
      truncated: false,
      exitCode: null,
      exitSignal: null,
      startedAt: '2026-09-09T18:00:00.000Z',
      endedAt: null,
    };
    this.snapshots.set(_key, snapshot);
    return snapshot;
  }

  public attach(
    key: string,
    onData: (chunk: string) => void,
    onExit: (snapshot: DetachableExecutionSnapshot) => void,
  ): AttachHandle {
    const snapshot = this.snapshots.get(key);
    if (!snapshot) throw new Error('not found');
    const data = this.dataListeners.get(key) ?? new Set();
    const exits = this.exitListeners.get(key) ?? new Set();
    data.add(onData);
    exits.add(onExit);
    this.dataListeners.set(key, data);
    this.exitListeners.set(key, exits);
    return {
      snapshot,
      detach: () => {
        data.delete(onData);
        exits.delete(onExit);
      },
    };
  }

  public snapshotOf(key: string) {
    return this.snapshots.get(key);
  }

  public cancel(_key: string): void {}

  public emitData(key: string, chunk: string): void {
    for (const listener of this.dataListeners.get(key) ?? []) listener(chunk);
  }

  public exit(key: string): void {
    const current = this.snapshots.get(key)!;
    const snapshot: DetachableExecutionSnapshot = {
      ...current,
      status: 'exited',
      exitCode: 0,
      endedAt: '2026-09-09T18:01:00.000Z',
    };
    this.snapshots.set(key, snapshot);
    for (const listener of [...(this.exitListeners.get(key) ?? [])]) {
      listener(snapshot);
    }
  }
}

function createService(executions: FakeExecutions) {
  return new LocalCiExecutionService(
    {
      discover: async () => ({
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
      }),
    },
    executions,
    { createId: () => 'run-1', environment: { PATH: '/usr/bin' } },
  );
}

test('reattach acompanha o mesmo run sem iniciar outro act e preserva approximation', async () => {
  const executions = new FakeExecutions();
  const service = createService(executions);
  const run = await service.start(project, request);
  const chunks: string[] = [];
  let exitedApproximation: boolean | undefined;

  const attachment = service.reattach(
    project.id,
    run.id,
    (chunk) => chunks.push(chunk),
    (snapshot) => {
      exitedApproximation = snapshot.approximation;
    },
  );

  assert.equal(executions.starts, 1);
  assert.equal(attachment.snapshot.logs, 'buffer inicial\n');
  assert.equal(attachment.snapshot.approximation, true);

  const key = `local-ci:${project.id}:${run.id}`;
  executions.emitData(key, 'novo chunk\n');
  assert.deepEqual(chunks, ['novo chunk\n']);

  executions.exit(key);
  assert.equal(exitedApproximation, true);
  attachment.detach();
  service.shutdown();
});

test('reattach mantém ownership por projectId e não revela run de outro projeto', async () => {
  const executions = new FakeExecutions();
  const service = createService(executions);
  const run = await service.start(project, request);

  assert.throws(
    () =>
      service.reattach(
        'outro-projeto',
        run.id,
        () => undefined,
        () => undefined,
      ),
    (error: unknown) =>
      error instanceof LocalCiExecutionError &&
      error.code === 'LOCAL_CI_NOT_FOUND',
  );
  assert.equal(executions.starts, 1);
  service.shutdown();
});
