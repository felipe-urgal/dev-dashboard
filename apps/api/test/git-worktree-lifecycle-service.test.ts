import assert from 'node:assert/strict';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import {
  GitWorktreeLifecycleService,
  type CreateGitWorktreeInput,
} from '../src/services/git-worktree-lifecycle-service.js';
import type { GitWorktreeCommandRunner } from '../src/services/git-worktree-observer.js';

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

function porcelain(records: string[][]): string {
  return `${records.map((record) => record.join('\0')).join('\0\0')}\0\0`;
}

function mainRecord(): string[] {
  return [
    'worktree /workspace/projeto',
    `HEAD ${MAIN_HEAD}`,
    'branch refs/heads/main',
  ];
}

function linkedRecord(path: string, branch: string): string[] {
  return [
    `worktree ${path}`,
    `HEAD ${LINKED_HEAD}`,
    `branch refs/heads/${branch}`,
  ];
}

function createRunner(options: {
  existing?: Array<{ path: string; branch: string }>;
  failAdd?: boolean;
}) {
  const calls: string[][] = [];
  let created: { path: string; branch: string } | undefined;

  const runner: GitWorktreeCommandRunner = async (_projectPath, args) => {
    calls.push([...args]);

    if (args[0] === 'rev-parse') return '/workspace/projeto/.git\n';
    if (args[0] === 'check-ref-format') return `${args[2]}\n`;
    if (args[0] === 'worktree' && args[1] === 'list') {
      const linked = [
        ...(options.existing ?? []),
        ...(created ? [created] : []),
      ];
      return porcelain([
        mainRecord(),
        ...linked.map((item) => linkedRecord(item.path, item.branch)),
      ]);
    }
    if (args[0] === 'worktree' && args[1] === 'add') {
      if (options.failAdd) throw new Error('fatal /private/path secret-token');
      const branchFlagIndex = args.indexOf('-b');
      created = {
        branch:
          branchFlagIndex >= 0
            ? String(args[branchFlagIndex + 1])
            : String(args.at(-1)),
        path: branchFlagIndex >= 0 ? String(args.at(-1)) : String(args.at(-2)),
      };
      return '';
    }
    throw new Error(`unexpected command: ${args.join(' ')}`);
  };

  return { runner, calls };
}

async function createWith(
  input: CreateGitWorktreeInput,
  options: Parameters<typeof createRunner>[0] = {},
) {
  const { runner, calls } = createRunner(options);
  const result = await new GitWorktreeLifecycleService(runner).create(
    project,
    input,
  );
  return { result, calls };
}

test('cria worktree para branch existente com argv fechado e confirma snapshot', async () => {
  const { result, calls } = await createWith({
    branch: 'feature/demo',
    directoryName: 'projeto-demo',
  });

  assert.equal(result.state, 'created');
  assert.equal(result.path, '/workspace/projeto-demo');
  assert.equal(result.branch, 'feature/demo');
  assert.equal(result.worktree?.path, '/workspace/projeto-demo');
  assert.equal(result.worktree?.branch, 'feature/demo');
  assert.ok(
    calls.some(
      (args) =>
        args.join(' ') ===
        'worktree add -- /workspace/projeto-demo feature/demo',
    ),
  );
  assert.equal(
    calls.some((args) => args.includes('--force')),
    false,
  );
});

test('cria branch e worktree no mesmo comando sem aceitar opções livres', async () => {
  const { result, calls } = await createWith({
    branch: 'feature/nova',
    directoryName: 'projeto-nova',
    createBranch: true,
  });

  assert.equal(result.state, 'created');
  assert.ok(
    calls.some(
      (args) =>
        args.join(' ') ===
        'worktree add -b feature/nova -- /workspace/projeto-nova',
    ),
  );
});

test('reexecução do mesmo alvo é idempotente e não executa mutação', async () => {
  const { result, calls } = await createWith(
    { branch: 'feature/demo', directoryName: 'projeto-demo' },
    {
      existing: [{ path: '/workspace/projeto-demo', branch: 'feature/demo' }],
    },
  );

  assert.equal(result.state, 'already-present');
  assert.equal(
    calls.some((args) => args[0] === 'worktree' && args[1] === 'add'),
    false,
  );
});

test('bloqueia branch já ocupada por outro worktree', async () => {
  const { result, calls } = await createWith(
    { branch: 'feature/demo', directoryName: 'projeto-outro' },
    {
      existing: [{ path: '/workspace/projeto-demo', branch: 'feature/demo' }],
    },
  );

  assert.equal(result.state, 'blocked');
  assert.match(result.diagnostic ?? '', /branch já está vinculada/u);
  assert.equal(
    calls.some((args) => args[0] === 'worktree' && args[1] === 'add'),
    false,
  );
});

test('rejeita diretório com traversal antes de qualquer mutação', async () => {
  const { result, calls } = await createWith({
    branch: 'feature/demo',
    directoryName: '../fora',
  });

  assert.equal(result.state, 'blocked');
  assert.equal(calls.length, 0);
});

test('falha do Git retorna diagnóstico sanitizado sem stderr/path bruto', async () => {
  const { result } = await createWith(
    { branch: 'feature/demo', directoryName: 'projeto-demo' },
    { failAdd: true },
  );

  assert.equal(result.state, 'failed');
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('/private/path'), false);
  assert.equal(serialized.includes('secret-token'), false);
});
