import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import {
  GitWorktreeObserver,
  parseGitWorktreePorcelain,
  type GitWorktreeCommandRunner,
} from '../src/services/git-worktree-observer.js';

const project: Project = {
  id: 'project-1',
  name: 'Projeto',
  path: '/workspace/projeto',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: ['git'],
};

const MAIN_HEAD = '1111111111111111111111111111111111111111';
const LINKED_HEAD = '2222222222222222222222222222222222222222';
const DETACHED_HEAD = '3333333333333333333333333333333333333333';

function porcelain(records: string[][]): string {
  return `${records.map((record) => record.join('\0')).join('\0\0')}\0\0`;
}

const records = [
  [
    'worktree /workspace/projeto',
    `HEAD ${MAIN_HEAD}`,
    'branch refs/heads/main',
  ],
  [
    'worktree /workspace/projeto-wt',
    `HEAD ${LINKED_HEAD}`,
    'branch refs/heads/feature/demo',
    'locked em uso pelo editor',
    'future-field ignored',
  ],
  [
    'worktree /workspace/projeto-old',
    `HEAD ${DETACHED_HEAD}`,
    'detached',
    'prunable gitdir file points to non-existent location',
  ],
];

test('normaliza main, linked, detached, locked e prunable sem depender de campo futuro', async () => {
  const calls: Array<{ projectPath: string; args: readonly string[] }> = [];
  const runner: GitWorktreeCommandRunner = async (projectPath, args) => {
    calls.push({ projectPath, args: [...args] });
    if (args[0] === 'rev-parse') return '/workspace/projeto/.git\n';
    return porcelain(records);
  };

  const result = await new GitWorktreeObserver(
    runner,
    () => new Date('2026-09-06T12:00:00.000Z'),
  ).inspect(project);

  assert.equal(result.state, 'ready');
  assert.equal(result.observedAt, '2026-09-06T12:00:00.000Z');
  assert.equal(result.worktrees.length, 3);

  const main = result.worktrees.find((item) => item.path === project.path);
  assert.equal(main?.kind, 'main');
  assert.equal(main?.branch, 'main');
  assert.equal(main?.detached, false);

  const linked = result.worktrees.find(
    (item) => item.path === '/workspace/projeto-wt',
  );
  assert.equal(linked?.kind, 'linked');
  assert.equal(linked?.branch, 'feature/demo');
  assert.equal(linked?.locked, true);
  assert.equal(linked?.lockReason, 'em uso pelo editor');

  const detached = result.worktrees.find(
    (item) => item.path === '/workspace/projeto-old',
  );
  assert.equal(detached?.detached, true);
  assert.equal(detached?.branch, undefined);
  assert.equal(detached?.prunable, true);

  assert.equal(calls.length, 2);
  assert.ok(
    calls.some(
      (call) =>
        call.projectPath === project.path &&
        call.args.join(' ') ===
          'rev-parse --path-format=absolute --git-common-dir',
    ),
  );
  assert.ok(
    calls.some(
      (call) =>
        call.projectPath === project.path &&
        call.args.join(' ') === 'worktree list --porcelain -z',
    ),
  );
});

test('identidade é estável mesmo se a ordem da saída e HEAD mudarem', async () => {
  const first = new GitWorktreeObserver(async (_projectPath, args) => {
    if (args[0] === 'rev-parse') return '/workspace/projeto/.git\n';
    return porcelain(records);
  });
  const changedRecords = [
    [
      'worktree /workspace/projeto-wt',
      'HEAD aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'branch refs/heads/feature/renamed',
    ],
    records[2]!,
    records[0]!,
  ];
  const second = new GitWorktreeObserver(async (_projectPath, args) => {
    if (args[0] === 'rev-parse') return '/workspace/projeto/.git\n';
    return porcelain(changedRecords);
  });

  const firstResult = await first.inspect(project);
  const secondResult = await second.inspect(project);
  const firstIds = new Map(
    firstResult.worktrees.map((item) => [item.path, item.id]),
  );
  const secondIds = new Map(
    secondResult.worktrees.map((item) => [item.path, item.id]),
  );

  assert.deepEqual(secondIds, firstIds);
});

test('saída estruturalmente inválida falha fechada', async () => {
  const parsed = parseGitWorktreePorcelain(
    project.path,
    porcelain([['worktree /workspace/projeto', 'branch refs/heads/main']]),
  );
  assert.equal(parsed, null);

  const result = await new GitWorktreeObserver(async (_projectPath, args) => {
    if (args[0] === 'rev-parse') return '/workspace/projeto/.git\n';
    return porcelain([['worktree /workspace/projeto', 'branch refs/heads/main']]);
  }).inspect(project);

  assert.equal(result.state, 'invalid-output');
  assert.deepEqual(result.worktrees, []);
});

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
