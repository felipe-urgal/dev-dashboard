import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import {
  GitWorktreeLifecycleService,
  type CreateGitWorktreeInput,
  type GitWorktreeRemovalResourceGuard,
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

const COMMON_DIR = '/workspace/projeto/.git';
const MAIN_HEAD = '1111111111111111111111111111111111111111';
const LINKED_HEAD = '2222222222222222222222222222222222222222';
const CHANGED_HEAD = '3333333333333333333333333333333333333333';

interface LinkedState {
  path: string;
  branch?: string;
  head?: string;
  locked?: boolean;
  prunable?: boolean;
}

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

function linkedRecord(item: LinkedState): string[] {
  return [
    `worktree ${item.path}`,
    `HEAD ${item.head ?? LINKED_HEAD}`,
    item.branch ? `branch refs/heads/${item.branch}` : 'detached',
    ...(item.locked ? ['locked'] : []),
    ...(item.prunable ? ['prunable'] : []),
  ];
}

function linkedWorktreeId(worktreePath: string): string {
  const digest = createHash('sha256')
    .update(COMMON_DIR)
    .update('\0')
    .update(worktreePath)
    .digest('hex')
    .slice(0, 20);
  return `worktree-${digest}`;
}

function createRunner(options: {
  existing?: LinkedState[];
  failAdd?: boolean;
  failRemove?: boolean;
  dirtyPaths?: string[];
}) {
  const calls: Array<{ cwd: string; args: string[] }> = [];
  const linked = [...(options.existing ?? [])];
  const dirtyPaths = new Set(options.dirtyPaths ?? []);

  const runner: GitWorktreeCommandRunner = async (projectPath, args) => {
    calls.push({ cwd: projectPath, args: [...args] });

    if (args[0] === 'rev-parse') return `${COMMON_DIR}\n`;
    if (args[0] === 'check-ref-format') return `${args[2]}\n`;
    if (args[0] === 'status') {
      return dirtyPaths.has(projectPath) ? ' M arquivo.ts\0' : '';
    }
    if (args[0] === 'worktree' && args[1] === 'list') {
      return porcelain([mainRecord(), ...linked.map(linkedRecord)]);
    }
    if (args[0] === 'worktree' && args[1] === 'add') {
      if (options.failAdd) throw new Error('fatal /private/path secret-token');
      const branchFlagIndex = args.indexOf('-b');
      linked.push({
        branch:
          branchFlagIndex >= 0
            ? String(args[branchFlagIndex + 1])
            : String(args.at(-1)),
        path: branchFlagIndex >= 0 ? String(args.at(-1)) : String(args.at(-2)),
      });
      return '';
    }
    if (args[0] === 'worktree' && args[1] === 'remove') {
      if (options.failRemove)
        throw new Error('fatal /private/path secret-token');
      const target = String(args.at(-1));
      const index = linked.findIndex((item) => item.path === target);
      if (index >= 0) linked.splice(index, 1);
      return '';
    }
    throw new Error(`unexpected command: ${args.join(' ')}`);
  };

  return {
    runner,
    calls,
    setHead(worktreePath: string, head: string) {
      const item = linked.find((candidate) => candidate.path === worktreePath);
      if (item) item.head = head;
    },
  };
}

function createSafeRemovalGuard(options: { failCleanup?: boolean } = {}) {
  const inspected: string[] = [];
  const cleaned: string[] = [];
  const guard: GitWorktreeRemovalResourceGuard = {
    async inspect(environmentInstanceId) {
      inspected.push(environmentInstanceId);
      return { safe: true };
    },
    async cleanupRemoved(environmentInstanceId) {
      cleaned.push(environmentInstanceId);
      if (options.failCleanup) throw new Error('cleanup failed');
    },
  };
  return { guard, inspected, cleaned };
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
      ({ args }) =>
        args.join(' ') ===
        'worktree add -- /workspace/projeto-demo feature/demo',
    ),
  );
  assert.equal(
    calls.some(({ args }) => args.includes('--force')),
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
      ({ args }) =>
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
    calls.some(({ args }) => args[0] === 'worktree' && args[1] === 'add'),
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
    calls.some(({ args }) => args[0] === 'worktree' && args[1] === 'add'),
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

test('prepara e remove linked worktree limpo com confirmação e ownership exatas', async () => {
  const target = '/workspace/projeto-demo';
  const worktreeId = linkedWorktreeId(target);
  const expectedEnvironmentId = `environment:worktree:${project.id}:${worktreeId}`;
  const { runner, calls } = createRunner({
    existing: [{ path: target, branch: 'feature/demo' }],
  });
  const { guard, inspected, cleaned } = createSafeRemovalGuard();
  const service = new GitWorktreeLifecycleService(runner, undefined, {
    removalResourceGuard: guard,
    createConfirmationToken: () => 'confirmacao-1',
    now: () => 1_000,
  });

  const prepared = await service.prepareRemoval(project, worktreeId);
  assert.equal(prepared.state, 'ready');
  assert.equal(prepared.confirmationToken, 'confirmacao-1');
  assert.equal(prepared.environmentInstanceId, expectedEnvironmentId);

  const removed = await service.remove(project, {
    worktreeId,
    confirmationToken: 'confirmacao-1',
  });

  assert.equal(removed.state, 'removed');
  assert.deepEqual(inspected, [expectedEnvironmentId, expectedEnvironmentId]);
  assert.deepEqual(cleaned, [expectedEnvironmentId]);
  assert.ok(
    calls.some(
      ({ cwd, args }) =>
        cwd === '/workspace/projeto' &&
        args.join(' ') === 'worktree remove -- /workspace/projeto-demo',
    ),
  );
  assert.equal(
    calls.some(({ args }) => args.includes('--force')),
    false,
  );
  assert.equal(
    calls.filter(({ cwd, args }) => cwd === target && args[0] === 'status')
      .length,
    2,
  );
});

test('bloqueia remoção quando o worktree possui alterações locais', async () => {
  const target = '/workspace/projeto-demo';
  const worktreeId = linkedWorktreeId(target);
  const { runner, calls } = createRunner({
    existing: [{ path: target, branch: 'feature/demo' }],
    dirtyPaths: [target],
  });
  const { guard, inspected } = createSafeRemovalGuard();
  const service = new GitWorktreeLifecycleService(runner, undefined, {
    removalResourceGuard: guard,
  });

  const prepared = await service.prepareRemoval(project, worktreeId);

  assert.equal(prepared.state, 'blocked');
  assert.match(prepared.diagnostic ?? '', /alterações locais/u);
  assert.deepEqual(inspected, []);
  assert.equal(
    calls.some(({ args }) => args[0] === 'worktree' && args[1] === 'remove'),
    false,
  );
});

test('guard de ownership ausente falha fechado antes de emitir confirmação', async () => {
  const target = '/workspace/projeto-demo';
  const worktreeId = linkedWorktreeId(target);
  const { runner, calls } = createRunner({
    existing: [{ path: target, branch: 'feature/demo' }],
  });
  const service = new GitWorktreeLifecycleService(runner);

  const prepared = await service.prepareRemoval(project, worktreeId);

  assert.equal(prepared.state, 'blocked');
  assert.match(prepared.diagnostic ?? '', /ownership/u);
  assert.equal(prepared.confirmationToken, undefined);
  assert.equal(
    calls.some(({ args }) => args[0] === 'worktree' && args[1] === 'remove'),
    false,
  );
});

test('confirmação é vinculada ao HEAD e bloqueia TOCTOU antes da mutação', async () => {
  const target = '/workspace/projeto-demo';
  const worktreeId = linkedWorktreeId(target);
  const runnerState = createRunner({
    existing: [{ path: target, branch: 'feature/demo' }],
  });
  const { guard, cleaned } = createSafeRemovalGuard();
  const service = new GitWorktreeLifecycleService(
    runnerState.runner,
    undefined,
    {
      removalResourceGuard: guard,
      createConfirmationToken: () => 'confirmacao-head',
    },
  );

  const prepared = await service.prepareRemoval(project, worktreeId);
  assert.equal(prepared.state, 'ready');
  runnerState.setHead(target, CHANGED_HEAD);

  const removed = await service.remove(project, {
    worktreeId,
    confirmationToken: 'confirmacao-head',
  });

  assert.equal(removed.state, 'blocked');
  assert.match(removed.diagnostic ?? '', /mudou desde a confirmação/u);
  assert.deepEqual(cleaned, []);
  assert.equal(
    runnerState.calls.some(
      ({ args }) => args[0] === 'worktree' && args[1] === 'remove',
    ),
    false,
  );
});

test('não remove worktree observado fora da área irmã gerenciada', async () => {
  const target = '/tmp/projeto-demo';
  const worktreeId = linkedWorktreeId(target);
  const { runner, calls } = createRunner({
    existing: [{ path: target, branch: 'feature/demo' }],
  });
  const { guard, inspected } = createSafeRemovalGuard();
  const service = new GitWorktreeLifecycleService(runner, undefined, {
    removalResourceGuard: guard,
  });

  const prepared = await service.prepareRemoval(project, worktreeId);

  assert.equal(prepared.state, 'blocked');
  assert.match(prepared.diagnostic ?? '', /irmãos do checkout principal/u);
  assert.deepEqual(inspected, []);
  assert.equal(
    calls.some(({ cwd, args }) => cwd === target && args[0] === 'status'),
    false,
  );
});

test('confirmação inválida não executa git worktree remove', async () => {
  const target = '/workspace/projeto-demo';
  const worktreeId = linkedWorktreeId(target);
  const { runner, calls } = createRunner({
    existing: [{ path: target, branch: 'feature/demo' }],
  });
  const { guard } = createSafeRemovalGuard();
  const service = new GitWorktreeLifecycleService(runner, undefined, {
    removalResourceGuard: guard,
  });

  const removed = await service.remove(project, {
    worktreeId,
    confirmationToken: 'token-invalido',
  });

  assert.equal(removed.state, 'blocked');
  assert.equal(
    calls.some(({ args }) => args[0] === 'worktree' && args[1] === 'remove'),
    false,
  );
});

test('falha de cleanup é explícita depois de remoção confirmada', async () => {
  const target = '/workspace/projeto-demo';
  const worktreeId = linkedWorktreeId(target);
  const { runner } = createRunner({
    existing: [{ path: target, branch: 'feature/demo' }],
  });
  const { guard, cleaned } = createSafeRemovalGuard({ failCleanup: true });
  const service = new GitWorktreeLifecycleService(runner, undefined, {
    removalResourceGuard: guard,
    createConfirmationToken: () => 'confirmacao-cleanup',
  });

  const prepared = await service.prepareRemoval(project, worktreeId);
  assert.equal(prepared.state, 'ready');
  const removed = await service.remove(project, {
    worktreeId,
    confirmationToken: 'confirmacao-cleanup',
  });

  assert.equal(removed.state, 'cleanup-required');
  assert.equal(cleaned.length, 1);
  assert.match(removed.diagnostic ?? '', /já não existe/u);
});
