import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import type { ProjectGitOverview } from '@dev-dashboard/contracts';

const api = vi.hoisted(() => ({
  prepareProjectGitUndo: vi.fn(),
  undoProjectGitCommit: vi.fn(),
  undoProjectGitFile: vi.fn(),
}));

vi.mock('../src/api', () => api);

import ProjectGitUndoPage from '../src/components/ProjectGitUndoPage.vue';

const latestCommit = {
  hash: 'a'.repeat(40),
  shortHash: 'aaaaaaa',
  subject: 'feat: alteração local',
  authorName: 'Dashboard Test',
  authorEmail: 'dashboard@example.test',
  authoredAt: '2026-07-31T10:00:00.000Z',
};

function overview(
  overrides: Partial<ProjectGitOverview> = {},
): ProjectGitOverview {
  return {
    repository: true,
    branch: 'feature/git-undo',
    detached: false,
    ahead: 1,
    behind: 0,
    clean: true,
    files: [],
    latestCommit,
    recentCommits: [latestCommit],
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  api.prepareProjectGitUndo.mockReset();
  api.undoProjectGitCommit.mockReset();
  api.undoProjectGitFile.mockReset();
  api.prepareProjectGitUndo.mockResolvedValue({
    token: 'u'.repeat(64),
    operation: 'commit',
    target: 'feature/git-undo',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

test('desfaz commit local e informa que alterações foram mantidas', async () => {
  api.undoProjectGitCommit.mockResolvedValue({
    strategy: 'reset',
    undone: {
      hash: latestCommit.hash,
      shortHash: latestCommit.shortHash,
      subject: latestCommit.subject,
    },
  });

  const wrapper = mount(ProjectGitUndoPage, {
    props: {
      projectId: 'p1',
      overview: overview(),
      busy: false,
    },
  });

  assert.match(wrapper.text(), /Desfazer último commit/);
  await wrapper.find('.git-undo-danger').trigger('click');
  await flushPromises();

  assert.deepEqual(api.prepareProjectGitUndo.mock.calls[0], [
    'p1',
    'commit',
    'feature/git-undo',
  ]);
  assert.deepEqual(api.undoProjectGitCommit.mock.calls[0], [
    'p1',
    'u'.repeat(64),
  ]);
  assert.match(wrapper.text(), /As alterações foram mantidas para edição/);
  assert.equal(wrapper.emitted('changed')?.length, 1);
});

test('usa revert quando o último commit já está publicado', async () => {
  api.undoProjectGitCommit.mockResolvedValue({
    strategy: 'revert',
    undone: {
      hash: latestCommit.hash,
      shortHash: latestCommit.shortHash,
      subject: latestCommit.subject,
    },
    result: {
      hash: 'b'.repeat(40),
      shortHash: 'bbbbbbb',
      subject: 'Revert "feat: alteração local"',
    },
  });

  const wrapper = mount(ProjectGitUndoPage, {
    props: {
      projectId: 'p1',
      overview: overview({
        upstream: 'origin/feature/git-undo',
        ahead: 0,
      }),
      busy: false,
    },
  });

  assert.match(wrapper.text(), /Reverter commit publicado/);
  await wrapper.find('.git-undo-danger').trigger('click');
  await flushPromises();

  assert.match(wrapper.text(), /revertido com um novo commit/);
});

test('desfaz um arquivo alterado após confirmação', async () => {
  api.prepareProjectGitUndo.mockResolvedValue({
    token: 'f'.repeat(64),
    operation: 'file',
    target: 'README.md',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  api.undoProjectGitFile.mockResolvedValue('README.md');

  const wrapper = mount(ProjectGitUndoPage, {
    props: {
      projectId: 'p1',
      overview: overview({
        clean: false,
        files: [
          {
            path: 'README.md',
            indexStatus: '.',
            worktreeStatus: 'M',
            status: 'modified',
          },
        ],
      }),
      busy: false,
    },
  });

  await wrapper.find('.git-undo-file-button').trigger('click');
  await flushPromises();

  assert.deepEqual(api.prepareProjectGitUndo.mock.calls[0], [
    'p1',
    'file',
    'README.md',
  ]);
  assert.deepEqual(api.undoProjectGitFile.mock.calls[0], [
    'p1',
    'README.md',
    'f'.repeat(64),
  ]);
  assert.match(wrapper.text(), /Alterações de "README.md" desfeitas/);
  assert.equal(wrapper.emitted('changed')?.length, 1);
});
