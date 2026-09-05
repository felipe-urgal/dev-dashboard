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
    title: 'feat: adiciona diagnóstico do cockpit GitHub',
    url: 'https://github.com/felipe-urgal/dev-dashboard/pull/604',
    sourceBranch: 'feature/569-github-cockpit',
    baseBranch: 'main',
    ...overrides,
  };
}

test('mostra estado remoto, review, mergeability e checks do cockpit existente', () => {
  const wrapper = mount(ProjectGitPullRequestStatus, {
    props: {
      branchPublished: true,
      checkingExisting: false,
      lookupUnavailable: false,
      targetRemote: 'origin',
      mutationBusy: false,
      existingPullRequest: pullRequest({
        cockpit: {
          remoteStatus: 'available',
          headSha: '0e5a7151234567890abcdef',
          draft: false,
          mergeable: true,
          reviewState: 'review-required',
          requestedReviewers: ['reviewer-a'],
          checks: [
            {
              name: 'Validate',
              status: 'success',
              detailsUrl:
                'https://github.com/felipe-urgal/dev-dashboard/actions/runs/1',
            },
            { name: 'Security', status: 'pending' },
          ],
        },
      }),
    },
  });

  assert.match(wrapper.text(), /0e5a7151/);
  assert.match(wrapper.text(), /Pronta para review/);
  assert.match(wrapper.text(), /Review pendente/);
  assert.match(wrapper.text(), /Mergeável/);
  assert.match(wrapper.text(), /reviewer-a/);

  const checks = wrapper.findAll('.git-pr-cockpit-checks li');
  assert.equal(checks.length, 2);
  assert.match(checks[0]!.text(), /PassouValidate/);
  assert.match(checks[1]!.text(), /PendenteSecurity/);

  const checkLink = checks[0]!.find('a');
  assert.equal(checkLink.attributes('target'), '_blank');
  assert.equal(checkLink.attributes('rel'), 'noopener noreferrer');
});

test('degrada somente os detalhes remotos quando GitHub está indisponível', () => {
  const wrapper = mount(ProjectGitPullRequestStatus, {
    props: {
      branchPublished: true,
      checkingExisting: false,
      lookupUnavailable: false,
      targetRemote: 'origin',
      mutationBusy: false,
      existingPullRequest: pullRequest({
        cockpit: {
          remoteStatus: 'rate-limited',
          reviewState: 'unknown',
          requestedReviewers: [],
          checks: [],
        },
      }),
    },
  });

  assert.match(wrapper.text(), /limite de consultas/);
  assert.match(wrapper.text(), /Git local continua disponível/);
  assert.match(wrapper.text(), /Mesclar com gh/);
  assert.match(wrapper.text(), /Fechar com gh/);
});
