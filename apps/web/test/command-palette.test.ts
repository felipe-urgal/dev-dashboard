import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import CommandPalette from '../src/components/CommandPalette.vue';
import { makeProject, makeWorkspace } from './support/activity-fixtures';

const wrappers: VueWrapper[] = [];

async function mountPalette(path = '/'): Promise<{ wrapper: VueWrapper; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'dashboard', component: { template: '<div />' } },
      { path: '/activity', name: 'activity', component: { template: '<div />' } },
      { path: '/processes', name: 'processes', component: { template: '<div />' } },
      { path: '/projects/:projectId', name: 'project-details', component: { template: '<div />' } },
      { path: '/projects/:projectId/git', name: 'project-git', component: { template: '<div />' } },
      { path: '/projects/:projectId/tests', name: 'project-tests', component: { template: '<div />' } },
      { path: '/projects/:projectId/database', name: 'project-database', component: { template: '<div />' } },
      { path: '/projects/:projectId/scripts', name: 'project-scripts', component: { template: '<div />' } },
    ],
  });
  await router.push(path);
  await router.isReady();

  const wrapper = mount(CommandPalette, {
    attachTo: document.body,
    global: { plugins: [router] },
    props: {
      projects: [
        makeProject({ id: 'p1', name: 'Aplicação principal', path: '/projetos/principal' }),
        makeProject({ id: 'p2', name: 'Serviço financeiro', path: '/clientes/financas' }),
      ],
      workspaces: [makeWorkspace()],
    },
  });
  wrappers.push(wrapper);
  return { wrapper, router };
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
});

describe('paleta de navegação', () => {
  it('abre pelo atalho global, ignora campos de texto e fecha com Escape', async () => {
    await mountPalette();
    const outsideInput = document.createElement('input');
    document.body.append(outsideInput);
    outsideInput.focus();
    outsideInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    await flushPromises();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Buscar navegação');

    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('filtra projetos por nome e caminho', async () => {
    const { wrapper } = await mountPalette();
    (wrapper.vm as unknown as { show: () => void }).show();
    await flushPromises();

    const search = document.querySelector<HTMLInputElement>('[aria-label="Buscar navegação"]')!;
    search.value = 'financas';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();

    const options = [...document.querySelectorAll('[role="option"]')];
    expect(options).toHaveLength(1);
    expect(options[0]!.textContent).toContain('Serviço financeiro');
  });

  it('move a seleção com as setas e navega com Enter', async () => {
    const { wrapper, router } = await mountPalette();
    (wrapper.vm as unknown as { show: () => void }).show();
    await flushPromises();

    const search = document.querySelector<HTMLInputElement>('[aria-label="Buscar navegação"]')!;
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('activity');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('oferece as áreas do projeto aberto', async () => {
    const { wrapper } = await mountPalette('/projects/p1');
    (wrapper.vm as unknown as { show: () => void }).show();
    await flushPromises();
    expect(document.body.textContent).toContain('Banco de dados');
    expect(document.body.textContent).toContain('Scripts');
  });
});
