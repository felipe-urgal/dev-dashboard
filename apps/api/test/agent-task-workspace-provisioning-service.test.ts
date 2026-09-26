import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import {
  AgentTaskWorkspaceProvisioningService,
  agentTaskWorkspaceNames,
} from '../src/services/agent-task-workspace-provisioning-service.js';

const project = {
  id: 'project-1',
  name: 'Dev Dashboard',
  path: '/workspace/dev-dashboard',
} as Project;

test('AgentTaskWorkspaceProvisioningService deriva branch e diretório determinísticos', () => {
  assert.deepEqual(
    agentTaskWorkspaceNames(project, {
      issueNumber: 897,
      issueTitle: 'Provisionar branch, worktree e ambiente isolado',
    }),
    {
      branch: 'feature/897-provisionar-branch-worktree-e-ambiente-isolado',
      directoryName: 'dev-dashboard-agent-897',
    },
  );
});

test('AgentTaskWorkspaceProvisioningService cria e reconcilia Environment Instance owned', async () => {
  const createCalls: unknown[] = [];
  const service = new AgentTaskWorkspaceProvisioningService(
    {
      create: async (_project, input) => {
        createCalls.push(input);
        return {
          state: 'created',
          branch: input.branch,
          path: '/workspace/dev-dashboard-agent-897',
          worktree: {
            id: 'worktree-0123456789abcdefabcd',
            path: '/workspace/dev-dashboard-agent-897',
            head: 'a'.repeat(40),
            branch: input.branch,
            detached: false,
            bare: false,
            kind: 'linked',
            locked: false,
            prunable: false,
          },
        };
      },
    },
    {
      inspect: async () => ({
        state: 'ready',
        projectId: project.id,
        observedAt: '2026-09-26T15:00:00.000Z',
        worktrees: [
          {
            id: 'worktree-0123456789abcdefabcd',
            path: '/workspace/dev-dashboard-agent-897',
            head: 'a'.repeat(40),
            branch:
              'feature/897-provisionar-branch-worktree-e-ambiente-isolado',
            detached: false,
            bare: false,
            kind: 'linked',
            locked: false,
            prunable: false,
          },
        ],
      }),
    },
    {
      reconcileWorktrees: () => [
        {
          id: 'environment:worktree:project-1:worktree-0123456789abcdefabcd',
          projectId: 'project-1',
          source: {
            kind: 'worktree',
            path: '/workspace/dev-dashboard-agent-897',
            worktreeId: 'worktree-0123456789abcdefabcd',
          },
          runtime: { kind: 'host' },
          lifecycle: 'ready',
        },
      ],
    },
  );

  const result = await service.provision(project, {
    issueNumber: 897,
    issueTitle: 'Provisionar branch, worktree e ambiente isolado',
  });

  assert.equal(result.state, 'ready');
  assert.equal(
    result.environmentInstanceId,
    'environment:worktree:project-1:worktree-0123456789abcdefabcd',
  );
  assert.equal(result.reused, false);
  assert.deepEqual(createCalls, [
    {
      branch: 'feature/897-provisionar-branch-worktree-e-ambiente-isolado',
      directoryName: 'dev-dashboard-agent-897',
      createBranch: true,
      reuseBranch: true,
    },
  ]);
});

test('AgentTaskWorkspaceProvisioningService reutiliza worktree confirmado em recovery', async () => {
  const service = new AgentTaskWorkspaceProvisioningService(
    {
      create: async (_project, input) => ({
        state: 'already-present',
        branch: input.branch,
        path: '/workspace/dev-dashboard-agent-897',
        worktree: {
          id: 'worktree-0123456789abcdefabcd',
          path: '/workspace/dev-dashboard-agent-897',
          head: 'a'.repeat(40),
          branch: input.branch,
          detached: false,
          bare: false,
          kind: 'linked',
          locked: false,
          prunable: false,
        },
      }),
    },
    {
      inspect: async () => ({
        state: 'ready',
        projectId: project.id,
        observedAt: '2026-09-26T15:00:00.000Z',
        worktrees: [
          {
            id: 'worktree-0123456789abcdefabcd',
            path: '/workspace/dev-dashboard-agent-897',
            head: 'a'.repeat(40),
            branch:
              'feature/897-provisionar-branch-worktree-e-ambiente-isolado',
            detached: false,
            bare: false,
            kind: 'linked',
            locked: false,
            prunable: false,
          },
        ],
      }),
    },
    {
      reconcileWorktrees: () => [
        {
          id: 'environment:worktree:project-1:worktree-0123456789abcdefabcd',
          projectId: 'project-1',
          source: {
            kind: 'worktree',
            path: '/workspace/dev-dashboard-agent-897',
            worktreeId: 'worktree-0123456789abcdefabcd',
          },
          runtime: { kind: 'host' },
          lifecycle: 'ready',
        },
      ],
    },
  );

  const result = await service.provision(project, {
    issueNumber: 897,
    issueTitle: 'Provisionar branch, worktree e ambiente isolado',
  });

  assert.equal(result.state, 'ready');
  assert.equal(result.reused, true);
});

test('AgentTaskWorkspaceProvisioningService preserva colisão detectada pelo lifecycle', async () => {
  const service = new AgentTaskWorkspaceProvisioningService(
    {
      create: async (_project, input) => ({
        state: 'blocked',
        branch: input.branch,
        path: '/workspace/dev-dashboard-agent-897',
        diagnostic: 'A branch já está vinculada a outro worktree.',
      }),
    },
    {
      inspect: async () => {
        throw new Error('should not inspect');
      },
    },
    {
      reconcileWorktrees: () => {
        throw new Error('should not reconcile');
      },
    },
  );

  const result = await service.provision(project, {
    issueNumber: 897,
    issueTitle: 'Provisionar branch, worktree e ambiente isolado',
  });

  assert.equal(result.state, 'blocked');
  assert.equal(
    result.diagnostic,
    'A branch já está vinculada a outro worktree.',
  );
});
