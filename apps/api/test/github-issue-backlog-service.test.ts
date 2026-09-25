import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GithubIssueBacklogError,
  GithubIssueBacklogService,
} from '../src/services/github-issue-backlog-service.js';

const repositoryRemote = 'git@github.com:felipe-urgal/dev-dashboard.git';

function commandRunner() {
  return async (
    command: string,
    args: readonly string[],
  ): Promise<string | null> => {
    if (
      command === 'git' &&
      args[0] === 'remote' &&
      args[1] === 'get-url' &&
      args[2] === 'origin'
    ) {
      return repositoryRemote;
    }
    return null;
  };
}

test('GithubIssueBacklogService seleciona somente prioridade explícita única', async () => {
  const service = new GithubIssueBacklogService({
    commandRunner: commandRunner(),
    fetchImpl: async () =>
      new Response(
        JSON.stringify([
          {
            number: 10,
            title: 'Atividade P1',
            state: 'open',
            labels: [{ name: 'priority:p1' }],
          },
          {
            number: 20,
            title: 'Atividade P0',
            state: 'open',
            labels: [{ name: 'priority:p0' }],
          },
          {
            number: 30,
            title: 'Pull request',
            state: 'open',
            labels: [{ name: 'priority:p0' }],
            pull_request: { url: 'https://example.test' },
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  });

  const result = await service.select('/workspace/project');

  assert.equal(result.status, 'selected');
  if (result.status !== 'selected') return;
  assert.equal(result.source, 'label:priority:p0');
  assert.deepEqual(result.issue, {
    repository: 'felipe-urgal/dev-dashboard',
    number: 20,
    title: 'Atividade P0',
    labels: ['priority:p0'],
  });
});

test('GithubIssueBacklogService devolve candidatas quando não há prioridade explícita', async () => {
  const service = new GithubIssueBacklogService({
    commandRunner: commandRunner(),
    fetchImpl: async () =>
      new Response(
        JSON.stringify([
          {
            number: 8,
            title: 'Sem prioridade B',
            state: 'open',
            labels: [],
          },
          {
            number: 3,
            title: 'Sem prioridade A',
            state: 'open',
            labels: [{ name: 'feature' }],
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  });

  const result = await service.select('/workspace/project');

  assert.equal(result.status, 'ambiguous');
  if (result.status !== 'ambiguous') return;
  assert.equal(result.source, 'no-explicit-priority');
  assert.deepEqual(
    result.candidates.map((issue) => issue.number),
    [3, 8],
  );
});

test('GithubIssueBacklogService resolve issue específica sem ranking', async () => {
  const requestedUrls: string[] = [];
  const service = new GithubIssueBacklogService({
    commandRunner: commandRunner(),
    fetchImpl: async (input) => {
      requestedUrls.push(String(input));
      return new Response(
        JSON.stringify({
          number: 893,
          title: 'Adotar backlog pelo composer',
          state: 'open',
          labels: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  });

  const result = await service.select('/workspace/project', 893);

  assert.equal(result.status, 'selected');
  if (result.status !== 'selected') return;
  assert.equal(result.source, 'specific-issue');
  assert.equal(result.issue.number, 893);
  assert.match(requestedUrls[0] ?? '', /issues\/893$/);
});

test('GithubIssueBacklogService falha explicitamente quando GitHub fica indisponível', async () => {
  const service = new GithubIssueBacklogService({
    commandRunner: commandRunner(),
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });

  await assert.rejects(
    service.select('/workspace/project'),
    (error: unknown) =>
      error instanceof GithubIssueBacklogError &&
      error.code === 'GITHUB_BACKLOG_REMOTE_UNAVAILABLE',
  );
});
