import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  GitPullRequestMutationError,
  GitPullRequestMutationService,
} from '../src/services/git-pull-request-mutation-service.js';
import { GitPullRequestError } from '../src/services/git-pull-request/errors.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}

async function makeGithubFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dashboard-pr-mutate-'));
  await git(root, ['init', '-q', '-b', 'main']);
  await git(root, ['config', 'user.name', 'Dashboard Test']);
  await git(root, ['config', 'user.email', 'dashboard@example.test']);
  await writeFile(path.join(root, 'README.md'), 'v1\n');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', 'commit inicial']);
  const mainHead = await git(root, ['rev-parse', 'HEAD']);

  await git(root, [
    'remote',
    'add',
    'origin',
    'git@github.com:felipe-urgal/dev-dashboard.git',
  ]);
  await git(root, ['update-ref', 'refs/remotes/origin/main', mainHead]);

  await git(root, ['switch', '-q', '-c', 'feature/pull-request']);
  await writeFile(path.join(root, 'feature.txt'), 'feature\n');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', 'feat: fluxo de pull request']);
  await git(root, [
    'update-ref',
    'refs/remotes/origin/feature/pull-request',
    'HEAD',
  ]);
  await git(root, [
    'branch',
    '--set-upstream-to=origin/feature/pull-request',
    'feature/pull-request',
  ]);

  return root;
}

async function makeGitlabFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dashboard-pr-mutate-'));
  await git(root, ['init', '-q', '-b', 'main']);
  await git(root, ['config', 'user.name', 'Dashboard Test']);
  await git(root, ['config', 'user.email', 'dashboard@example.test']);
  await writeFile(path.join(root, 'README.md'), 'v1\n');
  await git(root, ['add', '.']);
  await git(root, ['commit', '-q', '-m', 'commit inicial']);
  await git(root, [
    'remote',
    'add',
    'origin',
    'git@gitlab.com:felipe-urgal/dev-dashboard.git',
  ]);
  return root;
}

function viewPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return JSON.stringify({
    number: 42,
    url: 'https://github.com/felipe-urgal/dev-dashboard/pull/42',
    title: 'feat: fluxo de pull request',
    state: 'OPEN',
    ...overrides,
  });
}

test('cria uma Pull Request após confirmação, montando os argumentos do gh', async (context) => {
  const root = await makeGithubFixture();
  context.after(async () => rm(root, { recursive: true, force: true }));

  const calls: Array<{ cwd: string; args: readonly string[] }> = [];
  const service = new GitPullRequestMutationService({
    runGhImpl: async (cwd, args) => {
      calls.push({ cwd, args });
      if (args[0] === 'pr' && args[1] === 'create') {
        return 'https://github.com/felipe-urgal/dev-dashboard/pull/42';
      }
      return viewPayload();
    },
  });

  const confirmation = await service.prepareConfirmation(
    root,
    'project-1',
    'pull-request-create',
    {
      baseBranch: 'main',
      title: 'feat: fluxo de pull request',
      description: 'desc',
    },
  );

  const result = await service.execute(
    root,
    'project-1',
    'pull-request-create',
    {
      baseBranch: 'main',
      title: 'feat: fluxo de pull request',
      description: 'desc',
    },
    confirmation.token,
  );

  assert.equal(result.number, 42);
  assert.equal(result.state, 'open');
  assert.equal(result.action, 'pull-request-create');

  const createCall = calls.find((call) => call.args[1] === 'create');
  assert.ok(createCall);
  assert.deepEqual(createCall!.args, [
    'pr',
    'create',
    '--repo',
    'felipe-urgal/dev-dashboard',
    '--base',
    'main',
    '--head',
    'feature/pull-request',
    '--title',
    'feat: fluxo de pull request',
    '--body',
    'desc',
  ]);
});

test('rejeita execução sem confirmação prévia', async (context) => {
  const root = await makeGithubFixture();
  context.after(async () => rm(root, { recursive: true, force: true }));

  const service = new GitPullRequestMutationService({
    runGhImpl: async () => viewPayload(),
  });

  await assert.rejects(
    () =>
      service.execute(
        root,
        'project-1',
        'pull-request-close',
        { number: 42 },
        undefined,
      ),
    (error: unknown) => {
      assert.ok(error instanceof GitPullRequestMutationError);
      assert.equal(
        error.code,
        'GIT_PULL_REQUEST_MUTATION_CONFIRMATION_REQUIRED',
      );
      return true;
    },
  );
});

test('rejeita confirmação de criação sem título', async () => {
  const service = new GitPullRequestMutationService({
    runGhImpl: async () => viewPayload(),
  });

  await assert.rejects(
    () =>
      service.prepareConfirmation(
        '/tmp/project',
        'project-1',
        'pull-request-create',
        {
          baseBranch: 'main',
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof GitPullRequestMutationError);
      assert.equal(error.code, 'GIT_PULL_REQUEST_ACTION_INVALID_INPUT');
      return true;
    },
  );
});

test('rejeita ações em projetos com remoto fora do GitHub', async (context) => {
  const root = await makeGitlabFixture();
  context.after(async () => rm(root, { recursive: true, force: true }));

  const service = new GitPullRequestMutationService({
    runGhImpl: async () => viewPayload(),
  });

  await assert.rejects(
    () =>
      service.prepareConfirmation(root, 'project-1', 'pull-request-close', {
        number: 42,
      }),
    (error: unknown) => {
      assert.ok(error instanceof GitPullRequestError);
      assert.equal(error.code, 'GIT_PULL_REQUEST_REMOTE_UNSUPPORTED');
      return true;
    },
  );
});

test('fecha uma Pull Request existente', async (context) => {
  const root = await makeGithubFixture();
  context.after(async () => rm(root, { recursive: true, force: true }));

  const calls: Array<readonly string[]> = [];
  const service = new GitPullRequestMutationService({
    runGhImpl: async (_cwd, args) => {
      calls.push(args);
      if (args[1] === 'close') return '';
      return viewPayload({ state: 'CLOSED' });
    },
  });

  const confirmation = await service.prepareConfirmation(
    root,
    'project-1',
    'pull-request-close',
    { number: 42 },
  );
  const result = await service.execute(
    root,
    'project-1',
    'pull-request-close',
    { number: 42 },
    confirmation.token,
  );

  assert.equal(result.state, 'closed');
  assert.deepEqual(calls[0], [
    'pr',
    'close',
    '42',
    '--repo',
    'felipe-urgal/dev-dashboard',
  ]);
});

test('mescla uma Pull Request com a estratégia informada', async (context) => {
  const root = await makeGithubFixture();
  context.after(async () => rm(root, { recursive: true, force: true }));

  const calls: Array<readonly string[]> = [];
  const service = new GitPullRequestMutationService({
    runGhImpl: async (_cwd, args) => {
      calls.push(args);
      if (args[1] === 'merge') return '';
      return viewPayload({ state: 'MERGED' });
    },
  });

  const confirmation = await service.prepareConfirmation(
    root,
    'project-1',
    'pull-request-merge',
    { number: 42, mergeMethod: 'squash' },
  );
  const result = await service.execute(
    root,
    'project-1',
    'pull-request-merge',
    { number: 42, mergeMethod: 'squash' },
    confirmation.token,
  );

  assert.equal(result.state, 'merged');
  assert.deepEqual(calls[0], [
    'pr',
    'merge',
    '42',
    '--repo',
    'felipe-urgal/dev-dashboard',
    '--squash',
  ]);
});

test('rejeita merge sem estratégia informada', async () => {
  const service = new GitPullRequestMutationService({
    runGhImpl: async () => viewPayload(),
  });

  await assert.rejects(
    () =>
      service.prepareConfirmation(
        '/tmp/project',
        'project-1',
        'pull-request-merge',
        {
          number: 42,
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof GitPullRequestMutationError);
      assert.equal(error.code, 'GIT_PULL_REQUEST_ACTION_INVALID_INPUT');
      return true;
    },
  );
});

test('não vaza stderr bruto do gh em falha de execução', async (context) => {
  const root = await makeGithubFixture();
  context.after(async () => rm(root, { recursive: true, force: true }));

  const service = new GitPullRequestMutationService({
    runGhImpl: async () => {
      throw new Error('stderr: token de autenticação inválido segredo=xyz');
    },
  });

  const confirmation = await service.prepareConfirmation(
    root,
    'project-1',
    'pull-request-close',
    { number: 42 },
  );

  await assert.rejects(
    () =>
      service.execute(
        root,
        'project-1',
        'pull-request-close',
        { number: 42 },
        confirmation.token,
      ),
    (error: unknown) => {
      assert.ok(error instanceof GitPullRequestMutationError);
      assert.equal(error.code, 'GIT_PULL_REQUEST_MUTATION_FAILED');
      assert.ok(!error.message.includes('segredo'));
      return true;
    },
  );
});

test('fixa o repositório upstream em create, edit, close, merge e view', async (context) => {
  const root = await makeGithubFixture();
  context.after(async () => rm(root, { recursive: true, force: true }));
  await git(root, [
    'remote',
    'add',
    'upstream',
    'git@github.com:empresa/dev-dashboard.git',
  ]);
  await git(root, [
    'update-ref',
    'refs/remotes/upstream/main',
    'refs/remotes/origin/main',
  ]);

  const calls: Array<readonly string[]> = [];
  const service = new GitPullRequestMutationService({
    runGhImpl: async (_cwd, args) => {
      calls.push(args);
      if (args[1] === 'create') {
        return 'https://github.com/empresa/dev-dashboard/pull/42';
      }
      if (args[1] === 'edit' || args[1] === 'close' || args[1] === 'merge')
        return '';
      return viewPayload({
        url: 'https://github.com/empresa/dev-dashboard/pull/42',
      });
    },
  });

  const createInput = {
    targetRemote: 'upstream' as const,
    baseBranch: 'main',
    title: 'feat: fork',
    description: 'desc',
    draft: true,
  };
  const createConfirmation = await service.prepareConfirmation(
    root,
    'project-1',
    'pull-request-create',
    createInput,
  );
  await service.execute(
    root,
    'project-1',
    'pull-request-create',
    createInput,
    createConfirmation.token,
  );

  const editInput = {
    targetRemote: 'upstream' as const,
    number: 42,
    title: 'feat: fork editado',
    description: 'novo corpo',
  };
  const editConfirmation = await service.prepareConfirmation(
    root,
    'project-1',
    'pull-request-edit',
    editInput,
  );
  await service.execute(
    root,
    'project-1',
    'pull-request-edit',
    editInput,
    editConfirmation.token,
  );

  const closeInput = { targetRemote: 'upstream' as const, number: 42 };
  const closeConfirmation = await service.prepareConfirmation(
    root,
    'project-1',
    'pull-request-close',
    closeInput,
  );
  await service.execute(
    root,
    'project-1',
    'pull-request-close',
    closeInput,
    closeConfirmation.token,
  );

  const mergeInput = {
    targetRemote: 'upstream' as const,
    number: 42,
    mergeMethod: 'squash' as const,
  };
  const mergeConfirmation = await service.prepareConfirmation(
    root,
    'project-1',
    'pull-request-merge',
    mergeInput,
  );
  await service.execute(
    root,
    'project-1',
    'pull-request-merge',
    mergeInput,
    mergeConfirmation.token,
  );

  const create = calls.find((args) => args[1] === 'create');
  assert.ok(create);
  assert.deepEqual(create!.slice(0, 8), [
    'pr',
    'create',
    '--repo',
    'empresa/dev-dashboard',
    '--base',
    'main',
    '--head',
    'felipe-urgal:feature/pull-request',
  ]);
  assert.ok(create!.includes('--draft'));

  for (const action of ['edit', 'close', 'merge', 'view']) {
    const actionCalls = calls.filter((args) => args[1] === action);
    assert.ok(actionCalls.length > 0, `esperava gh pr ${action}`);
    for (const args of actionCalls) {
      const repoIndex = args.indexOf('--repo');
      assert.equal(args[repoIndex + 1], 'empresa/dev-dashboard');
    }
  }
});

test('token de confirmação deixa de valer se o remote alvo mudar', async (context) => {
  const root = await makeGithubFixture();
  context.after(async () => rm(root, { recursive: true, force: true }));

  const service = new GitPullRequestMutationService({
    runGhImpl: async () => viewPayload(),
  });
  const input = { number: 42 };
  const confirmation = await service.prepareConfirmation(
    root,
    'project-1',
    'pull-request-close',
    input,
  );

  await git(root, [
    'remote',
    'set-url',
    'origin',
    'git@github.com:outra-org/outro-repo.git',
  ]);

  await assert.rejects(
    () =>
      service.execute(
        root,
        'project-1',
        'pull-request-close',
        input,
        confirmation.token,
      ),
    (error: unknown) => {
      assert.ok(error instanceof GitPullRequestMutationError);
      assert.equal(
        error.code,
        'GIT_PULL_REQUEST_MUTATION_CONFIRMATION_REQUIRED',
      );
      return true;
    },
  );
});
