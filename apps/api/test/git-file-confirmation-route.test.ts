import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import { gitMutationRoutes } from '../src/routes/git-mutations.js';
import { GitService } from '../src/services/git-service.js';

test('accepts destructive file operations in mutation confirmations', async () => {
  const app = Fastify();
  await app.register(gitMutationRoutes, {
    projectStore: {
      findProject: (projectId: string) => ({
        id: projectId,
        name: 'Projeto',
        path: '/tmp/project',
        workspaceId: 'workspace',
        workspacePath: '/tmp',
        relativePath: 'project',
        stack: 'node',
        capabilities: [],
        metadata: {},
      }),
      listProjects: () => [],
    } as never,
    gitService: new GitService(),
  });

  try {
    for (const operation of [
      'discard-file',
      'remove-untracked-file',
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/projects/project/git/mutations/confirmations',
        payload: {
          operation,
          target: 'db/schema.rb',
        },
      });

      assert.equal(response.statusCode, 201);
      assert.equal(response.json().confirmation.operation, operation);
      assert.equal(
        response.json().confirmation.target,
        'db/schema.rb',
      );
    }
  } finally {
    await app.close();
  }
});
