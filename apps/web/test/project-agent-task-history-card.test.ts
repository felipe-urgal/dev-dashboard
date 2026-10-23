import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import type { AgentTaskRecord, AgentTaskState } from '../src/api/agent-runtime';
import ProjectAgentTaskHistoryCard from '../src/components/ProjectAgentTaskHistoryCard.vue';

function task(id: string, state: AgentTaskState = 'completed'): AgentTaskRecord {
  return {
    version: 1,
    task: {
      id,
      projectId: 'project-a',
      state,
      summary: 'Task ' + id,
      requestedCapabilities: [],
      createdAt: '2026-10-23T10:00:00.000Z',
      updatedAt: '2026-10-23T11:00:00.000Z',
    },
  };
}

function render(overrides: Partial<InstanceType<typeof ProjectAgentTaskHistoryCard>['$props']> = {}) {
  const tasks = Array.from({ length: 7 }, (_, index) =>
    task('task-' + index, index === 0 ? 'running' : 'completed'),
  );
  return mount(ProjectAgentTaskHistoryCard, {
    props: {
      tasks,
      selectedTaskId: 'task-0',
      showArchived: false,
      showAllHistory: false,
      historyHasMore: true,
      historyLoading: false,
      historyLoaded: true,
      historyError: '',
      ...overrides,
    },
  });
}

describe('ProjectAgentTaskHistoryCard', () => {
  it('exibe somente cinco tasks por padrão, preservando seleção ativa', async () => {
    const wrapper = render();
    const rows = wrapper.findAll('button.agent-history-item');
    expect(rows).toHaveLength(5);
    expect(rows[0]?.classes()).toContain('is-selected');
    expect(rows[0]?.text()).toContain('Executando');
    await rows[1]!.trigger('click');
    expect(wrapper.emitted('select')).toEqual([['task-1']]);
    expect(wrapper.emitted('load-more')).toBeUndefined();
  });

  it('expande o lote local e oferece próxima página apenas sob demanda', async () => {
    const wrapper = render();
    await wrapper.get('button.agent-history-show-all').trigger('click');
    // Primeiro controle alterna arquivadas; o segundo expande.
    expect(wrapper.emitted('toggle-archived')).toEqual([[]]);
    const expand = wrapper.findAll('button.agent-history-show-all').find(
      (button) => button.text() === 'Ver mais',
    );
    await expand!.trigger('click');
    expect(wrapper.emitted('expand')).toEqual([[]]);
    expect(wrapper.emitted('load-more')).toBeUndefined();

    await wrapper.setProps({ showAllHistory: true });
    expect(wrapper.findAll('button.agent-history-item')).toHaveLength(7);
    const loadMore = wrapper.findAll('button.agent-history-show-all').find(
      (button) => button.text() === 'Carregar mais',
    );
    await loadMore!.trigger('click');
    expect(wrapper.emitted('load-more')).toEqual([[]]);
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('preserva registros em falha de próxima página, permite retry sem duplicar dispatch', async () => {
    const wrapper = render({
      showAllHistory: true,
      historyHasMore: true,
      historyError: 'Falha temporária ao carregar',
    });
    expect(wrapper.findAll('button.agent-history-item')).toHaveLength(7);
    expect(wrapper.get('[role="alert"]').text()).toContain('Falha temporária');
    expect(wrapper.findAll('button.agent-history-show-all').some(
      (button) => button.text() === 'Carregar mais',
    )).toBe(false);
    const retry = wrapper.findAll('button.agent-history-show-all').find(
      (button) => button.text() === 'Tentar novamente',
    );
    await retry!.trigger('click');
    expect(wrapper.emitted('retry')).toEqual([[]]);
    expect(wrapper.emitted('load-more')).toBeUndefined();
  });

  it('não apresenta conteúdo anterior se o owner limpar a lista ao trocar projeto', async () => {
    const wrapper = render();
    await wrapper.setProps({
      tasks: [],
      selectedTaskId: '',
      historyLoaded: false,
      historyLoading: true,
      historyError: '',
    });
    expect(wrapper.findAll('button.agent-history-item')).toHaveLength(0);
    expect(wrapper.text()).toContain('Carregando histórico');
  });

  it('somente sinaliza alternância de arquivadas; não executa archive, provider ou realtime', async () => {
    const wrapper = render({ showArchived: true });
    const toggle = wrapper.findAll('button.agent-history-show-all').find(
      (button) => button.text() === 'Ocultar arquivadas',
    );
    await toggle!.trigger('click');
    expect(wrapper.emitted('toggle-archived')).toEqual([[]]);
    expect(wrapper.emitted('select')).toBeUndefined();
  });
});
