import assert from 'node:assert/strict';
import test from 'node:test';

import type { GitOpenPullRequest } from '@dev-dashboard/contracts';

import { GitPullRequestStatusService } from '../src/services/git-pull-request-status-service.js';

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('enriquece PR do GitHub com CI, comentários e conversas não resolvidas', async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/pulls/151')) {
      return jsonResponse({
        comments: 2,
        review_comments: 1,
        head: { sha: 'abc123' },
      });
    }
    if (url.endsWith('/commits/abc123/status')) {
      return jsonResponse({
        state: 'success',
        statuses: [{ state: 'success' }],
      });
    }
    if (url.endsWith('/commits/abc123/check-runs')) {
      return jsonResponse({
        total_count: 1,
        check_runs: [
          { status: 'completed', conclusion: 'failure' },
        ],
      });
    }
    return new Response(null, { status: 404 });
  };

  const service = new GitPullRequestStatusService({
    fetchImpl,
    providerCliImpl: async (_command, args) => {
      if (!args.includes('graphql')) return null;
      return JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [
                  { isResolved: false },
                  { isResolved: true },
                  { isResolved: false },
                ],
              },
            },
          },
        },
      });
    },
  });

  const pullRequest: GitOpenPullRequest = {
    provider: 'github',
    number: 151,
    title: 'feat: status do PR',
    url: 'https://github.com/felipe-urgal/dev-dashboard/pull/151',
    sourceBranch: 'feat/status-pr',
    baseBranch: 'main',
  };

  const result = await service.enrich('/tmp/project', pullRequest);

  assert.equal(result.ciStatus, 'failure');
  assert.equal(result.commentsCount, 3);
  assert.equal(result.unresolvedConversationsCount, 2);
});

test('mantém o resumo básico quando o provedor não entrega detalhes', async () => {
  const service = new GitPullRequestStatusService({
    fetchImpl: async () => new Response(null, { status: 404 }),
    providerCliImpl: async () => null,
  });
  const pullRequest: GitOpenPullRequest = {
    provider: 'github',
    number: 7,
    title: 'fix: exemplo',
    url: 'https://github.com/acme/example/pull/7',
    sourceBranch: 'fix/exemplo',
    baseBranch: 'main',
  };

  assert.deepEqual(
    await service.enrich('/tmp/project', pullRequest),
    pullRequest,
  );
});
