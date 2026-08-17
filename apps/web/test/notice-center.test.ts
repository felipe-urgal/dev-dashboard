import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
      unreadCount: computed(
        () => notices.value.filter((notice) => !notice.read).length,
      ),
      markRead: actions.markRead,
      markAllRead: actions.markAllRead,
      dismiss: actions.dismiss,
      clearAll: actions.clearAll,
    },
  };
});

import { noticeCenterStore } from '../src/stores/notice-center';
import NoticeCenter from '../src/components/NoticeCenter.vue';

const mountedWrappers: Array<ReturnType<typeof mount>> = [];

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

async function mountNoticeCenter(): Promise<{
  wrapper: ReturnType<typeof mount>;
  router: Router;
}> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'dashboard', component: { template: '<div />' } },
      {
        path: '/projects/:projectId/tests',
        name: 'project-tests',
        component: { template: '<div />' },
      },
    ],
  });
  await router.push('/');
  await router.isReady();

  const wrapper = mount(NoticeCenter, {
    global: { plugins: [router] },
    attachTo: document.body,
  });
  mountedWrappers.push(wrapper);
  return { wrapper, router };
}

function queryNoticeElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Elemento não encontrado: ${selector}`);
  }
  return element;
}

beforeEach(() => {
  vi.clearAllMocks();
  noticeCenterStore.notices.value = [];
});

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0)) {
    wrapper.unmount();
  }
  document.body.innerHTML = '';
});

describe('central de notificações', () => {
  it('mostra estado vazio dentro da região aria-live quando não há notificações', async () => {
    const { wrapper } = await mountNoticeCenter();
    await wrapper.find('.notice-bell-button').trigger('click');
    await flushPromises();

    const region = queryNoticeElement<HTMLElement>('[aria-live="polite"]');
    expect(region.textContent ?? '').toContain(
      'Nenhuma notificação no momento.',
    );
  });

  it('mostra hierarquia do aviso, horário relativo e contagem de não lidos', async () => {
    noticeCenterStore.notices.value = [makeNotice()];
    const { wrapper } = await mountNoticeCenter();

    expect(wrapper.find('.notice-badge').text()).toBe('1');

    await wrapper.find('.notice-bell-button').trigger('click');
    await flushPromises();
    expect(
      queryNoticeElement<HTMLElement>('.notice-item-overline').textContent ??
        '',
    ).toContain('Testes');
    expect(
      queryNoticeElement<HTMLElement>('.notice-item-overline time')
        .textContent ?? '',
    ).toBe('há 4 min');
    expect(
      queryNoticeElement<HTMLElement>('.notice-item-body strong').textContent ??
        '',
    ).toBe('Testes concluídos com falhas');
    expect(
      queryNoticeElement<HTMLElement>('.notice-item-meta').textContent ?? '',
    ).toBe('Aplicação principal · rspec spec/models');
  });

  it('clique no corpo do item marca como lido e navega para routeTo', async () => {
    noticeCenterStore.notices.value = [makeNotice()];
    const { wrapper, router } = await mountNoticeCenter();
    await wrapper.find('.notice-bell-button').trigger('click');
    await flushPromises();

    queryNoticeElement<HTMLButtonElement>('.notice-item-body').click();
    await flushPromises();

    expect(actions.markRead).toHaveBeenCalledWith('n1');
    expect(router.currentRoute.value.name).toBe('project-tests');
    expect(router.currentRoute.value.params.projectId).toBe('p1');
  });

  it('clique no botão de descarte chama dismiss sem navegar', async () => {
    noticeCenterStore.notices.value = [makeNotice()];
    const { wrapper, router } = await mountNoticeCenter();
    await wrapper.find('.notice-bell-button').trigger('click');
    await flushPromises();

    queryNoticeElement<HTMLButtonElement>('.notice-item-dismiss').click();

    expect(actions.dismiss).toHaveBeenCalledWith('n1');
    expect(actions.markRead).not.toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe('dashboard');
  });

  it('marca todas como lidas pelo cabeçalho', async () => {
    noticeCenterStore.notices.value = [makeNotice()];
    const { wrapper } = await mountNoticeCenter();
    await wrapper.find('.notice-bell-button').trigger('click');
    await flushPromises();

    queryNoticeElement<HTMLButtonElement>('.notice-header-action').click();

    expect(actions.markAllRead).toHaveBeenCalledOnce();
  });

  it('botão limpar tudo chama clearAll e fica desabilitado quando a lista está vazia', async () => {
    const { wrapper } = await mountNoticeCenter();
    await wrapper.find('.notice-bell-button').trigger('click');
    await flushPromises();

    const clearButton = queryNoticeElement<HTMLButtonElement>(
      '.notice-clear-button',
    );
    expect(clearButton.disabled).toBe(true);

    noticeCenterStore.notices.value = [makeNotice()];
    await wrapper.vm.$nextTick();
    queryNoticeElement<HTMLButtonElement>('.notice-clear-button').click();
    expect(actions.clearAll).toHaveBeenCalled();
  });

  it('possui aria-labels no sino, no descarte e no limpar tudo', async () => {
    noticeCenterStore.notices.value = [makeNotice()];
    const { wrapper } = await mountNoticeCenter();

    expect(wrapper.find('.notice-bell-button').attributes('aria-label')).toBe(
      '1 notificação(ões) não lida(s)',
    );

    await wrapper.find('.notice-bell-button').trigger('click');
    await flushPromises();
    expect(
      queryNoticeElement<HTMLButtonElement>(
        '.notice-item-dismiss',
      ).getAttribute('aria-label'),
    ).toBe('Descartar notificação de Aplicação principal');
    expect(
      queryNoticeElement<HTMLButtonElement>(
        '.notice-clear-button',
      ).getAttribute('aria-label'),
    ).toBe('Limpar todas as notificações');
  });

  it('move o foco para o painel ao abrir e devolve ao sino ao fechar com Escape', async () => {
    const { wrapper } = await mountNoticeCenter();

    await wrapper.find('.notice-bell-button').trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();

    const panel = queryNoticeElement<HTMLElement>('.notice-panel');
    expect(document.activeElement).toBe(panel);

    panel.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await flushPromises();

    expect(document.querySelector('.notice-panel')).toBeNull();
    expect(document.activeElement).toBe(
      wrapper.find('.notice-bell-button').element,
    );

    wrapper.unmount();
  });
});
