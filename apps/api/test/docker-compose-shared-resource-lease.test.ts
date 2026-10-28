import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { DockerComposeLifecycleService } from '../src/services/docker-compose-lifecycle-service.js';
import { ServiceResourceOperationLock } from '../src/services/service-resource-operation-lock.js';

const project: Project = {
  id: 'project-1',
  workspaceId: 'workspace-1',
  name: 'Project',
  path: '/fake/project-1',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: [],
};

function harness(stateDirectory: string) {
  let mutated = false;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let release!: () => void;
  const canFinish = new Promise<void>((resolve) => {
    release = resolve;
  });
  let commands = 0;
  const build = () =>
    new DockerComposeLifecycleService(
      {
        inspect: async () => ({
          state: 'available' as const,
          observedAt: new Date().toISOString(),
          config: {
            projectName: 'project-1',
            observedAt: new Date().toISOString(),
            services: [{ name: 'web', profiles: [], dependsOn: [], ports: [] }],
            declaredPorts: [],
          },
          runtime: {
            observedAt: new Date().toISOString(),
            services: mutated
              ? [
                  {
                    service: 'web',
                    state: 'running' as const,
                    health: 'healthy' as const,
                    ports: [],
                  },
                ]
              : [],
          },
        }),
      },
      {
        inspect: async () => ({
          state: 'ready' as const,
          inspectedAt: new Date().toISOString(),
          conflicts: [],
        }),
      },
      async () => {
        commands += 1;
        entered();
        await canFinish;
        mutated = true;
      },
      {
        resourceLock: new ServiceResourceOperationLock({ stateDirectory }),
        supportsWait: async () => false,
      },
    );
  return {
    build,
    started,
    release,
    commandCount: () => commands,
    releaseRoot: path.join(stateDirectory, 'service-resource-leases-v1'),
  };
}

test('independent Compose owners in the same state directory reject concurrent mutations', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'compose-shared-leases-'));
  try {
    const h = harness(dir);
    const first = h.build();
    const second = h.build();
    const operation = first.start(project, {}, 'web');
    await h.started;

    await assert.rejects(
      second.start(project, {}, 'web'),
      /already using one of these resources/,
    );
    await assert.rejects(
      second.stop(project, 'web'),
      /already using one of these resources/,
    );
    await assert.rejects(
      second.restart(project, 'web'),
      /already using one of these resources/,
    );
    assert.equal(h.commandCount(), 1);
    assert.equal(readdirSync(h.releaseRoot).length, 1);

    h.release();
    assert.equal((await operation).state, 'started');
    assert.deepEqual(readdirSync(h.releaseRoot), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
