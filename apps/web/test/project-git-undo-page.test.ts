import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { NDropdown } from 'naive-ui';

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

  const row = (path: string) => wrapper.get(`[data-path="${path}"]`);

  // A ação segura fica à vista; só o staged é tirado, sem apagar nada.
  await row('staged.txt')
    .findAll('button')
    .find((button) => button.text() === 'Tirar do staged')!
    .trigger('click');
  await flushPromises();
  assert.deepEqual(api.unstageProjectGitFile.mock.calls[0], [
    'p1',
    'staged.txt',
  ]);

  // As ações destrutivas ficam no menu e pedem confirmação.
  row('mixed.txt').findComponent(NDropdown).vm.$emit('select', 'discard');
  await flushPromises();
  assert.equal(api.discardProjectGitFile.mock.calls.length, 1);

  assert.equal(
    row('novo.txt')
      .findAll('button')
      .some((button) => button.text() === 'Tirar do staged'),
    false,
  );
  row('novo.txt').findComponent(NDropdown).vm.$emit('select', 'remove');
  await flushPromises();
  assert.equal(api.removeProjectGitUntrackedFile.mock.calls.length, 1);
});

test('"Tirar tudo do staged" remove cada arquivo staged, um por um, sem apagar conteúdo', async () => {
  api.unstageProjectGitFile.mockResolvedValue('ok');
  const staged = (path: string) => ({
    path,
    indexStatus: 'M',
    worktreeStatus: '.',
    status: 'modified' as const,
  });

  const wrapper = mount(ProjectGitUndoPage, {
    props: {
      projectId: 'p1',
      overview: overview({
        clean: false,
        files: [
          staged('a.txt'),
          staged('b.txt'),
          {
            path: 'c.txt',
            indexStatus: '.',
            worktreeStatus: 'M',
            status: 'modified',
          },
        ],
      }),
      busy: false,
    },
  });
  await flushPromises();

  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'Tirar tudo do staged')!
    .trigger('click');
  await flushPromises();

  assert.deepEqual(
    api.unstageProjectGitFile.mock.calls.map((call) => call[1]),
    ['a.txt', 'b.txt'],
  );
  assert.match(wrapper.text(), /2 arquivos removidos do staged/);
});

test('o bloqueio por alterações locais leva aos arquivos e o de sincronização abre a aba', async () => {
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

  await wrapper
    .findAll('button')
    .find((button) => button.text() === 'Ir para Sincronização')!
    .trigger('click');
  assert.equal(wrapper.emitted('open-sync')?.length, 1);
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

  assert.match(wrapper.text(), /antigo\.ts → novo\.ts/);
  assert.match(wrapper.text(), /Tirar do staged/);
  wrapper
    .get('[data-path="novo.ts"]')
    .findComponent(NDropdown)
    .vm.$emit('select', 'restore');
  await flushPromises();

  assert.deepEqual(api.undoProjectGitFile.mock.calls[0], [
    'p1',
    'novo.ts',
    'f'.repeat(64),
  ]);
});
