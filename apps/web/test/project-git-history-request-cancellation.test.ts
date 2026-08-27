import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

const api = vi.hoisted(() => ({
  fetchProjectGitCommitDetail: vi.fn(),
  fetchProjectGitCommitFileDiff: vi.fn(),
  fetchProjectGitCommits: vi.fn(),
  fetchProjectGitWorkspace: vi.fn(),
}));

vi.mock('../src/api', () => ({
  fetchProjectGitCommitDetail: api.fetchProjectGitCommitDetail,
  fetchProjectGitCommitFileDiff: api.fetchProjectGitCommitFileDiff,
  fetchProjectGitCommits: api.fetchProjectGitCommits,
}));

vi.mock('../src/api/git-workspace', () => ({
  fetchProjectGitWorkspace: api.fetchProjectGitWorkspace,
}));

import { useProjectGitHistoryPage } from '../src/composables/useProjectGitHistoryPage';

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

afterEach(() => {
  vi.resetAllMocks();
});

test('cancela o diff pendente ao selecionar outro arquivo do commit', async () => {
  let firstFileSignal: AbortSignal | undefined;
  let state: ReturnType<typeof useProjectGitHistoryPage> | undefined;

  api.fetchProjectGitWorkspace.mockResolvedValue({ branches: [], remotes: [] });
  api.fetchProjectGitCommits.mockResolvedValue({
    branch: 'main',
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
    commits: [commit],
  });
  api.fetchProjectGitCommitDetail.mockResolvedValue({
    ...commit,
    body: commit.subject,
    files,
    additions: 2,
    deletions: 2,
    patch: '',
    truncated: false,
    masked: false,
    redactionCount: 0,
  });
  api.fetchProjectGitCommitFileDiff.mockImplementation(
    async (_projectId, _hash, path, signal?: AbortSignal) => {
      if (path === files[0]!.path) {
        firstFileSignal = signal;
        return await new Promise((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Abortado', 'AbortError')),
            { once: true },
          );
        });
      }

      return {
        hash: commit.hash,
        path: files[1]!.path,
        status: 'modified',
        binary: false,
        content: '@@ -1 +1 @@\n-antigo\n+novo',
        truncated: false,
        masked: false,
        redactionCount: 0,
      };
    },
  );

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
  }
});
