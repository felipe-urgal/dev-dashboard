import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestJson = vi.hoisted(() => vi.fn());

vi.mock('../src/api/core', () => ({ requestJson }));

import {
  getProjectGitPullRequestStatus,
  getProjectGitPullRequestSummary,
} from '../src/api/git-workflows';

describe('Git pull request lookup API', () => {
  beforeEach(() => {
    requestJson.mockReset();
    requestJson.mockResolvedValue({
      lookup: {
        checked: true,
        existing: {
          provider: 'github',
          number: 610,
          title: 'Cockpit GitHub',
          url: 'https://github.com/felipe-urgal/dev-dashboard/pull/610',
          sourceBranch: 'feature/569-github-cockpit-ui',
          baseBranch: 'main',
          cockpit: {
            remoteStatus: 'available',
            reviewState: 'review-required',
            requestedReviewers: [],
            checks: [],
          },
        },
      },
    });
  });

  it('usa o summary enriquecido no lookup consumido pela página de PR', async () => {
    const input = { targetRemote: 'origin' as const, baseBranch: 'main' };

    const lookup = await getProjectGitPullRequestStatus('project-1', input);

    expect(requestJson).toHaveBeenCalledTimes(1);
    expect(requestJson.mock.calls[0]![0]).toBe(
      '/api/projects/project-1/git/pull-request-summary?targetRemote=origin&baseBranch=main',
    );
    expect(lookup.existing?.cockpit?.remoteStatus).toBe('available');
  });

  it('mantém o cliente explícito de summary no mesmo contrato', async () => {
    await getProjectGitPullRequestSummary('project-1', {
      targetRemote: 'upstream',
      baseBranch: 'develop',
    });

    expect(requestJson.mock.calls[0]![0]).toBe(
      '/api/projects/project-1/git/pull-request-summary?targetRemote=upstream&baseBranch=develop',
    );
  });
});
