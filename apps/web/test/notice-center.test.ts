import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Notice } from '../src/stores/notice-center';

const actions = vi.hoisted(() => ({
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  dismiss: vi.fn(),
  clearAll: vi.fn(),
}));

vi.mock('../src/stores/notice-center', async () => {
  const { ref, computed } = await import('vue');
  const notices = ref<Notice[]>([]);

  return {
    noticeCenterStore: {
      notices,
      unreadCount: computed(() => notices.value.filter((notice) => !notice.read).length),
      markRead: actions.markRead,
      markAllRead: actions.markAllRead,
      dismiss: actions.dismiss,
      clearAll: actions.clearAll,
    },
  };
});

import { noticeCenterStore } from '../src/stores/notice-center';
import NoticeCenter from '../src/components/NoticeCenter.vue';

function makeNotice(overrides: Partial<Notice> = {}): Notice {
  return {
    id: 'n1',
    dedupeKey: 'dedupe-1',
    origin: 'test',
    outcome: 'failed',
    projectId: 'p1',
    projectName: 'Aplicação principal',
    label: 'rspec spec/models',
    createdAt: Date.now() - 4 * 60_000,
    read: false,
    routeTo: { name: 'project-tests', params: { projectId: 'p1' } },
    ...overrides,
  };
}

async function mountNoticeCenter(): Promise<{ wrapper: ReturnType<typeof mount>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'dashboard', component: { template: '<div />' } },
      { path: '/activity', name: 'activity', component: { template: '<div />' } },
      { path: '/projects/:projectId/tests', name: 'project-tests', component: { template: '<div />' } },
    ],
  });
  await router.push('/');
  await router.isReady();

  const wrapper = mount(NoticeCenter, {
    global: { plugins: [router] },
    attachTo: document.body,
  });
  return { wrapper, router };
}

beforeEach(() => {
  vi.clearAllMocks();
  noticeCenterStore.notices.value = [];
});

describe('central de notificações', () => {
  it('mostra estado vazio dentro da região aria-live quando não há notificações', async () => {
    const { wrapper } = await mountNoticeCenter();
    await wrapper.find('.notice-bell-button').trigger('click');

    const region = wrapper.find('[aria-live="polite"]');
    expect(region.exists()).toBe(true);
    expect(region.text()).toContain('Nenhuma notificação no momento.');
  });

  it('mostra hierarquia do aviso, horário relativo e contagem de não lidos', async () => {
    noticeCenterStore.notices.value = [makeNotice()];
    const { wrapper } = await mountNoticeCenter();

    expect(wrapper.find('.notice-badge').text()).toBe('1');

    await wrapper.find('.notice-bell-button').trigger('click');
    expect(wrapper.find('.notice-item-overline').text()).toContain('Testes');
    expect(wrapper.find('.notice-item-overline time').text()).toBe('há 4 min');
    expect(wrapper.find('.notice-item-body strong').text()).toBe('Testes concluídos com falhas');
    expect(wrapper.find('.notice-item-meta').text()).toBe('Aplicação principal · rspec spec/models');
  });

  it('clique no corpo do item marca como lido e navega para routeTo', async () => {
    noticeCenterStore.notices.value = [makeNotice()];
    const { wrapper, router } = await mountNoticeCenter();
    await wrapper.find('.notice-bell-button').trigger('click');

    await wrapper.find('.notice-item-body').trigger('click');
    await flushPromises();

    expect(actions.markRead).toHaveBeenCalledWith('n1');
    expect(router.currentRoute.value.name).toBe('project-tests');
    expect(router.currentRoute.value.params.projectId).toBe('p1');
  });

  it('clique no botão de descarte chama dismiss sem navegar', async () => {
    noticeCenterStore.notices.value = [makeNotice()];
    const { wrapper, router } = await mountNoticeCenter();
    await wrapper.find('.notice-bell-button').trigger('click');

    await wrapper.find('.notice-item-dismiss').trigger('click');

    expect(actions.dismiss).toHaveBeenCalledWith('n1');
    expect(actions.markRead).not.toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe('dashboard');
  });

  it('marca todas como lidas pelo cabeçalho', async () => {
    noticeCenterStore.notices.value = [makeNotice()];
    const { wrapper } = await mountNoticeCenter();
    await wrapper.find('.notice-bell-button').trigger('click');

    await wrapper.find('.notice-header-action').trigger('click');

    expect(actions.markAllRead).toHaveBeenCalledOnce();
  });

  it('abre o painel global de atividade pelo rodapé', async () => {
    noticeCenterStore.notices.value = [makeNotice()];
    const { wrapper, router } = await mountNoticeCenter();
    await wrapper.find('.notice-bell-button').trigger('click');

    await wrapper.find('.notice-activity-link').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('activity');
    expect(wrapper.find('.notice-panel').exists()).toBe(false);
  });

  it('botão limpar tudo chama clearAll e fica desabilitado quando a lista está vazia', async () => {
    const { wrapper } = await mountNoticeCenter();
    await wrapper.find('.notice-bell-button').trigger('click');

    const clearButton = wrapper.find('.notice-clear-button');
    expect(clearButton.attributes('disabled')).toBeDefined();

    noticeCenterStore.notices.value = [makeNotice()];
    await wrapper.vm.$nextTick();
    await clearButton.trigger('click');
    expect(actions.clearAll).toHaveBeenCalled();
  });

  it('possui aria-labels no sino, no descarte e no limpar tudo', async () => {
    noticeCenterStore.notices.value = [makeNotice()];
    const { wrapper } = await mountNoticeCenter();

    expect(wrapper.find('.notice-bell-button').attributes('aria-label')).toBe('1 notificação(ões) não lida(s)');

    await wrapper.find('.notice-bell-button').trigger('click');
    expect(wrapper.find('.notice-item-dismiss').attributes('aria-label')).toBe(
      'Descartar notificação de Aplicação principal',
    );
    expect(wrapper.find('.notice-clear-button').attributes('aria-label')).toBe(
      'Limpar todas as notificações',
    );
  });

  it('move o foco para o painel ao abrir e devolve ao sino ao fechar com Escape', async () => {
    const { wrapper } = await mountNoticeCenter();

    await wrapper.find('.notice-bell-button').trigger('click');
    await wrapper.vm.$nextTick();

    const panel = wrapper.find('.notice-panel');
    expect(panel.exists()).toBe(true);
    expect(document.activeElement).toBe(panel.element);

    await panel.trigger('keydown', { key: 'Escape' });

    expect(wrapper.find('.notice-panel').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.find('.notice-bell-button').element);

    wrapper.unmount();
  });
});
