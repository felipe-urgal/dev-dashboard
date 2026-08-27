import assert from 'node:assert/strict';
import { test } from 'vitest';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import { useProjectGitHistoryPage } from '../src/composables/useProjectGitHistoryPage';

const jsonHeaders = { 'content-type': 'application/json' };

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { headers: jsonHeaders });
}

const commit = {
  hash: 'a'.repeat(40),
  shortHash: 'aaaaaaa',
  subject: 'fix: ajusta histórico',
  authorName: 'Felipe Urgal',
  authorEmail: 'felipe@example.test',
  authoredAt: '2026-08-27T12:00:00.000Z',
  parentCount: 1,
};

const files = [
  {
    path: 'src/primeiro.ts',
    status: 'modified' as const,
    additions: 1,
    deletions: 1,
    binary: false,
  },
  {
    path: 'src/segundo.ts',
    status: 'modified' as const,
    additions: 1,
    deletions: 1,
    binary: false,
  },
];

test('cancela o diff pendente ao selecionar outro arquivo do commit', async () => {
  const originalFetch = globalThis.fetch;
  let firstFileSignal: AbortSignal | undefined;
  let state: ReturnType<typeof useProjectGitHistoryPage> | undefined;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');

    if (url.pathname.endsWith('/git/workspace')) {
      return jsonResponse({ workspace: { branches: [], remotes: [] } });
    }

    if (url.pathname.endsWith('/git/exclusive-branch-commits')) {
      return jsonResponse({
        history: {
          branch: 'main',
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
          commits: [commit],
        },
      });
    }

    if (url.pathname.endsWith(`/git/commits/${commit.hash}`)) {
      return jsonResponse({
        detail: {
          ...commit,
          body: commit.subject,
          files,
          additions: 2,
          deletions: 2,
          patch: '',
          truncated: false,
          masked: false,
          redactionCount: 0,
        },
      });
    }

    if (url.pathname.endsWith('/file')) {
      const path = url.searchParams.get('path');
      if (path === files[0]!.path) {
        firstFileSignal = init?.signal ?? undefined;
        return await new Promise<Response>((_resolve, reject) => {
          firstFileSignal?.addEventListener(
            'abort',
            () => reject(new DOMException('Abortado', 'AbortError')),
            { once: true },
          );
        });
      }

      return jsonResponse({
        file: {
          hash: commit.hash,
          path: files[1]!.path,
          status: 'modified',
          binary: false,
          content: '@@ -1 +1 @@\n-antigo\n+novo',
          truncated: false,
          masked: false,
          redactionCount: 0,
        },
      });
    }

    return jsonResponse({});
  }) as typeof globalThis.fetch;

  const wrapper = mount(
    defineComponent({
      setup() {
        state = useProjectGitHistoryPage({ projectId: 'projeto-1' });
        return () => h('div');
      },
    }),
  );

  try {
    await flushPromises();
    await state!.openCommit(commit);
    await flushPromises();

    assert.ok(firstFileSignal, 'esperava o request do primeiro diff');
    assert.equal(firstFileSignal!.aborted, false);

    state!.selectFile(files[1]!.path);
    await flushPromises();

    assert.equal(firstFileSignal!.aborted, true);
    assert.equal(state!.fileStates.value[0]!.error, '');
    assert.equal(state!.fileStates.value[0]!.loading, false);
    assert.equal(state!.fileStates.value[1]!.diff?.path, files[1]!.path);
  } finally {
    wrapper.unmount();
    globalThis.fetch = originalFetch;
  }
});
