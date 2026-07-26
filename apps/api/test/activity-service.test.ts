import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ManagedProcess, Project, ScriptExecution, ScriptExecutionHistory } from '@dev-dashboard/contracts';

import { ProjectStore } from '../src/store/project-store.js';
import { ActivityService } from '../src/services/activity-service.js';

type ScriptStub = { history: (projectId: string, page: number, pageSize: number) => Promise<ScriptExecutionHistory> };
type ProcessStub = { listProcesses: () => Promise<ManagedProcess[]> };

function buildProjects(): Project[] {
  return [
    { id: 'p1', name: 'alpha', path: '/p1', type: 'node', source: 'workspace', workspaceId: 'w1', favorite: false, capabilities: ['scripts'] },
    { id: 'p2', name: 'beta', path: '/p2', type: 'rails', source: 'workspace', workspaceId: 'w2', favorite: false, capabilities: ['server'] },
  ];
}

function primeStore(projects: Project[]): ProjectStore {
  const store = new ProjectStore();
  const byWorkspace = new Map<string, Project[]>();
  for (const project of projects) {
    const workspaceId = project.workspaceId ?? 'unknown';
    if (!byWorkspace.has(workspaceId)) byWorkspace.set(workspaceId, []);
    byWorkspace.get(workspaceId)!.push(project);
  }
  for (const [workspaceId, group] of byWorkspace) {
    store.saveWorkspaceScan({
      workspaceId,
      workspacePath: `/${workspaceId}`,
      projects: group,
      warnings: [],
    });
  }
  return store;
}

function script(id: string, projectId: string, startedAt: string, extras: Partial<ScriptExecution> = {}): ScriptExecution {
  return {
    id, projectId, actionId: `${id}-action`, actionName: `Script ${id}`,
    risk: 'read-only', status: 'succeeded', startedAt, ...extras,
  };
}

function managed(id: string, projectId: string, kind: 'server' | 'test', startedAt: string, extras: Partial<ManagedProcess> = {}): ManagedProcess {
  return { id, projectId, kind, status: 'running', startedAt, ...extras };
}

function makeService(scripts: Record<string, ScriptExecution[]>, processes: ManagedProcess[], projects: Project[]) {
  const store = primeStore(projects);
  const scriptStub: ScriptStub = {
    async history(projectId, page, pageSize) {
      const all = scripts[projectId] ?? [];
      const total = all.length;
      const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
      const start = (page - 1) * pageSize;
      return { items: all.slice(start, start + pageSize), page, pageSize, total, totalPages };
    },
  };
  const processStub: ProcessStub = { async listProcesses() { return processes; } };
  return new ActivityService(store, processStub as never, scriptStub as never);
}

test('aggregates script and process activities sorted by most recent', async () => {
  const projects = buildProjects();
  const service = makeService(
    {
      p1: [script('s1', 'p1', '2026-07-26T10:00:00Z', { status: 'succeeded', finishedAt: '2026-07-26T10:01:00Z' })],
    },
    [managed('proc1', 'p2', 'server', '2026-07-26T09:00:00Z')],
    projects,
  );
  const result = await service.list();
  assert.equal(result.total, 2);
  assert.equal(result.items[0]?.id, 'script:s1');
  assert.equal(result.items[0]?.origin, 'script');
  assert.equal(result.items[0]?.workspaceId, 'w1');
  assert.equal(result.items[1]?.origin, 'server');
});

test('filters by workspaceId, origin, status and paginates', async () => {
  const projects = buildProjects();
  const service = makeService(
    {
      p1: [
        script('a', 'p1', '2026-07-26T09:00:00Z', { status: 'failed' }),
        script('b', 'p1', '2026-07-26T08:00:00Z', { status: 'succeeded' }),
      ],
      p2: [script('c', 'p2', '2026-07-26T07:00:00Z', { status: 'succeeded' })],
    },
    [managed('srv', 'p2', 'server', '2026-07-26T06:00:00Z')],
    projects,
  );

  const w1 = await service.list({ workspaceId: 'w1' });
  assert.deepEqual(w1.items.map((item) => item.projectId), ['p1', 'p1']);

  const failedOnly = await service.list({ status: 'failed' });
  assert.equal(failedOnly.total, 1);
  assert.equal(failedOnly.items[0]?.status, 'failed');

  const scriptsOnly = await service.list({ origin: 'script' });
  assert.equal(scriptsOnly.items.every((item) => item.origin === 'script'), true);

  const paged = await service.list({ pageSize: 2, page: 2 });
  assert.equal(paged.pageSize, 2);
  assert.equal(paged.page, 2);
  assert.equal(paged.totalPages, 2);
  assert.equal(paged.items.length, 2);
});

test('ignores processes and scripts from unknown projects', async () => {
  const projects = buildProjects();
  const service = makeService(
    { p1: [script('s1', 'p1', '2026-07-26T10:00:00Z')] },
    [managed('ghost', 'p-missing', 'server', '2026-07-26T09:00:00Z')],
    projects,
  );
  const result = await service.list();
  assert.equal(result.total, 1);
  assert.equal(result.items[0]?.projectId, 'p1');
});

test('maps stopped processes to succeeded, failed or cancelled by exit code presence', async () => {
  const projects = buildProjects();
  const service = makeService(
    {},
    [
      managed('ok', 'p1', 'server', '2026-07-26T10:00:00Z', { status: 'stopped', exitCode: 0, stoppedAt: '2026-07-26T10:05:00Z' }),
      managed('bad', 'p2', 'server', '2026-07-26T09:00:00Z', { status: 'stopped', exitCode: 137, stoppedAt: '2026-07-26T09:05:00Z' }),
      managed('user', 'p1', 'test', '2026-07-26T08:00:00Z', { status: 'stopped', stoppedAt: '2026-07-26T08:05:00Z' }),
    ],
    projects,
  );
  const result = await service.list();
  const statusById = new Map(result.items.map((item) => [item.id, item.status]));
  assert.equal(statusById.get('server:ok'), 'succeeded');
  assert.equal(statusById.get('server:bad'), 'failed');
  assert.equal(statusById.get('test:user'), 'cancelled');
});

test('paginates across the entire script history, not only the first internal page', async () => {
  const projects = buildProjects();
  const executions = Array.from({ length: 150 }, (_, index) => {
    const sequence = String(index + 1).padStart(3, '0');
    const minute = String(index % 60).padStart(2, '0');
    const hour = String(Math.floor(index / 60)).padStart(2, '0');
    return script(`e${sequence}`, 'p1', `2026-07-25T${hour}:${minute}:00Z`);
  });
  const service = makeService({ p1: executions }, [], projects);

  const firstPage = await service.list({ pageSize: 100 });
  assert.equal(firstPage.total, 150);
  assert.equal(firstPage.totalPages, 2);
  assert.equal(firstPage.items.length, 100);
  assert.equal(firstPage.items[0]?.id, 'script:e150');

  const secondPage = await service.list({ pageSize: 100, page: 2 });
  assert.equal(secondPage.items.length, 50);
  assert.equal(secondPage.items[secondPage.items.length - 1]?.id, 'script:e001');
});
