import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { flushPromises, mount } from '@vue/test-utils';

import ProjectGitHistoryPage from '../src/components/ProjectGitHistoryPage.vue';

const jsonHeaders = { 'content-type': 'application/json' };

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders,
  });
}

/** O modal é teleportado para o body, então olhamos o documento inteiro. */
function documentHtml(): string {
  return document.body.innerHTML;
}

async function settle(marker = 'Carregando'): Promise<void> {
  await vi.waitFor(
    () => {
      if (documentHtml().includes(marker)) throw new Error('ainda carregando');
    },
    { timeout: 5_000, interval: 10 },
  );
  await flushPromises();
}

test('não deixa um workspace atrasado de um projeto anterior sobrescrever o mais recente', async () => {
  const originalFetch = globalThis.fetch;
  function workspaceFor(branchName: string) {
    return {
      workspace: {
        branches: [
          {
            name: branchName,
            shortName: branchName,
            kind: 'local',
            current: true,
            ahead: 0,
            behind: 0,
          },
        ],
        remotes: [],
      },
    };
  }
  let resolveDelayedWorkspaceB: (() => void) | undefined;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    const projectId = url.pathname.split('/')[3] ?? '';

    if (url.pathname.endsWith('/git/workspace')) {
      if (projectId === 'projeto-b') {
        await new Promise<void>((resolve) => {
          resolveDelayedWorkspaceB = resolve;
        });
      }
      return jsonResponse(workspaceFor(`branch-local-${projectId}`));
    }
    if (
      url.pathname.endsWith('/git/exclusive-branch-commits') ||
      url.pathname.endsWith('/git/commits')
    ) {
      return jsonResponse({
        history: {
          branch: 'main',
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 1,
          commits: [],
        },
      });
    }
    return jsonResponse({}, 404);
  }) as typeof globalThis.fetch;

  const wrapper = mount(ProjectGitHistoryPage, {
    props: { projectId: 'projeto-a' },
    attachTo: document.body,
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await settle('Carregando commits');
  assert.ok(documentHtml().includes('branch-local-projeto-a'));

  await wrapper.setProps({ projectId: 'projeto-b' });
  await flushPromises();
  await wrapper.setProps({ projectId: 'projeto-c' });
  await settle('Carregando commits');
  assert.ok(documentHtml().includes('branch-local-projeto-c'));

  resolveDelayedWorkspaceB?.();
  await flushPromises();
  assert.ok(
    documentHtml().includes('branch-local-projeto-c'),
    'a resposta atrasada de projeto-b não deveria sobrescrever projeto-c',
  );
  assert.ok(!documentHtml().includes('branch-local-projeto-b'));
});
