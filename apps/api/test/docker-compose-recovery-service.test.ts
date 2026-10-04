import assert from 'node:assert/strict';
import test from 'node:test';

import type { DevelopmentEnvironmentInstance, Project } from '@dev-dashboard/contracts';

import { DockerComposeRecoveryService } from '../src/services/docker-compose-recovery-service.js';

const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/project',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: [],
};

const instances: DevelopmentEnvironmentInstance[] = [
  {
    id: 'environment:primary:project-1',
    projectId: project.id,
    source: { kind: 'primary', path: project.path },
    runtime: { kind: 'host' },
    lifecycle: 'ready',
  },
  {
    id: 'environment:worktree:project-1:wt-1',
    projectId: project.id,
    source: {
      kind: 'worktree',
      path: '/workspace/project-wt',
      worktreeId: 'wt-1',
    },
    runtime: { kind: 'host' },
    lifecycle: 'ready',
  },
  {
    id: 'environment:worktree:project-1:wt-2',
    projectId: project.id,
    source: {
      kind: 'worktree',
      path: '/workspace/project-container',
      worktreeId: 'wt-2',
    },
    runtime: { kind: 'devcontainer', runtimeId: 'container-1' },
    lifecycle: 'ready',
  },
];

test('recovery Compose reconcilia somente Environment Instances host', async () => {
  const inspected: Project[] = [];
  const reconciled: string[] = [];
  const service = new DockerComposeRecoveryService(
    { findProject: () => project },
    { list: () => instances },
    {
      inspect: async (target) => {
        inspected.push(target);
        return {
          state: 'available' as const,
          observedAt: '2026-10-04T15:00:00.000Z',
          config: {
            projectName: target.id.startsWith('environment:worktree:')
              ? 'devdash-worktree'
              : 'project',
            observedAt: '2026-10-04T15:00:00.000Z',
            services: [],
            declaredPorts: [],
          },
          runtime: {
            observedAt: '2026-10-04T15:00:00.000Z',
            services: [],
          },
        };
      },
    },
    {
      reconcile: async (target) => {
        reconciled.push(target.id);
        return { state: 'unchanged' as const };
      },
    },
  );

  const result = await service.reconcile();

  assert.deepEqual(result, { inspected: 2, reconciled: 2, unavailable: 0 });
  assert.equal(inspected[0]?.id, project.id);
  assert.equal(inspected[1]?.id, 'environment:worktree:project-1:wt-1');
  assert.deepEqual(reconciled, [
    project.id,
    'environment:worktree:project-1:wt-1',
  ]);
});
