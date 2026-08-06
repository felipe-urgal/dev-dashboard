import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { GitPullRequestService } from '../src/services/git-pull-request-service.js';

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return result.stdout.trim();
}

async function makeForkFixture(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dashboard-pr-target-'));
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
  await git(root, [
    'remote',
    'add',
    'upstream',
    'git@github.com:empresa/dev-dashboard.git',
  ]);
  await git(root, ['update-ref', 'refs/remotes/origin/main', mainHead]);
  await git(root, ['update-ref', 'refs/remotes/upstream/main', mainHead]);

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

test('compõe Pull Request do fork origin para upstream com título e descrição', async (context) => {
  const root = await makeForkFixture();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const service = new GitPullRequestService();
  const result = await service.composeUrl(root, {
    targetRemote: 'upstream',
    baseBranch: 'main',
    title: 'feat: fluxo de PR',
    description: '## Resumo\n\nAbre a Pull Request pelo painel.',
  });

  assert.equal(result.provider, 'github');
  assert.equal(result.branch, 'feature/pull-request');
  assert.equal(result.defaultBranch, 'main');

  const url = new URL(result.url);
  assert.equal(url.hostname, 'github.com');
  assert.equal(
    url.pathname,
    '/empresa/dev-dashboard/compare/main...felipe-urgal%3Afeature%2Fpull-request',
  );
  assert.equal(url.searchParams.get('quick_pull'), '1');
  assert.equal(url.searchParams.get('title'), 'feat: fluxo de PR');
  assert.equal(
    url.searchParams.get('body'),
    '## Resumo\n\nAbre a Pull Request pelo painel.',
  );
});

test('compõe Pull Request para origin usando branch base escolhida', async (context) => {
  const root = await makeForkFixture();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const mainHead = await git(root, ['rev-parse', 'refs/remotes/origin/main']);
  await git(root, ['update-ref', 'refs/remotes/origin/develop', mainHead]);

  const service = new GitPullRequestService();
  const result = await service.composeUrl(root, {
    targetRemote: 'origin',
    baseBranch: 'develop',
    title: 'PR para develop',
    description: '',
  });

  const url = new URL(result.url);
  assert.equal(
    url.pathname,
    '/felipe-urgal/dev-dashboard/compare/develop...feature%2Fpull-request',
  );
  assert.equal(url.searchParams.get('quick_pull'), '1');
  assert.equal(url.searchParams.get('title'), 'PR para develop');
  assert.equal(url.searchParams.get('body'), null);
});

test('detecta Pull Request aberta no GitHub pela origem e branch base', async (context) => {
  const root = await makeForkFixture();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const requests: string[] = [];
  const service = new GitPullRequestService({
    fetchImpl: async (input) => {
      requests.push(String(input));
      return new Response(
        JSON.stringify([
          {
            number: 42,
            title: 'feat: fluxo de PR',
            html_url: 'https://github.com/empresa/dev-dashboard/pull/42',
          },
        ]),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    },
  });

  const result = await service.findOpenPullRequest(root, {
    targetRemote: 'upstream',
    baseBranch: 'main',
  });

  assert.equal(result.checked, true);
  assert.deepEqual(result.existing, {
    provider: 'github',
    number: 42,
    title: 'feat: fluxo de PR',
    url: 'https://github.com/empresa/dev-dashboard/pull/42',
    sourceBranch: 'feature/pull-request',
    baseBranch: 'main',
  });
  assert.equal(requests.length, 1);
  const url = new URL(requests[0]!);
  assert.equal(url.pathname, '/repos/empresa/dev-dashboard/pulls');
  assert.equal(url.searchParams.get('state'), 'open');
  assert.equal(
    url.searchParams.get('head'),
    'felipe-urgal:feature/pull-request',
  );
  assert.equal(url.searchParams.get('base'), 'main');
});

test('usa gh autenticado quando a API pública não consegue acessar o repositório', async (context) => {
  const root = await makeForkFixture();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const commands: Array<{
    command: string;
    args: readonly string[];
    cwd: string;
  }> = [];
  const service = new GitPullRequestService({
    fetchImpl: async () => new Response('Not Found', { status: 404 }),
    providerCliImpl: async (command, args, cwd) => {
      commands.push({ command, args, cwd });
      return JSON.stringify([
        {
          number: 77,
          title: 'fix: PR privada já aberta',
          html_url: 'https://github.com/empresa/dev-dashboard/pull/77',
        },
      ]);
    },
  });

  const result = await service.findOpenPullRequest(root, {
    targetRemote: 'upstream',
    baseBranch: 'main',
  });

  assert.equal(result.checked, true);
  assert.equal(result.existing?.number, 77);
  assert.equal(commands.length, 1);
  assert.equal(commands[0]?.command, 'gh');
  assert.equal(commands[0]?.cwd, root);
  assert.ok(commands[0]?.args.includes('github.com'));
  assert.ok(
    commands[0]?.args.includes('head=felipe-urgal:feature/pull-request'),
  );
  assert.ok(commands[0]?.args.includes('base=main'));
});

test('informa que a verificação foi concluída quando não existe PR aberta', async (context) => {
  const root = await makeForkFixture();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const service = new GitPullRequestService({
    fetchImpl: async () =>
      new Response('[]', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  });

  const result = await service.findOpenPullRequest(root, {
    targetRemote: 'upstream',
    baseBranch: 'main',
  });

  assert.deepEqual(result, { checked: true });
});

test('falha fechada na consulta externa sem bloquear a criação de PR', async (context) => {
  const root = await makeForkFixture();
  context.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const service = new GitPullRequestService({
    fetchImpl: async () => {
      throw new Error('network unavailable');
    },
    providerCliImpl: async () => null,
  });

  const result = await service.findOpenPullRequest(root, {
    targetRemote: 'upstream',
    baseBranch: 'main',
  });

  assert.deepEqual(result, { checked: false });
});
