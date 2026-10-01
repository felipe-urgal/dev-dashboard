import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

import type { ProjectGitOverview } from '@dev-dashboard/contracts';

const api = vi.hoisted(() => ({
  discardProjectGitFile: vi.fn(),
  getProjectGitUndoStatus: vi.fn(),
  prepareProjectGitMutation: vi.fn(),
  prepareProjectGitUndo: vi.fn(),
  removeProjectGitUntrackedFile: vi.fn(),
  undoProjectGitCommit: vi.fn(),
  undoProjectGitFile: vi.fn(),
  unstageProjectGitFile: vi.fn(),
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

const previousCommit = {
  hash: 'b'.repeat(40),
  shortHash: 'bbbbbbb',
  subject: 'docs: atualiza instruções',
  authorName: 'Outro Autor',
  authorEmail: 'outro@example.test',
  authoredAt: '2026-07-30T10:00:00.000Z',
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
    recentCommits: [latestCommit, previousCommit],
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  for (const mock of Object.values(api)) mock.mockReset();
  api.getProjectGitUndoStatus.mockResolvedValue({
    available: true,
    branch: 'feature/git-undo',
    strategy: 'reset',
  });
  api.prepareProjectGitUndo.mockResolvedValue({
    token: 'u'.repeat(64),
    operation: 'commit',
    target: 'feature/git-undo',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  api.prepareProjectGitMutation.mockResolvedValue({
    token: 'm'.repeat(64),
    operation: 'discard-file',
    target: 'README.md',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

test('usa o preflight real para distinguir commit local de publicado', async () => {
  api.getProjectGitUndoStatus.mockResolvedValue({
    available: true,
    branch: 'feature/git-undo',
    strategy: 'revert',
    reference: 'origin/feature/git-undo',
  });

  const wrapper = mount(ProjectGitUndoPage, {
    props: { projectId: 'p1', overview: overview(), busy: false },
  });
  await flushPromises();

  assert.match(wrapper.text(), /Publicado no remoto/);
  assert.match(wrapper.text(), /novo commit inverso/);
  assert.match(wrapper.text(), /aguardando Push/);
  assert.match(wrapper.find('.git-undo-danger').text(), /Reverter commit/);
});

test('bloqueia undo quando a branch precisa sincronizar', async () => {
  api.getProjectGitUndoStatus.mockResolvedValue({
    available: false,
    branch: 'feature/git-undo',
    reason: 'behind',
    reference: 'origin/feature/git-undo',
  });

  const wrapper = mount(ProjectGitUndoPage, {
    props: { projectId: 'p1', overview: overview(), busy: false },
  });
  await flushPromises();

  assert.match(wrapper.text(), /Sincronização necessária/);
  assert.match(wrapper.text(), /Sincronize antes de desfazer/);
  assert.equal(
    (wrapper.find('.git-undo-danger').element as HTMLButtonElement).disabled,
    true,
  );
});

test('desfaz commit local e informa que alterações ficaram staged', async () => {
  api.undoProjectGitCommit.mockResolvedValue({
    strategy: 'reset',
    undone: {
      hash: latestCommit.hash,
      shortHash: latestCommit.shortHash,
      subject: latestCommit.subject,
    },
  });

  const wrapper = mount(ProjectGitUndoPage, {
    props: { projectId: 'p1', overview: overview(), busy: false },
  });
  await flushPromises();
  await wrapper.find('.git-undo-danger').trigger('click');
  await flushPromises();

  assert.deepEqual(api.prepareProjectGitUndo.mock.calls[0], [
    'p1',
    'commit',
    'feature/git-undo',
  ]);
  assert.match(wrapper.text(), /alterações ficaram staged/);
  assert.equal(wrapper.emitted('changed')?.length, 1);
});

test('separa unstage, descarte e exclusão de arquivo não rastreado', async () => {
  api.unstageProjectGitFile.mockResolvedValue('staged.txt');
  api.discardProjectGitFile.mockResolvedValue('mixed.txt');
  api.removeProjectGitUntrackedFile.mockResolvedValue('novo.txt');

  const wrapper = mount(ProjectGitUndoPage, {
    props: {
      projectId: 'p1',
      overview: overview({
        clean: false,
        files: [
          {
            path: 'staged.txt',
            indexStatus: 'M',
            worktreeStatus: '.',
            status: 'modified',
          },
          {
            path: 'mixed.txt',
            indexStatus: 'M',
            worktreeStatus: 'M',
            status: 'modified',
          },
          {
            path: 'novo.txt',
            indexStatus: '?',
            worktreeStatus: '?',
            status: 'untracked',
          },
        ],
      }),
      busy: false,
    },
  });
  await flushPromises();
  await wrapper.findAll('[role="tab"]')[1]!.trigger('click');

  assert.match(wrapper.text(), /Tirar do staged/);
  assert.match(wrapper.text(), /Descartar alterações/);
  assert.match(wrapper.text(), /Excluir arquivo/);

  const stagedRow = wrapper
    .findAll('.git-undo-files article')
    .find((row) => row.text().includes('staged.txt'))!;
  await stagedRow.get('button').trigger('click');
  await flushPromises();
  assert.deepEqual(api.unstageProjectGitFile.mock.calls[0], [
    'p1',
    'staged.txt',
  ]);

  const mixedRow = wrapper
    .findAll('.git-undo-files article')
    .find((row) => row.text().includes('mixed.txt'))!;
  const discard = mixedRow
    .findAll('button')
    .find((button) => button.text().includes('Descartar alterações'))!;
  await discard.trigger('click');
  await flushPromises();
  assert.equal(api.discardProjectGitFile.mock.calls.length, 1);

  const untrackedRow = wrapper
    .findAll('.git-undo-files article')
    .find((row) => row.text().includes('novo.txt'))!;
  await untrackedRow.get('button').trigger('click');
  await flushPromises();
  assert.equal(api.removeProjectGitUntrackedFile.mock.calls.length, 1);
});

test('rename mostra os dois paths e oferece restauração completa', async () => {
  api.prepareProjectGitUndo.mockResolvedValue({
    token: 'f'.repeat(64),
    operation: 'file',
    target: 'novo.ts',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  api.undoProjectGitFile.mockResolvedValue('novo.ts');

  const wrapper = mount(ProjectGitUndoPage, {
    props: {
      projectId: 'p1',
      overview: overview({
        clean: false,
        files: [
          {
            path: 'novo.ts',
            previousPath: 'antigo.ts',
            indexStatus: 'R',
            worktreeStatus: '.',
            status: 'renamed',
          },
        ],
      }),
      busy: false,
    },
  });
  await flushPromises();
  await wrapper.findAll('[role="tab"]')[1]!.trigger('click');

  assert.match(wrapper.text(), /antigo\.ts → novo\.ts/);
  assert.match(wrapper.text(), /Tirar do staged/);
  const restore = wrapper
    .findAll('button')
    .find((button) => button.text().includes('Restaurar rename'))!;
  await restore.trigger('click');
  await flushPromises();

  assert.deepEqual(api.undoProjectGitFile.mock.calls[0], [
    'p1',
    'novo.ts',
    'f'.repeat(64),
  ]);
});
