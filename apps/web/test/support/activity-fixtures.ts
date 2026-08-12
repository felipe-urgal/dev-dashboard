import type { Project, Workspace } from '@dev-dashboard/contracts';

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
