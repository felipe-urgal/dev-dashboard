import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import type { GitMutationHistoryPage, Project } from '@dev-dashboard/contracts';

const { fetchProjectGitMutationHistory } = vi.hoisted(() => ({
  fetchProjectGitMutationHistory: vi.fn(),
}));

vi.mock('../src/api', () => ({ fetchProjectGitMutationHistory }));

import ProjectGitMutationHistoryPage from '../src/components/ProjectGitMutationHistoryPage.vue';

const project: Project = {
  id: 'p1',
  workspaceId: 'w1',
  name: 'sample',
  path: '/projetos/sample',
  type: 'node',
  source: 'workspace',
  favorite: false,
  capabilities: ['git'],
};

function page(overrides: Partial<GitMutationHistoryPage> = {}): GitMutationHistoryPage {
  return {
    projectId: 'p1',
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
    events: [],
    ...overrides,
  };
}

describe('ProjectGitMutationHistoryPage', () => {
  it('mostra estado vazio quando não há eventos', async () => {
    fetchProjectGitMutationHistory.mockResolvedValueOnce(page());
    const wrapper = mount(ProjectGitMutationHistoryPage, { props: { project } });
    await flushPromises();
    expect(wrapper.text()).toContain('Nenhuma mutação registrada');
  });

  it('mostra rótulo do catálogo, risco e resultado de cada evento', async () => {
    fetchProjectGitMutationHistory.mockResolvedValueOnce(page({
      total: 1,
      totalPages: 1,
      events: [{
        id: 'e1',
        projectId: 'p1',
        operationId: 'discard-file',
        risk: 'destructive',
        occurredAt: '2026-01-01T12:00:00.000Z',
        result: 'failed',
        errorCode: 'GIT_FILE_MUTATION_FAILED',
      }],
    }));
    const wrapper = mount(ProjectGitMutationHistoryPage, { props: { project } });
    await flushPromises();

    expect(wrapper.text()).toContain('Descartar alterações do arquivo');
    expect(wrapper.text()).toContain('Destrutiva');
    expect(wrapper.text()).toContain('Falha');
    expect(wrapper.text()).toContain('GIT_FILE_MUTATION_FAILED');

    // A rota já mascara o conteúdo — o painel nunca deve exibir caminho absoluto.
    expect(wrapper.html()).not.toContain('/projetos/sample');
  });

  it('mostra mensagem de erro quando a busca falha', async () => {
    fetchProjectGitMutationHistory.mockRejectedValueOnce(new Error('falhou'));
    const wrapper = mount(ProjectGitMutationHistoryPage, { props: { project } });
    await flushPromises();
    expect(wrapper.text()).toContain('falhou');
  });

  it('busca a próxima página ao clicar em "Próxima"', async () => {
    fetchProjectGitMutationHistory.mockResolvedValueOnce(page({
      total: 15,
      totalPages: 2,
      events: [{
        id: 'e1', projectId: 'p1', operationId: 'commit', risk: 'write-safe',
        occurredAt: '2026-01-01T12:00:00.000Z', result: 'succeeded',
      }],
    }));
    const wrapper = mount(ProjectGitMutationHistoryPage, { props: { project } });
    await flushPromises();

    fetchProjectGitMutationHistory.mockResolvedValueOnce(page({
      page: 2, total: 15, totalPages: 2,
      events: [{
        id: 'e2', projectId: 'p1', operationId: 'push', risk: 'write-remote',
        occurredAt: '2026-01-01T13:00:00.000Z', result: 'succeeded',
      }],
    }));
    await wrapper.find('button.git-mutation-history-refresh').exists();
    const nextButton = wrapper.findAll('button').find((button) => button.text() === 'Próxima');
    await nextButton?.trigger('click');
    await flushPromises();

    expect(fetchProjectGitMutationHistory).toHaveBeenLastCalledWith('p1', 2, 10);
    expect(wrapper.text()).toContain('Enviar branch (push)');
  });
});
