import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

const {
  fetchProjectGitWorkspace,
  fetchProjectGitWorktrees,
  createProjectGitWorktree,
  prepareProjectGitWorktreeRemoval,
  pruneProjectGitWorktree,
  removeProjectGitWorktree,
} = vi.hoisted(() => ({
  fetchProjectGitWorkspace: vi.fn(),
  fetchProjectGitWorktrees: vi.fn(),
  createProjectGitWorktree: vi.fn(),
  prepareProjectGitWorktreeRemoval: vi.fn(),
  pruneProjectGitWorktree: vi.fn(),
  removeProjectGitWorktree: vi.fn(),
}));

vi.mock('../src/api/git-workspace', () => ({
  fetchProjectGitWorkspace,
}));

vi.mock('../src/api/git-worktrees', () => ({
  fetchProjectGitWorktrees,
  createProjectGitWorktree,
  prepareProjectGitWorktreeRemoval,
  pruneProjectGitWorktree,
  removeProjectGitWorktree,
}));

import ProjectWorktreesPanel from '../src/components/ProjectWorktreesPanel.vue';

const project: Project = {
  id: 'p1',
  workspaceId: 'w1',
  name: 'App',
  path: '/projetos/app',
  type: 'node',
  source: 'workspace',
  enabled: true,
  capabilities: ['git'],
};

const inspection = {
  state: 'ready' as const,
  observedAt: '2026-09-11T12:00:00.000Z',
  worktrees: [
    {
      id: 'worktree-11111111111111111111',
      path: '/projetos/app',
      head: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      branch: 'main',
      detached: false,
      bare: false,
      kind: 'main' as const,
      locked: false,
      prunable: false,
    },
    {
      id: 'worktree-22222222222222222222',
      path: '/projetos/feature-login',
      head: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      branch: 'feature/login',
      detached: false,
      bare: false,
      kind: 'linked' as const,
      locked: false,
      prunable: false,
    },
  ],
};

const workspace = {
  branches: [
    {
      name: 'main',
      shortName: 'main',
      kind: 'local' as const,
      current: true,
      ahead: 0,
      behind: 0,
    },
    {
      name: 'feature/login',
      shortName: 'feature/login',
      kind: 'local' as const,
      current: false,
      ahead: 0,
      behind: 0,
    },
    {
      name: 'feature/dashboard',
      shortName: 'feature/dashboard',
      kind: 'local' as const,
      current: false,
      ahead: 0,
      behind: 0,
    },
  ],
  remotes: [],
};

describe('ProjectWorktreesPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    fetchProjectGitWorkspace.mockResolvedValue(workspace);
    fetchProjectGitWorktrees.mockResolvedValue(inspection);
    createProjectGitWorktree.mockResolvedValue({
      state: 'created',
      path: '/projetos/feature-dashboard',
      branch: 'feature/dashboard',
    });
    prepareProjectGitWorktreeRemoval.mockResolvedValue({
      state: 'ready',
      worktreeId: 'worktree-22222222222222222222',
      path: '/projetos/feature-login',
      branch: 'feature/login',
      confirmationToken: 'confirm-token',
      expiresAt: '2026-09-11T12:01:00.000Z',
    });
    pruneProjectGitWorktree.mockResolvedValue({
      state: 'pruned',
      worktreeId: 'worktree-33333333333333333333',
      path: '/projetos/feature-old',
      branch: 'feature/old',
    });
    removeProjectGitWorktree.mockResolvedValue({
      state: 'removed',
      worktreeId: 'worktree-22222222222222222222',
      path: '/projetos/feature-login',
      branch: 'feature/login',
    });
  });

  function mountPanel() {
    return mount(ProjectWorktreesPanel, {
      props: { project },
      attachTo: document.body,
    });
  }

  const dialog = () => document.body.querySelector('.git-wt-dialog')!;

  async function submitCreate() {
    dialog().dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();
  }

  it('cria worktree usando somente uma branch local livre e deriva o diretório', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    await wrapper.get('.worktrees-primary-button').trigger('click');
    await flushPromises();

    const select = dialog().querySelector('select[name="branch"]')!;
    expect(select.textContent).toContain('feature/dashboard');
    expect(select.textContent).not.toContain('feature/login');
    expect(select.textContent).not.toContain('main');

    await submitCreate();

    expect(createProjectGitWorktree).toHaveBeenCalledWith('p1', {
      branch: 'feature/dashboard',
      directoryName: 'feature-dashboard',
      createBranch: false,
    });
    expect(wrapper.text()).toContain('Worktree criado.');
    wrapper.unmount();
  });

  it('cria nova branch deixando explícita a origem no checkout atual', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    await wrapper.get('.worktrees-primary-button').trigger('click');
    await flushPromises();
    const radios = dialog().querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    );
    radios[1]!.click();
    await flushPromises();
    const input = dialog().querySelector<HTMLInputElement>(
      'input[name="branch"]',
    )!;
    input.value = 'feature/nova';
    input.dispatchEvent(new Event('input'));
    await flushPromises();
    await submitCreate();

    expect(createProjectGitWorktree).toHaveBeenCalledWith('p1', {
      branch: 'feature/nova',
      directoryName: 'feature-nova',
      createBranch: true,
    });
    wrapper.unmount();
  });

  it('limpa o registro órfão sem entrar no fluxo de remoção normal', async () => {
    fetchProjectGitWorktrees.mockResolvedValue({
      ...inspection,
      worktrees: [
        inspection.worktrees[0],
        {
          ...inspection.worktrees[1],
          id: 'worktree-33333333333333333333',
          path: '/projetos/feature-old',
          branch: 'feature/old',
          prunable: true,
          pruneReason: 'gitdir aponta para pasta ausente',
        },
      ],
    });

    const wrapper = mountPanel();
    await flushPromises();

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Limpar registro'))!
      .trigger('click');
    await flushPromises();

    expect(pruneProjectGitWorktree).toHaveBeenCalledWith(
      'p1',
      'worktree-33333333333333333333',
    );
    expect(prepareProjectGitWorktreeRemoval).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('não permite remover um worktree com alterações locais', async () => {
    fetchProjectGitWorktrees.mockResolvedValue({
      ...inspection,
      worktrees: [
        inspection.worktrees[0],
        { ...inspection.worktrees[1], dirty: true },
      ],
    });

    const wrapper = mountPanel();
    await flushPromises();

    expect(
      wrapper.get('.worktrees-danger-button').attributes('disabled'),
    ).toBeDefined();
    wrapper.unmount();
  });

  it('só remove depois da confirmação retornada pelo backend', async () => {
    const wrapper = mountPanel();
    await flushPromises();

    await wrapper.get('.worktrees-danger-button').trigger('click');
    await flushPromises();

    expect(prepareProjectGitWorktreeRemoval).toHaveBeenCalledWith(
      'p1',
      'worktree-22222222222222222222',
    );
    expect(removeProjectGitWorktree).not.toHaveBeenCalled();

    document.body
      .querySelector<HTMLButtonElement>('.worktrees-confirm-remove')!
      .click();
    await flushPromises();

    expect(removeProjectGitWorktree).toHaveBeenCalledWith(
      'p1',
      'worktree-22222222222222222222',
      'confirm-token',
    );
    wrapper.unmount();
  });
});
