import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { DockerComposeLifecycleConfirmationService } from '../src/services/docker-compose-lifecycle-confirmation-service.js';
import {
  DockerComposeLifecycleExecutionError,
  DockerComposeLifecycleExecutionService,
} from '../src/services/docker-compose-lifecycle-execution-service.js';

const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/project',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: [],
};

test('lifecycle Compose vira job observável e preserva resultado unverified', async () => {
  const events: Array<{ status?: string; domain?: string }> = [];
  const confirmations = new DockerComposeLifecycleConfirmationService();
  const confirmation = confirmations.prepare(
    project.id,
    'environment:primary:project-1',
    'start',
  );
  const service = new DockerComposeLifecycleExecutionService(
    {
      start: async () => ({
        state: 'started-unverified' as const,
        preflight: {
          state: 'ready' as const,
          inspectedAt: '2026-10-04T15:00:00.000Z',
          conflicts: [],
        },
        diagnostic: 'Runtime parcial.',
      }),
      stop: async () => ({ state: 'stopped' as const }),
      restart: async () => ({ state: 'restarted' as const }),
    },
    confirmations,
    {
      append: async (input) => {
        events.push({ status: input.status, domain: input.domain });
        return input;
      },
    },
    () => new Date('2026-10-04T15:00:00.000Z'),
  );

  const queued = service.start(
    project.id,
    'environment:primary:project-1',
    project,
    'start',
    confirmation.token,
  );
  assert.equal(queued.status, 'queued');
  assert.equal(service.activityJobs(project.id).length, 1);

  await new Promise<void>((resolve) => setImmediate(resolve));

  const completed = service.latest(project.id, 'environment:primary:project-1');
  assert.equal(completed?.status, 'succeeded');
  assert.equal(completed?.resultState, 'started-unverified');
  assert.equal(completed?.diagnostic, 'Runtime parcial.');
  assert.equal(service.activityJobs(project.id).length, 0);
  assert.deepEqual(events, [
    { status: 'started', domain: 'compose' },
    { status: 'warning', domain: 'compose' },
  ]);
});

test('lifecycle Compose rejeita segunda mutação enquanto job está ativo', async () => {
  let release: (() => void) | undefined;
  const blocker = new Promise<void>((resolve) => {
    release = resolve;
  });
  const confirmations = new DockerComposeLifecycleConfirmationService();
  const service = new DockerComposeLifecycleExecutionService(
    {
      start: async () => {
        await blocker;
        return {
          state: 'started' as const,
          preflight: {
            state: 'ready' as const,
            inspectedAt: '2026-10-04T15:00:00.000Z',
            conflicts: [],
          },
        };
      },
      stop: async () => ({ state: 'stopped' as const }),
      restart: async () => ({ state: 'restarted' as const }),
    },
    confirmations,
  );

  const first = confirmations.prepare(
    project.id,
    'environment:primary:project-1',
    'start',
  );
  service.start(
    project.id,
    'environment:primary:project-1',
    project,
    'start',
    first.token,
  );
  await new Promise<void>((resolve) => setImmediate(resolve));

  const second = confirmations.prepare(
    project.id,
    'environment:primary:project-1',
    'stop',
  );
  assert.throws(
    () =>
      service.start(
        project.id,
        'environment:primary:project-1',
        project,
        'stop',
        second.token,
      ),
    (error: unknown) =>
      error instanceof DockerComposeLifecycleExecutionError &&
      error.code === 'COMPOSE_EXECUTION_ALREADY_RUNNING',
  );

  release?.();
  await new Promise<void>((resolve) => setImmediate(resolve));
});
