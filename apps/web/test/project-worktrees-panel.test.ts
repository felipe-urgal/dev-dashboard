import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

const {
  fetchProjectGitWorktrees,
  createProjectGitWorktree,
  prepareProjectGitWorktreeRemoval,
  removeProjectGitWorktree,
} = vi.hoisted(() => ({
  fetchProjectGitWorktrees: vi.fn(),
  createProjectGitWorktree: vi.fn(),
  prepareProjectGitWorktreeRemoval: vi.fn(),
  removeProjectGitWorktree: vi.fn(),
}));

vi.mock('../src/api/git-worktrees', () => ({
  fetchProjectGitWorktrees,
  createProjectGitWorktree,
  prepareProjectGitWorktreeRemoval,
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

describe('ProjectWorktreesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(wrapper.findAll('.worktrees-danger-button')).toHaveLength(1);
  });

  it('cria um worktree e deriva o diretório quando ele fica vazio', async () => {
    const wrapper = mount(ProjectWorktreesPanel, { props: { project } });
    await flushPromises();

    await wrapper.get('.worktrees-primary-button').trigger('click');
    await wrapper.get('input[name="branch"]').setValue('feature/dashboard');
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
