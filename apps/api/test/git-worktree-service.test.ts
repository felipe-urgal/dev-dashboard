import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import {
  GitWorktreeService,
  parseGitWorktreeList,
  type GitWorktreeCommandRunner,
} from '../src/services/git-worktree-service.js';

const NOW = new Date('2026-09-06T13:00:00.000Z');
const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/projeto',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: [],
};

const payload = [
  'worktree /workspace/projeto',
  'HEAD 1111111111111111111111111111111111111111',
  'branch refs/heads/main',
  '',
  'worktree /workspace/.worktrees/feature-570',
  'HEAD 2222222222222222222222222222222222222222',
  'branch refs/heads/feature/570-worktree-observer',
  'locked agente em execução',
  '',
  'worktree /workspace/.worktrees/detached',
  'HEAD 3333333333333333333333333333333333333333',
  'detached',
  'prunable gitdir file points to non-existent location',
  '',
].join('\0');

test('normaliza worktree principal, branch ocupada e estado detached', () => {
  const result = parseGitWorktreeList(payload);

  assert.equal(result.truncated, false);
  assert.equal(result.worktrees.length, 3);
  assert.deepEqual(result.worktrees[0], {
    id: result.worktrees[0]?.id,
    path: '/workspace/projeto',
    head: '1111111111111111111111111111111111111111',
    branch: 'main',
    main: true,
    detached: false,
    bare: false,
    locked: false,
    prunable: false,
  });
  assert.match(result.worktrees[0]?.id ?? '', /^worktree-[0-9a-f]{20}$/u);
  assert.equal(result.worktrees[1]?.branch, 'feature/570-worktree-observer');
  assert.equal(result.worktrees[1]?.locked, true);
  assert.equal(result.worktrees[1]?.lockReason, 'agente em execução');
  assert.equal(result.worktrees[2]?.detached, true);
  assert.equal(result.worktrees[2]?.branch, undefined);
  assert.equal(result.worktrees[2]?.prunable, true);
});

test('executa somente git worktree list estruturado no cwd conhecido', async () => {
  const calls: Array<{ path: string; args: readonly string[] }> = [];
  const runner: GitWorktreeCommandRunner = async (projectPath, args) => {
    calls.push({ path: projectPath, args: [...args] });
    return payload;
  };

  const result = await new GitWorktreeService(runner, () => NOW).inspect(
    project,
  );

  assert.equal(result.status, 'ready');
  assert.equal(result.observedAt, NOW.toISOString());
  assert.deepEqual(calls, [
    {
      path: project.path,
      args: ['worktree', 'list', '--porcelain', '-z'],
    },
  ]);
});

test('falha de Git retorna estado indisponível sem ecoar erro bruto', async () => {
  const runner: GitWorktreeCommandRunner = async () => {
    throw new Error('fatal: token=/segredo/path');
  };

  const result = await new GitWorktreeService(runner, () => NOW).inspect(
    project,
  );

  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.worktrees, []);
  assert.equal(JSON.stringify(result).includes('/segredo/path'), false);
});

test('identidade permanece estável quando a branch do mesmo path muda', () => {
  const before = parseGitWorktreeList(
    ['worktree /workspace/projeto', 'branch refs/heads/main', ''].join('\0'),
  );
  const after = parseGitWorktreeList(
    ['worktree /workspace/projeto', 'branch refs/heads/feature/nova', ''].join(
      '\0',
    ),
  );

  assert.equal(before.worktrees[0]?.id, after.worktrees[0]?.id);
});
