import assert from 'node:assert/strict';
import test from 'node:test';

import type { ProcessLogSnapshot, Stack } from '@dev-dashboard/contracts';

import { StackLogsService } from '../src/services/stack-logs-service.js';

const stack: Stack = {
  id: 'local-stack',
  name: 'Local stack',
  nodes: [
    {
      id: 'api',
      name: 'API',
      target: {
        kind: 'process',
        projectId: 'api',
        environmentInstanceId: 'environment:primary:api',
        processId: 'server:api',
      },
    },
    {
      id: 'postgres',
      name: 'Postgres',
      target: {
        kind: 'compose-service',
        projectId: 'api',
        environmentInstanceId: 'environment:primary:api',
        service: 'postgres',
      },
    },
    {
      id: 'environment',
      name: 'Environment',
      target: {
        kind: 'environment',
        projectId: 'api',
        environmentInstanceId: 'environment:primary:api',
      },
    },
  ],
  dependencies: [],
};

function processLog(content: string): ProcessLogSnapshot {
  return {
    projectId: 'api',
    processId: 'server:api',
    content,
    sizeBytes: content.length,
    truncated: false,
    masked: true,
    redactionCount: 1,
    readAt: '2026-09-30T16:00:00.000Z',
  };
}

test('Stack logs agrega Process Manager e Compose sem criar novo owner', async () => {
  const service = new StackLogsService(
    {
      stackDefinitionService: { findById: () => stack },
      projectStore: {
        findProject: () => ({
          id: 'api',
          workspaceId: 'workspace-a',
          name: 'API',
          path: '/tmp/api',
          type: 'node',
          source: 'workspace',
          enabled: true,
          capabilities: ['server'],
        }),
      },
      developmentEnvironmentInstanceStore: {
        resolveForProject: () => ({
          projectId: 'api',
          environmentInstanceId: 'environment:primary:api',
          cwd: '/tmp/api',
          runtime: 'host',
        }),
      },
      dockerComposeLifecycleService: {
        logs: async () => ({
          content: 'postgres ready',
          truncated: false,
          masked: false,
          redactionCount: 0,
          readAt: '2026-09-30T16:00:00.000Z',
        }),
      },
      processManager: {
        listProcesses: async () => [
          {
            id: 'server:api',
            projectId: 'api',
            environmentInstanceId: 'environment:primary:api',
            kind: 'server',
            status: 'running',
          },
        ],
        readServerLog: async () => processLog('token=[REDACTED]'),
        readWorkerLog: async () => {
          throw new Error('unexpected worker read');
        },
        readTestLog: async () => {
          throw new Error('unexpected test read');
        },
      },
    },
    { now: () => new Date('2026-09-30T16:00:00.000Z') },
  );

  const result = await service.read('local-stack');

  assert.equal(result.stackId, 'local-stack');
  assert.deepEqual(
    result.nodes.map((node) => [node.nodeId, node.state, node.source]),
    [
      ['api', 'available', 'process'],
      ['postgres', 'available', 'compose'],
      ['environment', 'unsupported', 'none'],
    ],
  );
  assert.equal(result.nodes[0]?.masked, true);
  assert.equal(result.nodes[0]?.redactionCount, 1);
  assert.equal(result.nodes[1]?.content, 'postgres ready');
});

test('Stack logs isola falhas por node e recusa ownership divergente', async () => {
  const service = new StackLogsService({
    stackDefinitionService: { findById: () => stack },
    projectStore: { findProject: () => undefined },
    developmentEnvironmentInstanceStore: {
      resolveForProject: () => undefined,
    },
    dockerComposeLifecycleService: {
      logs: async () => {
        throw new Error('should not run');
      },
    },
    processManager: {
      listProcesses: async () => [
        {
          id: 'server:api',
          projectId: 'other-project',
          environmentInstanceId: 'environment:primary:api',
          kind: 'server',
          status: 'running',
        },
      ],
      readServerLog: async () => {
        throw new Error('should not run');
      },
      readWorkerLog: async () => {
        throw new Error('should not run');
      },
      readTestLog: async () => {
        throw new Error('should not run');
      },
    },
  });

  const result = await service.read('local-stack');

  assert.equal(result.nodes[0]?.state, 'unavailable');
  assert.match(result.nodes[0]?.diagnostic ?? '', /ownership/);
  assert.equal(result.nodes[1]?.state, 'unavailable');
  assert.equal(result.nodes[2]?.state, 'unsupported');
});
