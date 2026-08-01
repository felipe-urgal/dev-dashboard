import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

vi.mock('../src/api', () => ({
  fetchProjectProcess: vi.fn().mockResolvedValue({
    id: 'process-p1',
    projectId: 'p1',
    kind: 'server',
    status: 'running',
    port: 3003,
  }),
  fetchProjectGit: vi.fn().mockResolvedValue({
    repository: true,
    branch: 'feature/listar-branch',
    detached: false,
    ahead: 0,
    behind: 0,
    clean: true,
    files: [],
    recentCommits: [],
    stashes: [],
  }),
}));

import ProjectCard from '../src/components/ProjectCard.vue';

const project: Project = {
  id: 'p1',
  workspaceId: 'w1',
  name: 'Projeto sem avatar',
  path: '/projetos/sem-avatar',
  type: 'node',
  source: 'workspace',
  favorite: false,
  capabilities: ['git', 'server'],
};

describe('ProjectCard', () => {
  it('renderiza a branch atual e a porta nos metadados', async () => {
    const wrapper = mount(ProjectCard, {
      props: { project },
      global: {
        stubs: {
          RouterLink: {
            template: '<a><slot /></a>',
          },
        },
      },
    });

    expect(wrapper.find('.project-avatar').exists()).toBe(false);
    expect(wrapper.get('.project-row-identity').text())
      .toContain('Projeto sem avatar');
    await vi.waitFor(() => {
      expect(wrapper.get('.project-branch-badge').text())
        .toContain('feature/listar-branch');
      expect(wrapper.get('.project-port-badge').text())
        .toBe('Porta 3003');
    });
    expect(wrapper.text()).not.toContain('Git');
  });
});
