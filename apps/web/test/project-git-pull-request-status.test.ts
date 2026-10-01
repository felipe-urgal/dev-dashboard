import assert from 'node:assert/strict';
import { mount } from '@vue/test-utils';
import { test } from 'vitest';

import type { GitOpenPullRequest } from '@dev-dashboard/contracts';

import ProjectGitPullRequestStatus from '../src/components/ProjectGitPullRequestStatus.vue';

function pullRequest(
  overrides: Partial<GitOpenPullRequest> = {},
): GitOpenPullRequest {
  return {
    provider: 'github',
    number: 604,
    title: 'feat: cockpit GitHub',
    url: 'https://github.com/felipe-urgal/dev-dashboard/pull/604',
    sourceBranch: 'feature/cockpit',
    baseBranch: 'main',
    ciStatus: 'success',
    commentsCount: 4,
    unresolvedConversationsCount: 0,
    ...overrides,
  };
}

test('mostra CI, review, mergeabilidade, conversas e checks', () => {
  const wrapper = mount(ProjectGitPullRequestStatus, {
    props: {
      branchPublished: true,
      checkingExisting: false,
      lookupUnavailable: false,
      targetRemote: 'origin',
      mutationBusy: false,
      mergeBlockers: [],
      existingPullRequest: pullRequest({
        cockpit: {
          remoteStatus: 'available',
          headSha: '0e5a7151234567890abcdef',
          draft: false,
          mergeable: true,
          mergeableState: 'clean',
          reviewState: 'approved',
          requestedReviewers: [],
          checks: [
            {
              name: 'Validate',
              status: 'success',
              detailsUrl:
                'https://github.com/felipe-urgal/dev-dashboard/actions/runs/1',
            },
          ],
        },
      }),
    },
  });

  assert.match(wrapper.text(), /0e5a7151/);
  assert.match(wrapper.text(), /Pronta para review/);
  assert.match(wrapper.text(), /Aprovada/);
  assert.match(wrapper.text(), /CI\s*Passou/);
  assert.match(wrapper.text(), /Comentários\s*4/);
  assert.match(wrapper.text(), /Conversas pendentes\s*0/);
  assert.match(wrapper.text(), /Mergeável/);
});

test('mostra bloqueadores e desabilita merge', () => {
  const wrapper = mount(ProjectGitPullRequestStatus, {
    props: {
      branchPublished: true,
      checkingExisting: false,
      lookupUnavailable: false,
      targetRemote: 'origin',
      mutationBusy: false,
      mergeBlockers: ['Existem checks pendentes.'],
      existingPullRequest: pullRequest({
        ciStatus: 'pending',
        cockpit: {
          remoteStatus: 'available',
          draft: false,
          mergeable: true,
          reviewState: 'review-required',
          requestedReviewers: ['reviewer-a'],
          checks: [{ name: 'Validate', status: 'pending' }],
        },
      }),
    },
  });

  assert.match(wrapper.text(), /Existem checks pendentes/);
  const merge = wrapper
    .findAll('.git-pr-gh-actions button')
    .find((button) => button.text().includes('Mesclar com gh'))!;
  assert.equal((merge.element as HTMLButtonElement).disabled, true);
});

test('GitLab exibe apenas ação externa', () => {
  const wrapper = mount(ProjectGitPullRequestStatus, {
    props: {
      branchPublished: true,
      checkingExisting: false,
      lookupUnavailable: false,
      targetRemote: 'origin',
      mutationBusy: false,
      mergeBlockers: [],
      existingPullRequest: pullRequest({
        provider: 'gitlab',
        url: 'https://gitlab.com/empresa/projeto/-/merge_requests/604',
        cockpit: undefined,
      }),
    },
  });

  assert.match(wrapper.text(), /Abrir no GitLab/);
  assert.equal(wrapper.findAll('.git-pr-gh-actions button').length, 0);
});
