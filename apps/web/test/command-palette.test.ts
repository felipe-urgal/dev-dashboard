import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import CommandPalette from '../src/components/CommandPalette.vue';
import { makeProject, makeWorkspace } from './support/activity-fixtures';

const wrappers: VueWrapper[] = [];

async function mountPalette(
  path = '/',
): Promise<{ wrapper: VueWrapper; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'dashboard', component: { template: '<div />' } },
      {
        path: '/processes',
        name: 'processes',
        component: { template: '<div />' },
      },
      {
        path: '/production',
        name: 'production',
        component: { template: '<div />' },
      },
      {
        path: '/database',
        name: 'database',
        component: { template: '<div />' },
      },
      {
        path: '/projects/:projectId',
        name: 'project-details',
        component: { template: '<div />' },
      },
      {
        path: '/projects/:projectId/server',
        name: 'project-server',
        component: { template: '<div />' },
      },
      {
        path: '/projects/:projectId/git',
        name: 'project-git',
        component: { template: '<div />' },
      },
      {
        path: '/projects/:projectId/tests',
        name: 'project-tests',
        component: { template: '<div />' },
      },
      {
        path: '/projects/:projectId/production',
        name: 'project-production',
        component: { template: '<div />' },
      },
      {
        path: '/projects/:projectId/dependencies',
        name: 'project-dependencies',
        component: { template: '<div />' },
      },
      {
        path: '/projects/:projectId/environment',
        name: 'project-environment',
        component: { template: '<div />' },
      },
      {
        path: '/projects/:projectId/doctor',
        name: 'project-doctor',
        component: { template: '<div />' },
      },
      {
        path: '/projects/:projectId/readme',
        name: 'project-readme',
        component: { template: '<div />' },
      },
    ],
  });
  await router.push(path);
  await router.isReady();

  const wrapper = mount(CommandPalette, {
    attachTo: document.body,
    global: { plugins: [router] },
    props: {
      projects: [
        makeProject({
          id: 'p1',
          name: 'Aplicação principal',
          path: '/projetos/principal',
          capabilities: ['server', 'git', 'tests', 'production'],
        }),
        makeProject({
          id: 'p2',
          name: 'Serviço financeiro',
          path: '/clientes/financas',
          capabilities: ['git'],
        }),
      ],
      workspaces: [makeWorkspace()],
    },
  });
  wrappers.push(wrapper);
  return { wrapper, router };
}

function searchInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(
    '[aria-label="Buscar projetos ou ferramentas"]',
  )!;
}

function expectPaletteHidden(): void {
  const palette = document.querySelector<HTMLElement>('.command-palette');
  expect(palette).not.toBeNull();
  expect(palette?.closest<HTMLElement>('.n-modal')?.style.display).toBe('none');
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('paleta global de navegação', () => {
  it('abre e fecha com Ctrl/Cmd+K e devolve o foco anterior', async () => {
    await mountPalette();
    const previous = document.createElement('button');
    document.body.append(previous);
    previous.focus();

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }),
    );
    await flushPromises();

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement).toBe(searchInput());

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }),
    );
    await flushPromises();

    expectPaletteHidden();
    expect(document.activeElement).toBe(previous);
  });

  it('abre pelo atalho mesmo quando o foco está em um campo de texto', async () => {
    await mountPalette();
    const outsideInput = document.createElement('input');
    document.body.append(outsideInput);
    outsideInput.focus();

    outsideInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
    );
    await flushPromises();

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement).toBe(searchInput());
  });

  it('filtra projetos por nome e caminho', async () => {
    const { wrapper } = await mountPalette();
    (wrapper.vm as unknown as { show: () => void }).show();
    await flushPromises();

    const search = searchInput();
    search.value = '@ financas';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();

    const options = [...document.querySelectorAll('[role="option"]')];
    expect(options).toHaveLength(1);
    expect(options[0]!.textContent).toContain('Serviço financeiro');
  });

  it('encontra ferramenta pelo projeto e respeita capabilities', async () => {
    const { wrapper } = await mountPalette();
    (wrapper.vm as unknown as { show: () => void }).show();
    await flushPromises();

    const search = searchInput();
    search.value = 'financeiro git';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();

    expect(document.body.textContent).toContain('Git');
    expect(document.body.textContent).toContain('Serviço financeiro');

    search.value = 'financeiro servidor';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();

    expect(document.querySelectorAll('[role="option"]')).toHaveLength(0);
  });

  it('move a seleção com setas, navega com Enter e fecha com Escape', async () => {
    const { wrapper, router } = await mountPalette();
    (wrapper.vm as unknown as { show: () => void }).show();
    await flushPromises();

    const search = searchInput();
    search.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
    );
    search.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('processes');
    expectPaletteHidden();

    (wrapper.vm as unknown as { show: () => void }).show();
    await flushPromises();
    searchInput().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    await flushPromises();
    expectPaletteHidden();
  });

  it('não expõe comandos de execução no MVP', async () => {
    const { wrapper } = await mountPalette('/projects/p1');
    (wrapper.vm as unknown as { show: () => void }).show();
    await flushPromises();

    expect(document.body.textContent).not.toContain('Iniciar servidor');
    expect(document.body.textContent).not.toContain('Executar todos os testes');
    expect(document.body.textContent).not.toContain('Popular banco');
    expect(document.body.textContent).not.toContain('Terminal');
    expect(document.body.textContent).not.toContain('Console');
    expect(document.body.textContent).toContain('somente navegação');
  });
});
