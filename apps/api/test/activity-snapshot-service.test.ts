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
import type { AgentRuntimeApiServicePort } from '../src/services/agent-runtime-api-service.js';

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
    agentRuntime?: Pick<
      AgentRuntimeApiServicePort,
      'listTasks' | 'status' | 'activity'
    >;
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
    ...(overrides.agentRuntime ? { agentRuntime: overrides.agentRuntime } : {}),
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

test('agrega Agent job sanitizado com contexto, provider, stage e cancelamento suportado', async () => {
  const agentRuntime: Pick<
    AgentRuntimeApiServicePort,
    'listTasks' | 'status' | 'activity'
  > = {
    listTasks: async () => [
      {
        version: 4,
        task: {
          id: 'agent-task-1',
          projectId: project.id,
          environmentInstanceId: 'environment:worktree:project-a:wt-agent',
          taskContextId: 'context-agent-1',
          state: 'running',
          summary: 'PROMPT-SECRETO não pode entrar no agregado',
          requestedCapabilities: ['workspace:write'],
          createdAt: '2026-09-19T10:01:00.000Z',
          updatedAt: '2026-09-19T10:05:30.000Z',
        },
      },
    ],
    status: async () => ({
      task: {
        version: 4,
        task: {
          id: 'agent-task-1',
          projectId: project.id,
          environmentInstanceId: 'environment:worktree:project-a:wt-agent',
          taskContextId: 'context-agent-1',
          state: 'running',
          summary: 'PROMPT-SECRETO não pode entrar no agregado',
          requestedCapabilities: ['workspace:write'],
          createdAt: '2026-09-19T10:01:00.000Z',
          updatedAt: '2026-09-19T10:05:30.000Z',
        },
      },
      runtime: {
        taskId: 'agent-task-1',
        projectId: project.id,
        canonicalVersion: 4,
        state: 'running',
        executionId: 'execution-1',
        attempts: 2,
        startedAt: '2026-09-19T10:05:00.000Z',
        updatedAt: '2026-09-19T10:05:30.000Z',
      },
      activeExecution: {
        projectId: project.id,
        taskId: 'agent-task-1',
        executionId: 'execution-1',
        environmentInstanceId: 'environment:worktree:project-a:wt-agent',
      },
    }),
    activity: async () => ({
      authorizations: [],
      checkpoints: [],
      events: [
        {
          id: 'agent-event-1',
          taskId: 'agent-task-1',
          executionId: 'execution-1',
          providerId: 'codex',
          type: 'execution-state',
          summary: 'Provider output that must stay in Agent domain.',
          occurredAt: '2026-09-19T10:05:20.000Z',
        },
      ],
      evidence: [],
    }),
  };

  const snapshot = await createService({ agentRuntime }).readProject(
    project.id,
  );
  const job = snapshot.jobs.find((item) => item.id === 'agent:agent-task-1');

  assert.ok(job);
  assert.equal(job.domain, 'agent');
  assert.equal(job.action, 'Agent task');
  assert.equal(job.status, 'running');
  assert.equal(
    job.environmentInstanceId,
    'environment:worktree:project-a:wt-agent',
  );
  assert.equal(job.taskContextId, 'context-agent-1');
  assert.equal(job.providerId, 'codex');
  assert.equal(job.stage, 'running');
  assert.equal(job.cancelSupported, true);
  assert.deepEqual(job.resourceRef, {
    kind: 'agent-task',
    id: 'agent-task-1',
  });

  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes('PROMPT-SECRETO'), false);
  assert.equal(serialized.includes('Provider output that must stay'), false);
});

test('falha do Agent degrada somente o domínio agent sem derrubar outros jobs', async () => {
  const agentRuntime: Pick<
    AgentRuntimeApiServicePort,
    'listTasks' | 'status' | 'activity'
  > = {
    listTasks: async () => {
      throw new Error('agent store unavailable');
    },
    status: async () => {
      throw new Error('unused');
    },
    activity: async () => {
      throw new Error('unused');
    },
  };

  const snapshot = await createService({ agentRuntime }).readProject(
    project.id,
  );

  assert.equal(snapshot.partial, true);
  assert.equal(snapshot.unavailableDomains.includes('agent'), true);
  assert.equal(
    snapshot.jobs.some((job) => job.id === 'process:process-1'),
    true,
  );
  assert.equal(
    snapshot.jobs.some((job) => job.id === 'script:script-1'),
    true,
  );
});
