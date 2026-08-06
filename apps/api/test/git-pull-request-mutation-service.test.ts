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

  const confirmation = service.prepareConfirmation(
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

  assert.throws(
    () =>
      service.prepareConfirmation('project-1', 'pull-request-create', {
        baseBranch: 'main',
      }),
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

  const confirmation = service.prepareConfirmation(
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

  const confirmation = service.prepareConfirmation(
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
  assert.deepEqual(calls[0], ['pr', 'close', '42']);
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

  const confirmation = service.prepareConfirmation(
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
  assert.deepEqual(calls[0], ['pr', 'merge', '42', '--squash']);
});

test('rejeita merge sem estratégia informada', async () => {
  const service = new GitPullRequestMutationService({
    runGhImpl: async () => viewPayload(),
  });

  assert.throws(
    () =>
      service.prepareConfirmation('project-1', 'pull-request-merge', {
        number: 42,
      }),
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

  const confirmation = service.prepareConfirmation(
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
