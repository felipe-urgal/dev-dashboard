import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { flushPromises, mount } from '@vue/test-utils';

import type {
  GitDiffSnapshot,
  ProjectGitOverview,
} from '@dev-dashboard/contracts';

import ProjectGitDiffPage from '../src/components/ProjectGitDiffPage.vue';

const jsonHeaders = { 'content-type': 'application/json' };

const overview: ProjectGitOverview = {
  repository: true,
  branch: 'fix/cadastro',
  detached: false,
  ahead: 0,
  behind: 0,
  clean: false,
  files: [],
  recentCommits: [],
};

const snapshot: GitDiffSnapshot = {
  repository: true,
  scope: 'combined',
  files: [
    {
      path: 'src/signup/index.tsx',
      status: 'modified',
      additions: 1,
      deletions: 1,
      binary: false,
    },
    {
      path: 'src/terms.ts',
      status: 'added',
      additions: 2,
      deletions: 0,
      binary: false,
    },
  ],
};

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  window.sessionStorage.clear();
});

/**
 * O realce de sintaxe entra por import dinâmico: além dos microtasks, é preciso
 * esperar o módulo carregar antes de olhar para o conteúdo dos cartões.
 */
async function settle(wrapper: { html: () => string }): Promise<void> {
  await vi.waitFor(
    () => {
      if (wrapper.html().includes('Carregando '))
        throw new Error('diff ainda carregando');
    },
    { timeout: 5_000, interval: 10 },
  );
  await flushPromises();
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders,
  });
}

test('não deixa um overview atrasado de um projeto anterior sobrescrever o mais recente', async () => {
  const originalFetch = globalThis.fetch;
  const overviewByProject: Record<string, ProjectGitOverview> = {
    'projeto-a': { ...overview, branch: 'branch-a' },
    'projeto-b': { ...overview, branch: 'branch-b' },
    'projeto-c': { ...overview, branch: 'branch-c' },
  };
  let resolveDelayedOverviewB: (() => void) | undefined;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    const projectId = url.pathname.split('/')[3] ?? '';

    if (url.pathname.endsWith('/git/diff')) {
      return jsonResponse({ diff: { ...snapshot, files: [] } });
    }
    if (url.pathname.endsWith('/git')) {
      if (projectId === 'projeto-b') {
        await new Promise<void>((resolve) => {
          resolveDelayedOverviewB = resolve;
        });
      }
      return jsonResponse({ git: overviewByProject[projectId] });
    }
    return jsonResponse({}, 404);
  }) as typeof globalThis.fetch;

  const wrapper = mount(ProjectGitDiffPage, {
    props: { projectId: 'projeto-a' },
    attachTo: document.body,
  });
  cleanup = () => {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  };
  await settle(wrapper);
  assert.ok(wrapper.text().includes('branch-a'));

  // Troca rápida: o overview de "projeto-b" fica pendurado (a resposta é
  // segurada manualmente) enquanto a troca seguinte para "projeto-c" já
  // resolve. A resposta atrasada de "b" não pode sobrescrever "c" quando
  // finalmente chegar.
  await wrapper.setProps({ projectId: 'projeto-b' });
  await flushPromises();
  await wrapper.setProps({ projectId: 'projeto-c' });
  await settle(wrapper);
  assert.ok(wrapper.text().includes('branch-c'));

  resolveDelayedOverviewB?.();
  await flushPromises();
  assert.ok(
    wrapper.text().includes('branch-c'),
    'a resposta atrasada de projeto-b não deveria sobrescrever projeto-c',
  );
});
