import assert from 'node:assert/strict';
import test from 'node:test';

import { AgentRuntimeRealtimeService } from '../src/services/agent-runtime-realtime-service.js';

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

test('Agent realtime entrega snapshot inicial, deduplica e faz detach sem cancelar runtime', async () => {
  let version = 1;
  const calls: string[] = [];
  const reader = {
    status: async (projectId: string, taskId: string) => {
      calls.push(`status:${projectId}:${taskId}`);
      return {
        task: {
          task: {
            id: taskId,
            projectId,
            state: version === 1 ? ('queued' as const) : ('running' as const),
            summary: 'x',
            requestedCapabilities: [],
            createdAt: '2026-09-23T12:00:00.000Z',
            updatedAt: '2026-09-23T12:00:00.000Z',
          },
          version,
        },
        runtime: {
          taskId,
          projectId,
          canonicalVersion: version,
          state: version === 1 ? ('idle' as const) : ('running' as const),
          attempts: version - 1,
          updatedAt: '2026-09-23T12:00:00.000Z',
        },
      };
    },
    activity: async () => {
      calls.push('activity');
      return {
        authorizations: [],
        events: [],
        evidence: [],
      };
    },
  };

  const service = new AgentRuntimeRealtimeService(reader, { intervalMs: 100 });
  const updates: unknown[] = [];
  const errors: unknown[] = [];

  const attachment = await service.attach(
    'project-1',
    'task-1',
    (snapshot) => updates.push(snapshot),
    (error) => errors.push(error),
  );

  assert.equal(attachment.snapshot.status.task.version, 1);
  await sleep(130);
  assert.equal(updates.length, 0);

  version = 2;
  await sleep(130);
  assert.equal(updates.length, 1);
  assert.equal(
    (updates[0] as { status: { task: { version: number } } }).status.task
      .version,
    2,
  );

  attachment.detach();
  version = 3;
  await sleep(130);
  assert.equal(updates.length, 1);
  assert.deepEqual(errors, []);
  assert.ok(calls.length >= 4);

  service.close();
});

test('Agent realtime shutdown desconecta feeds sem mutar task', async () => {
  let reads = 0;
  const reader = {
    status: async () => {
      reads += 1;
      return {
        task: {
          task: {
            id: 'task-1',
            projectId: 'project-1',
            state: 'queued' as const,
            summary: 'x',
            requestedCapabilities: [],
            createdAt: '2026-09-23T12:00:00.000Z',
            updatedAt: '2026-09-23T12:00:00.000Z',
          },
          version: 1,
        },
        runtime: {
          taskId: 'task-1',
          projectId: 'project-1',
          canonicalVersion: 1,
          state: 'idle' as const,
          attempts: 0,
          updatedAt: '2026-09-23T12:00:00.000Z',
        },
      };
    },
    activity: async () => ({
      authorizations: [],
      events: [],
      evidence: [],
    }),
  };

  const service = new AgentRuntimeRealtimeService(reader, { intervalMs: 100 });
  await service.attach(
    'project-1',
    'task-1',
    () => undefined,
    () => undefined,
  );
  assert.equal(reads, 1);

  service.close();
  await sleep(130);
  assert.equal(reads, 1);

  await assert.rejects(
    service.attach(
      'project-1',
      'task-1',
      () => undefined,
      () => undefined,
    ),
    /closed/,
  );
});
