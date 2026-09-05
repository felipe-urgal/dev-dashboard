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

test('enriquece PR do GitHub com revisão, SHA, mergeability e checks acionáveis', async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/pulls/151')) {
      return jsonResponse({
        comments: 2,
        review_comments: 1,
        draft: false,
        mergeable: true,
        mergeable_state: 'clean',
        requested_reviewers: [{ login: 'reviewer-a' }],
        head: { sha: 'abc123' },
      });
    }
    if (url.endsWith('/pulls/151/reviews')) {
      return jsonResponse([{ state: 'APPROVED' }]);
    }
    if (url.endsWith('/commits/abc123/status')) {
      return jsonResponse({
        state: 'success',
        statuses: [{ state: 'success' }],
      });
    }
    if (url.endsWith('/commits/abc123/check-runs')) {
      return jsonResponse({
        total_count: 2,
        check_runs: [
          {
            name: 'test',
            status: 'completed',
            conclusion: 'failure',
            details_url: 'https://github.com/felipe-urgal/dev-dashboard/actions/runs/1',
          },
          {
            name: 'lint',
            status: 'completed',
            conclusion: 'success',
          },
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
  assert.deepEqual(result.cockpit, {
    remoteStatus: 'available',
    headSha: 'abc123',
    draft: false,
    mergeable: true,
    mergeableState: 'clean',
    reviewState: 'approved',
    requestedReviewers: ['reviewer-a'],
    checks: [
      {
        name: 'test',
        status: 'failure',
        detailsUrl:
          'https://github.com/felipe-urgal/dev-dashboard/actions/runs/1',
      },
      { name: 'lint', status: 'success' },
    ],
  });
});

test('mantém Git local utilizável e explicita indisponibilidade remota', async () => {
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

  assert.deepEqual(await service.enrich('/tmp/project', pullRequest), {
    ...pullRequest,
    cockpit: {
      remoteStatus: 'unavailable',
      reviewState: 'unknown',
      requestedReviewers: [],
      checks: [],
    },
  });
});

test('distingue rate limit sem transformar falha remota em erro local', async () => {
  const service = new GitPullRequestStatusService({
    fetchImpl: async () =>
      new Response(null, {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0' },
      }),
    providerCliImpl: async () => null,
  });
  const pullRequest: GitOpenPullRequest = {
    provider: 'github',
    number: 8,
    title: 'feat: rate limit',
    url: 'https://github.com/acme/example/pull/8',
    sourceBranch: 'feat/rate-limit',
    baseBranch: 'main',
  };

  const result = await service.enrich('/tmp/project', pullRequest);
  assert.equal(result.cockpit?.remoteStatus, 'rate-limited');
  assert.equal(result.cockpit?.reviewState, 'unknown');
});
