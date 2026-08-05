import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';

import { flushPromises, mount } from '@vue/test-utils';

import type {
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import ProjectGitPanel from '../src/components/ProjectGitPanel.vue';
import { makeProject } from './support/activity-fixtures.js';

interface RequestRecord {
  path: string;
  body?: unknown;
}

const overview: ProjectGitOverview = {
  repository: true,
  branch: 'main',
  detached: false,
  upstream: 'origin/main',
  ahead: 0,
  behind: 0,
  clean: true,
  files: [],
  recentCommits: [],
};

const workspace: ProjectGitWorkspace = {
  branches: [
    {
      name: 'main',
      shortName: 'main',
      kind: 'local',
      current: true,
      upstream: 'origin/main',
      ahead: 0,
      behind: 0,
    },
    {
      name: 'origin/main',
      shortName: 'main',
      kind: 'remote',
      current: false,
      remote: 'origin',
      ahead: 0,
      behind: 0,
    },
    {
      name: 'bugfix/ajustar-pesquisas',
      shortName: 'bugfix/ajustar-pesquisas',
      kind: 'local',
      current: false,
      ahead: 0,
      behind: 0,
    },
  ],
  remotes: [
    {
      name: 'origin',
      fetchUrl: 'git@github.com:felipe-urgal/projeto.git',
      pushUrl: 'git@github.com:felipe-urgal/projeto.git',
      role: 'origin',
    },
  ],
};

let restoreFetch: (() => void) | undefined;

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('publica uma branch somente local diretamente pela linha da branch', async () => {
  const originalFetch = globalThis.fetch;
  const requests: RequestRecord[] = [];

  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = new URL(String(input), 'http://localhost');
    const body = init?.body
      ? JSON.parse(String(init.body)) as unknown
      : undefined;
    requests.push({ path: url.pathname, ...(body ? { body } : {}) });

    if (url.pathname.endsWith('/git/branches/publish/confirmations')) {
      return jsonResponse({
        confirmation: {
          token: 'p'.repeat(64),
          operation: 'push',
          target: 'bugfix/ajustar-pesquisas',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      }, 201);
    }
    if (url.pathname.endsWith('/git/branches/publish')) {
      return jsonResponse({
        branch: { branch: 'bugfix/ajustar-pesquisas' },
      });
    }
    if (url.pathname.endsWith('/git/workspace')) {
      return jsonResponse({ workspace });
    }
    if (url.pathname.endsWith('/git')) {
      return jsonResponse({ git: overview });
    }
    return jsonResponse({ error: 'NOT_FOUND', message: 'Não encontrado.' }, 404);
  }) as typeof fetch;

  restoreFetch = () => {
    globalThis.fetch = originalFetch;
  };

  const wrapper = mount(ProjectGitPanel, {
    props: { project: makeProject() },
    global: { stubs: { Teleport: true } },
  });
  await flushPromises();
  await flushPromises();

  const branchesTab = wrapper
    .findAll('.git-subtabs button')
    .find((button) => button.text() === 'Branches');
  assert.ok(branchesTab);
  await branchesTab.trigger('click');
  await flushPromises();

  const localOnlyRow = wrapper
    .findAll('.branch-table-row')
    .find((row) => row.text().includes('bugfix/ajustar-pesquisas'));
  assert.ok(localOnlyRow);
  assert.match(localOnlyRow.text(), /Somente local/);

  const publishButton = localOnlyRow
    .findAll('button')
    .find((button) => button.text() === 'Publicar');
  assert.ok(publishButton);
  await publishButton.trigger('click');
  await flushPromises();
  await flushPromises();

  const confirmation = requests.find((request) =>
    request.path.endsWith('/git/branches/publish/confirmations'),
  );
  const publication = requests.find((request) =>
    request.path.endsWith('/git/branches/publish')
      && !request.path.endsWith('/confirmations'),
  );

  assert.deepEqual(confirmation?.body, {
    branch: 'bugfix/ajustar-pesquisas',
  });
  assert.deepEqual(publication?.body, {
    branch: 'bugfix/ajustar-pesquisas',
    confirmationToken: 'p'.repeat(64),
  });
  assert.match(
    wrapper.text(),
    /Branch "bugfix\/ajustar-pesquisas" publicada em origin\/bugfix\/ajustar-pesquisas/,
  );

  const mainRow = wrapper
    .findAll('.branch-table-row')
    .find((row) => row.text().includes('main'));
  assert.ok(mainRow);
  assert.doesNotMatch(mainRow.text(), /Publicar/);

  wrapper.unmount();
});
