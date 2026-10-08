import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  GithubIssuesError,
  GithubIssuesService,
} from '../src/services/github-issues-service.js';

const PROJECT = '/tmp/project';

function rawIssue(number: number, state: 'open' | 'closed' = 'open') {
  return {
    number,
    title: 'Issue ' + number,
    body: 'Descrição',
    state,
    html_url: 'https://github.com/example/project/issues/' + number,
    user: { login: 'tester' },
    labels: [{ name: 'bug' }],
    updated_at: '2026-10-08T12:00:00Z',
  };
}

test('lista issues por origin, exclui pull requests e retorna metadados', async () => {
  const calls: Array<{ command: string; args: readonly string[]; cwd: string }> = [];
  const service = new GithubIssuesService(async (command, args, cwd) => {
    calls.push({ command, args, cwd });
    if (command === 'git') return 'git@github.com:example/project.git';
    return JSON.stringify([
      rawIssue(3),
      { ...rawIssue(4), pull_request: { url: 'pr' } },
    ]);
  });

  const result = await service.list(PROJECT, 'open', 1);
  assert.equal(result.repository, 'example/project');
  assert.equal(result.hasMore, false);
  assert.deepEqual(result.issues, [
    {
      number: 3,
      title: 'Issue 3',
      body: 'Descrição',
      state: 'open',
      url: 'https://github.com/example/project/issues/3',
      author: 'tester',
      labels: ['bug'],
      updatedAt: '2026-10-08T12:00:00Z',
    },
  ]);
  assert.deepEqual(calls[0], {
    command: 'git',
    args: ['remote', 'get-url', 'origin'],
    cwd: PROJECT,
  });
  assert.ok(calls[1]?.args.includes('repos/example/project/issues?state=open&per_page=50&page=1'));
});

test('cria e edita título e descrição como argumentos estruturados', async () => {
  const commands: string[][] = [];
  const service = new GithubIssuesService(async (command, args) => {
    if (command === 'git') return 'https://github.com/example/project.git';
    commands.push([...args]);
    if (args.includes('--method') && args.includes('POST')) {
      return JSON.stringify(rawIssue(7));
    }
    return JSON.stringify(rawIssue(7));
  });

  await service.create(PROJECT, ' Corrigir login ', 'Texto com "aspas" e \nquebra');
  await service.edit(PROJECT, 7, 'Novo título', '');
  assert.ok(commands[0]?.includes('title=Corrigir login'));
  assert.ok(commands[0]?.includes('body=Texto com "aspas" e \nquebra'));
  assert.ok(commands[2]?.includes('title=Novo título'));
  assert.ok(commands[2]?.includes('body='));
  assert.ok(commands[2]?.includes('PATCH'));
});

test('fecha issue aberta; fechamento repetido não realiza PATCH', async () => {
  let patches = 0;
  const service = new GithubIssuesService(async (command, args) => {
    if (command === 'git') return 'git@github.com:example/project.git';
    if (args.includes('PATCH')) {
      patches += 1;
      assert.ok(args.includes('state=closed'));
      return JSON.stringify(rawIssue(8, 'closed'));
    }
    return JSON.stringify(rawIssue(8, patches ? 'closed' : 'open'));
  });
  assert.equal((await service.close(PROJECT, 8)).state, 'closed');
  assert.equal((await service.close(PROJECT, 8)).state, 'closed');
  assert.equal(patches, 1);
});

test('não permite modificar Pull Requests pelo endpoint de issues', async () => {
  let patches = 0;
  const service = new GithubIssuesService(async (command, args) => {
    if (command === 'git') return 'https://github.com/example/project';
    if (args.includes('PATCH')) patches += 1;
    return JSON.stringify({ ...rawIssue(11), pull_request: {} });
  });

  await assert.rejects(
    () => service.close(PROJECT, 11),
    (error: unknown) => error instanceof GithubIssuesError && error.code === 'ISSUE_NOT_FOUND',
  );
  await assert.rejects(
    () => service.edit(PROJECT, 11, 'Teste', ''),
    (error: unknown) => error instanceof GithubIssuesError && error.code === 'ISSUE_NOT_FOUND',
  );
  assert.equal(patches, 0);
});

test('bloqueia origin fora do GitHub e entradas inválidas', async () => {
  const service = new GithubIssuesService(async (command) =>
    command === 'git' ? 'git@gitlab.com:example/project.git' : '[]',
  );
  await assert.rejects(
    () => service.list(PROJECT, 'open', 1),
    (error: unknown) => error instanceof GithubIssuesError && error.code === 'UNSUPPORTED_REMOTE',
  );

  const github = new GithubIssuesService(async (command) =>
    command === 'git' ? 'git@github.com:example/project.git' : '[]',
  );
  await assert.rejects(
    () => github.create(PROJECT, ' ', 'body'),
    (error: unknown) => error instanceof GithubIssuesError && error.code === 'INVALID_INPUT',
  );
  await assert.rejects(
    () => github.list(PROJECT, 'open', 0),
    (error: unknown) => error instanceof GithubIssuesError && error.code === 'INVALID_INPUT',
  );
});

test('erro de autenticação ou rede não é tratado como lista vazia', async () => {
  const service = new GithubIssuesService(async (command) => {
    if (command === 'git') return 'git@github.com:example/project.git';
    throw new Error('Not authenticated');
  });
  await assert.rejects(
    () => service.list(PROJECT, 'open', 1),
    (error: unknown) => error instanceof GithubIssuesError && error.code === 'REMOTE_UNAVAILABLE',
  );
});
