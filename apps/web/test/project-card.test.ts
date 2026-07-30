import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { Project } from '@dev-dashboard/contracts';

vi.mock('../src/api', () => ({
  fetchProjectProcess: vi.fn().mockResolvedValue(null),
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
  capabilities: ['git'],
};

describe('ProjectCard', () => {
  it('renderiza a identidade do projeto sem avatar', () => {
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
  });
});
