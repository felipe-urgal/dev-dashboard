import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ActivityEvent,
  GitMutationHistoryPage,
  ManagedProcess,
  Project,
  ScriptExecutionHistory,
  TestExecutionHistory,
} from '@dev-dashboard/contracts';

import {
  ActivitySnapshotService,
  ActivitySnapshotServiceError,
} from '../src/services/activity-snapshot-service.js';

const project: Project = {
  id: 'project-a',
  name: 'Project A',
  path: '/workspace/project-a',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: ['git', 'tests', 'scripts'],
};

const storedEvent: ActivityEvent = {
  id: 'stored-1',
  projectId: project.id,
  domain: 'database',
  type: 'database.snapshot',
  status: 'succeeded',
  summary: 'Snapshot concluído',
  occurredAt: '2026-09-19T10:04:00.000Z',
};

const gitHistory: GitMutationHistoryPage = {
  projectId: project.id,
  page: 1,
  pageSize: 50,
  total: 1,
  totalPages: 1,
  events: [
    {
      id: 'git-1',
      projectId: project.id,
      operationId: 'push',
      risk: 'write-remote',
      occurredAt: '2026-09-19T10:03:00.000Z',
      result: 'succeeded',
    },
  ],
};

const testHistory: TestExecutionHistory = {
  items: [
    {
      id: 'test-1',
      projectId: project.id,
      commandId: 'unit',
      environmentInstanceId: 'environment:worktree:project-a:wt-1',
      status: 'stopped',
      startedAt: '2026-09-19T10:00:00.000Z',
      finishedAt: '2026-09-19T10:02:00.000Z',
      exitCode: 0,
    },
  ],
  page: 1,
  pageSize: 50,
  total: 1,
  totalPages: 1,
};

const scriptHistory: ScriptExecutionHistory = {
  items: [
    {
      id: 'script-1',
      projectId: project.id,
      actionId: 'build',
      actionName: 'Build app',
      risk: 'mutable',
      status: 'running',
      startedAt: '2026-09-19T10:05:00.000Z',
    },
  ],
  page: 1,
  pageSize: 50,
  total: 1,
  totalPages: 1,
};

const processes: ManagedProcess[] = [
  {
    id: 'process-1',
    projectId: project.id,
    environmentInstanceId: 'environment:worktree:project-a:wt-1',
    kind: 'test',
    status: 'running',
    command: 'npm',
    args: ['test', '--token=secret'],
    cwd: '/workspace/private',
    startedAt: '2026-09-19T10:01:00.000Z',
  },
  {
    id: 'other',
    projectId: 'project-b',
    kind: 'server',
    status: 'running',
  },
];

function createService(
  overrides: {
    gitHistory?: () => Promise<GitMutationHistoryPage>;
    testHistory?: () => Promise<TestExecutionHistory>;
    scriptHistory?: () => Promise<ScriptExecutionHistory>;
    processes?: () => Promise<ManagedProcess[]>;
  } = {},
) {
  return new ActivitySnapshotService({
    eventStore: {
      list: () => [storedEvent],
    },
    gitHistory: {
      history: overrides.gitHistory ?? (async () => gitHistory),
    },
    testHistory: {
      history: overrides.testHistory ?? (async () => testHistory),
    },
    scriptHistory: {
      history: overrides.scriptHistory ?? (async () => scriptHistory),
    },
    processReader: {
      listProcesses: overrides.processes ?? (async () => processes),
    },
    projectStore: {
      findProject: (id) => (id === project.id ? project : null),
      listProjects: () => [project],
    },
    now: () => new Date('2026-09-19T10:06:00.000Z'),
  });
}

test('agrega timeline e jobs sem expor cwd, argv ou logs', async () => {
  const snapshot = await createService().readProject(project.id);

  assert.equal(snapshot.partial, false);
  assert.deepEqual(snapshot.unavailableDomains, []);
  assert.equal(snapshot.generatedAt, '2026-09-19T10:06:00.000Z');
  assert.equal(snapshot.events[0]?.id, 'script:script-1');
  assert.equal(
    snapshot.events.some((event) => event.id === 'stored-1'),
    true,
  );
  assert.equal(
    snapshot.events.some((event) => event.id === 'git:git-1'),
    true,
  );

  const testJob = snapshot.jobs.find((job) => job.id === 'process:process-1');
  assert.equal(
    testJob?.environmentInstanceId,
    'environment:worktree:project-a:wt-1',
  );
  assert.equal(testJob?.domain, 'test');
  assert.equal(
    snapshot.jobs.some((job) => job.id === 'script:script-1'),
    true,
  );

  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes('/workspace/private'), false);
  assert.equal(serialized.includes('--token=secret'), false);
});

test('falha de um domínio degrada o snapshot sem derrubar os demais', async () => {
  const service = createService({
    gitHistory: async () => {
      throw new Error('provider unavailable');
    },
  });

  const snapshot = await service.readProject(project.id);

  assert.equal(snapshot.partial, true);
  assert.deepEqual(snapshot.unavailableDomains, ['git']);
  assert.equal(
    snapshot.events.some((event) => event.domain === 'test'),
    true,
  );
  assert.equal(
    snapshot.events.some((event) => event.domain === 'script'),
    true,
  );
});

test('limita eventos e rejeita projeto inexistente', async () => {
  const service = createService();
  const snapshot = await service.readProject(project.id, 2);
  assert.equal(snapshot.events.length, 2);

  await assert.rejects(
    service.readProject('missing'),
    (error) =>
      error instanceof ActivitySnapshotServiceError &&
      error.code === 'ACTIVITY_PROJECT_NOT_FOUND',
  );
});

test('agrega visão global reutilizando uma única leitura de processos', async () => {
  let processReads = 0;
  const service = createService({
    processes: async () => {
      processReads += 1;
      return processes;
    },
  });

  const snapshot = await service.readGlobal(10);

  assert.equal(processReads, 1);
  assert.equal(snapshot.partial, false);
  assert.equal(
    snapshot.events.some((event) => event.id === 'git:git-1'),
    true,
  );
  assert.equal(
    snapshot.jobs.some((job) => job.id === 'process:process-1'),
    true,
  );
});
