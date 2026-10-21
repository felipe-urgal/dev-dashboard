import { describe, expect, it, vi } from 'vitest';
import type { ActivityJob } from '@dev-dashboard/contracts';

const cancelAgentTask = vi.hoisted(() => vi.fn());
const cancelDeployment = vi.hoisted(() => vi.fn());
const cancelDevContainerLifecycleExecution = vi.hoisted(() => vi.fn());
vi.mock('../src/api/agent-runtime', () => ({ cancelAgentTask }));
vi.mock('../src/api/deployments', () => ({ cancelDeployment }));
vi.mock('../src/api/dev-container', () => ({
  cancelDevContainerLifecycleExecution,
}));
import {
  canCancelActivityJob,
  cancelActivityJob,
  resolveActivityResource,
} from '../src/utils/activity-resources';

const makeJob = (kind: string, cancelSupported = true): ActivityJob => ({
  id: 'job-1',
  projectId: 'project-1',
  domain: 'agent',
  action: 'run',
  status: 'running',
  resourceRef: { kind, id: 'resource-1' },
  environmentInstanceId: 'environment-1',
  cancelSupported,
});

describe('Activity resource registry', () => {
  it.each([
    ['agent-task', 'project-agent'],
    ['managed-process', 'project-server'],
    ['dev-container-lifecycle', 'project-dev-container'],
    ['deployment', 'project-production'],
    ['compose', 'project-compose'],
    ['compose-service', 'project-compose'],
    ['docker-compose-lifecycle', 'project-compose'],
    ['systemd-user-lifecycle', 'project-doctor'],
    ['systemd-user-unit', 'project-doctor'],
    ['stack-node', 'stacks'],
    ['migration-mutation', 'project-migrations'],
    ['local-ci', 'project-local-ci'],
    ['git-mutation', 'project-git'],
    ['test-execution', 'project-tests'],
  ])('resolves %s to %s', (kind, expected) => {
    expect(resolveActivityResource(makeJob(kind)).to?.name).toBe(expected);
  });
  it('routes systemd Activity to project-bound diagnostics with the exact unit', () => {
    const job = makeJob('systemd-user-unit');
    job.resourceRef = {
      kind: 'systemd-user-unit',
      id: 'systemd:user:fixture.service',
    };
    const resolved = resolveActivityResource(job);
    expect(resolved.to).toEqual({
      name: 'project-doctor',
      params: { projectId: 'project-1' },
      query: {
        environmentInstanceId: 'environment-1',
        serviceRef: 'systemd:user:fixture.service',
      },
    });
    expect(canCancelActivityJob(job)).toBe(false);
  });

  it('keeps confirmed lifecycle Job navigation scoped and non-cancellable', () => {
    for (const kind of ['docker-compose-lifecycle', 'systemd-user-lifecycle']) {
      const job = makeJob(kind, false);
      const resolved = resolveActivityResource(job);
      expect(resolved.to?.query?.environmentInstanceId).toBe('environment-1');
      expect(canCancelActivityJob(job)).toBe(false);
    }
  });

  it('does not silently navigate an unknown kind', () => {
    expect(resolveActivityResource(makeJob('future-kind'))).toEqual({
      known: false,
      label: 'Recurso desconhecido',
      to: null,
    });
  });
  it('never allows cancellation when cancelSupported is false', () => {
    expect(canCancelActivityJob(makeJob('agent-task', false))).toBe(false);
    expect(canCancelActivityJob(makeJob('managed-process', true))).toBe(true);
  });
  it('delegates cancellation only to the owning domain', async () => {
    cancelAgentTask.mockResolvedValue(undefined);
    cancelDeployment.mockResolvedValue(undefined);
    cancelDevContainerLifecycleExecution.mockResolvedValue(undefined);
    await cancelActivityJob(makeJob('agent-task'));
    await cancelActivityJob(makeJob('deployment'));
    await cancelActivityJob(makeJob('dev-container-lifecycle'));
    expect(cancelAgentTask).toHaveBeenCalledWith('project-1', 'resource-1');
    expect(cancelDeployment).toHaveBeenCalledWith('project-1', 'resource-1');
    expect(cancelDevContainerLifecycleExecution).toHaveBeenCalledWith(
      'project-1',
      'environment-1',
    );
  });
});
