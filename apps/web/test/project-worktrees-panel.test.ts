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

  it('lista o worktree principal e os worktrees vinculados', async () => {
    const wrapper = mount(ProjectWorktreesPanel, { props: { project } });
    await flushPromises();

    expect(fetchProjectGitWorktrees).toHaveBeenCalledWith('p1');
    expect(wrapper.text()).toContain('main');
    expect(wrapper.text()).toContain('principal');
    expect(wrapper.text()).toContain('feature/login');
    expect(wrapper.text()).toContain('feature-login');
    expect(wrapper.text()).toContain('1 vinculado');
    expect(wrapper.find('h1, h2').exists()).toBe(false);
    expect(wrapper.find('.worktrees-toolbar').exists()).toBe(true);
    expect(wrapper.findAll('.worktrees-danger-button')).toHaveLength(1);
  });

  it('cria worktree usando somente uma branch local livre e deriva o diretório', async () => {
    const wrapper = mount(ProjectWorktreesPanel, { props: { project } });
    await flushPromises();

    await wrapper.get('.worktrees-primary-button').trigger('click');

    const select = wrapper.get('select[name="branch"]');
    expect(select.text()).toContain('feature/dashboard');
    expect(select.text()).not.toContain('feature/login');
    expect(select.text()).not.toContain('main');

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(createProjectGitWorktree).toHaveBeenCalledWith('p1', {
      branch: 'feature/dashboard',
      directoryName: 'feature-dashboard',
      createBranch: false,
    });
    expect(wrapper.text()).toContain('Worktree criado.');
    expect(fetchProjectGitWorktrees).toHaveBeenCalledTimes(2);
  });

  it('cria nova branch deixando explícita a origem no checkout atual', async () => {
    const wrapper = mount(ProjectWorktreesPanel, { props: { project } });
    await flushPromises();

    await wrapper.get('.worktrees-primary-button').trigger('click');
    const radios = wrapper.findAll('input[type="radio"]');
    await radios[1]!.setValue(true);
    await wrapper.get('input[name="branch"]').setValue('feature/nova');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(createProjectGitWorktree).toHaveBeenCalledWith('p1', {
      branch: 'feature/nova',
      directoryName: 'feature-nova',
      createBranch: true,
    });
    expect(wrapper.text()).toContain('Worktree criado.');
  });

  it('mostra órfão e limpa o registro sem entrar no fluxo de remoção normal', async () => {
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

    const wrapper = mount(ProjectWorktreesPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.text()).toContain('órfão');
    expect(wrapper.text()).toContain('gitdir aponta para pasta ausente');
    expect(wrapper.text()).toContain('Limpar registro');

    const cleanupButton = wrapper
      .findAll('button')
      .find((button) => button.text().includes('Limpar registro'));
    expect(cleanupButton).toBeDefined();
    await cleanupButton!.trigger('click');
    await flushPromises();

    expect(pruneProjectGitWorktree).toHaveBeenCalledWith(
      'p1',
      'worktree-33333333333333333333',
    );
    expect(prepareProjectGitWorktreeRemoval).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Registro órfão removido.');
  });

  it('avisa alterações locais antes de remover e mantém a ação desabilitada', async () => {
    fetchProjectGitWorktrees.mockResolvedValue({
      ...inspection,
      worktrees: [
        inspection.worktrees[0],
        {
          ...inspection.worktrees[1],
          dirty: true,
        },
      ],
    });

    const wrapper = mount(ProjectWorktreesPanel, { props: { project } });
    await flushPromises();

    expect(wrapper.text()).toContain('alterações');
    expect(wrapper.text()).toContain(
      'Possui alterações locais; resolva antes de remover.',
    );
    const removeButton = wrapper.get('.worktrees-danger-button');
    expect(removeButton.attributes('disabled')).toBeDefined();
  });

  it('só remove depois da confirmação retornada pelo backend', async () => {
    const wrapper = mount(ProjectWorktreesPanel, { props: { project } });
    await flushPromises();

    await wrapper.get('.worktrees-danger-button').trigger('click');
    await flushPromises();

    expect(prepareProjectGitWorktreeRemoval).toHaveBeenCalledWith(
      'p1',
      'worktree-22222222222222222222',
    );
    expect(removeProjectGitWorktree).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Confirmar remoção?');

    const confirmationButtons = wrapper.findAll('.worktrees-danger-button');
    await confirmationButtons.at(-1)!.trigger('click');
    await flushPromises();

    expect(removeProjectGitWorktree).toHaveBeenCalledWith(
      'p1',
      'worktree-22222222222222222222',
      'confirm-token',
    );
    expect(wrapper.text()).toContain('Worktree removido.');
  });
});
