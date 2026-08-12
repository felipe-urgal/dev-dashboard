import type {
  Activity,
  ActivityList,
  Project,
  Workspace,
} from '@dev-dashboard/contracts';

export function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'w1',
    name: 'Workspace principal',
    path: '/home/dev/projects',
    enabled: true,
    recursiveScan: false,
    ...overrides,
  };
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'sample-node',
    path: '/home/dev/projects/sample-node',
    type: 'node',
    source: 'workspace',
    workspaceId: 'w1',
    enabled: true,
    capabilities: ['scripts'],
    ...overrides,
  };
}

export function makeScriptActivity(
  overrides: Partial<Activity> = {},
): Activity {
  return {
    id: 'script:exec-1',
    projectId: 'p1',
    workspaceId: 'w1',
    label: 'Rodar testes',
    origin: 'script',
    status: 'succeeded',
    startedAt: '2026-07-26T10:00:00Z',
    finishedAt: '2026-07-26T10:01:00Z',
    reference: { executionId: 'exec-1', actionId: 'npm-run-test' },
    ...overrides,
  } as Activity;
}

export function makeServerActivity(
  overrides: Partial<Activity> = {},
): Activity {
  return {
    id: 'server:proc-1',
    projectId: 'p1',
    workspaceId: 'w1',
    label: 'Servidor',
    origin: 'server',
    status: 'running',
    startedAt: '2026-07-26T09:00:00Z',
    reference: { processId: 'proc-1' },
    ...overrides,
  } as Activity;
}

export function makeActivityList(
  items: Activity[],
  overrides: Partial<ActivityList> = {},
): ActivityList {
  const summary = {
    running: items.filter((item) => item.status === 'running').length,
    succeeded: items.filter((item) => item.status === 'succeeded').length,
    failed: items.filter((item) => item.status === 'failed').length,
    total: items.length,
  };
  return {
    items,
    page: 1,
    pageSize: 20,
    total: items.length,
    totalPages: items.length === 0 ? 0 : 1,
    summary,
    ...overrides,
  };
}
