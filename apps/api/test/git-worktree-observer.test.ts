import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { GitWorktreeObserver } from '../src/services/git-worktree-observer.js';

const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/projeto',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: ['git'],
};

test('falha do Git vira unavailable sem ecoar stderr ou path sensível', async () => {
  const observer = new GitWorktreeObserver(async () => {
    throw new Error('fatal /private/repo secret-token');
  });

  const result = await observer.inspect(project);
  const serialized = JSON.stringify(result);

  assert.equal(result.state, 'unavailable');
  assert.equal(serialized.includes('/private/repo'), false);
  assert.equal(serialized.includes('secret-token'), false);
});
