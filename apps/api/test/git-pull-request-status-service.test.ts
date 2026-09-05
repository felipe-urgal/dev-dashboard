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

function pullRequest(number: number): GitOpenPullRequest {
  return {
    provider: 'github',
    number,
    title: 'feat: status do PR',
    url: `https://github.com/felipe-urgal/dev-dashboard/pull/${number}`,
    sourceBranch: 'feat/status-pr',
    baseBranch: 'main',
  };
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
        requested_reviewers: [],
        head: { sha: 'abc123' },
      });
    }
    if (url.endsWith('/pulls/151/reviews')) {
      return jsonResponse([
        { state: 'APPROVED', user: { login: 'reviewer-a' } },
      ]);
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
            details_url:
              'https://github.com/felipe-urgal/dev-dashboard/actions/runs/1',
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

  const result = await service.enrich('/tmp/project', pullRequest(151));

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
    requestedReviewers: [],
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

test('usa a decisão mais recente de cada reviewer', async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/pulls/152')) {
      return jsonResponse({
        comments: 0,
        review_comments: 0,
        requested_reviewers: [],
        head: { sha: 'def456' },
      });
    }
    if (url.endsWith('/pulls/152/reviews')) {
      return jsonResponse([
        { state: 'CHANGES_REQUESTED', user: { login: 'reviewer-a' } },
        { state: 'APPROVED', user: { login: 'reviewer-a' } },
      ]);
    }
    if (url.includes('/commits/def456/')) return jsonResponse({});
    return new Response(null, { status: 404 });
  };

  const service = new GitPullRequestStatusService({
    fetchImpl,
    providerCliImpl: async () => null,
  });

  const result = await service.enrich('/tmp/project', pullRequest(152));
  assert.equal(result.cockpit?.reviewState, 'approved');
});

test('reviewer ainda solicitado mantém review-required', async () => {
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/pulls/153')) {
      return jsonResponse({
        comments: 0,
        review_comments: 0,
        requested_reviewers: [{ login: 'reviewer-b' }],
      });
    }
    if (url.endsWith('/pulls/153/reviews')) return jsonResponse([]);
    return new Response(null, { status: 404 });
  };

  const service = new GitPullRequestStatusService({
    fetchImpl,
    providerCliImpl: async () => null,
  });

  const result = await service.enrich('/tmp/project', pullRequest(153));
  assert.equal(result.cockpit?.reviewState, 'review-required');
  assert.deepEqual(result.cockpit?.requestedReviewers, ['reviewer-b']);
});

test('mantém Git local utilizável e explicita indisponibilidade remota', async () => {
  const service = new GitPullRequestStatusService({
    fetchImpl: async () => new Response(null, { status: 404 }),
    providerCliImpl: async () => null,
  });
  const request = pullRequest(7);

  assert.deepEqual(await service.enrich('/tmp/project', request), {
    ...request,
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

  const result = await service.enrich('/tmp/project', pullRequest(8));
  assert.equal(result.cockpit?.remoteStatus, 'rate-limited');
  assert.equal(result.cockpit?.reviewState, 'unknown');
});
