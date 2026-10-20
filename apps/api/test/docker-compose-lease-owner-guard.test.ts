import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { DockerComposeLifecycleService } from '../src/services/docker-compose-lifecycle-service.js';
import type {
  ServiceResourceOperationLock,
  ServiceResourceLeaseGuard,
} from '../src/services/service-resource-operation-lock.js';

const project: Project = {
  id: 'project-1',
  workspaceId: 'workspace-1',
  name: 'Project',
  path: '/no-real-compose',
  source: 'workspace',
  type: 'node',
  enabled: true,
  capabilities: [],
};
const observedAt = '2026-10-20T12:00:00.000Z';

for (const action of ['start', 'stop', 'restart'] as const) {
  test(
    'Compose ' +
      action +
      ' refuses to dispatch after losing its lease during preflight',
    async () => {
      let commandCount = 0;
      let checkCount = 0;
      const lock: Pick<ServiceResourceOperationLock, 'withResources'> = {
        withResources: async <T>(
          resourceKeys: readonly string[],
          operation: (guard: ServiceResourceLeaseGuard) => Promise<T>,
        ): Promise<T> => {
          assert.deepEqual(resourceKeys, ['compose-project:' + project.id]);
          const guard: ServiceResourceLeaseGuard = {
            assertOwned: async () => {
              checkCount += 1;
              // Simulate lease replacement after an earlier asynchronous
              // observation and before the provider-owned command is dispatched.
              if (checkCount > 1) throw new Error('resource lease revoked');
            },
          };
          await guard.assertOwned();
          return operation(guard);
        },
      };
      const service = new DockerComposeLifecycleService(
        {
          inspect: async () => ({
            state: 'available' as const,
            observedAt,
            config: {
              projectName: 'project-1',
              observedAt,
              services: [
                { name: 'web', dependsOn: [], profiles: [], ports: [] },
              ],
              declaredPorts: [],
            },
            runtime: {
              observedAt,
              services:
                action === 'start'
                  ? []
                  : [
                      {
                        service: 'web',
                        state: 'running' as const,
                        health: 'healthy' as const,
                        ports: [],
                      },
                    ],
            },
          }),
        },
        {
          inspect: async () => ({
            state: 'ready' as const,
            inspectedAt: observedAt,
            conflicts: [],
          }),
        },
        async () => {
          commandCount += 1;
        },
        {
          resourceLock: lock,
          ownershipStore: {
            get: async () => ({
              projectId: project.id,
              projectPath: project.path,
              composeProjectName: 'project-1',
              startedAt: observedAt,
            }),
            claim: async () => {
              throw new Error('not expected');
            },
            release: async () => false,
          },
          supportsWait: async () => false,
        },
      );
      const invocation =
        action === 'start'
          ? service.start(project, {}, 'web')
          : action === 'stop'
            ? service.stop(project, 'web')
            : service.restart(project, 'web');
      await assert.rejects(invocation, /resource lease revoked/);
      assert.equal(commandCount, 0);
      assert.equal(checkCount, 2);
    },
  );
}
