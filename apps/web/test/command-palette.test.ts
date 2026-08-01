import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import CommandPalette from '../src/components/CommandPalette.vue';
import { makeProject, makeWorkspace } from './support/activity-fixtures';

const api = vi.hoisted(() => ({
  fetchProjectProcess: vi.fn().mockResolvedValue(null),
  fetchProjectTests: vi.fn().mockResolvedValue({
    supported: true,
    commands: [{ id: 'all', runner: 'vitest', label: 'Executar todos os testes', description: 'Rodar a suíte completa', origin: 'package-script', priority: 1, supportsFileTarget: true }],
  }),
  fetchProjectTestProcess: vi.fn().mockResolvedValue(null),
  fetchProjectScripts: vi.fn().mockResolvedValue({
    items: [
      { id: 'lint', name: 'Verificar lint', description: 'Analisar o código', command: 'npm run lint', origin: 'package-script', risk: 'read-only', enabled: true },
      { id: 'seed', name: 'Popular banco', description: 'Executar seeds locais', command: 'npm run seed', origin: 'package-script', risk: 'mutable', enabled: true },
    ],
    page: 1,
    pageSize: 100,
    total: 2,
    totalPages: 1,
  }),
  fetchProjectServerSettings: vi.fn().mockResolvedValue({ port: 3100 }),
  startProjectProcess: vi.fn().mockResolvedValue({ id: 'processo-1', kind: 'server', status: 'running', port: 3100 }),
  stopProjectProcess: vi.fn(),
  startProjectTest: vi.fn().mockResolvedValue({ id: 'teste-1', kind: 'test', status: 'running' }),
  stopProjectTest: vi.fn(),
  prepareScriptExecution: vi.fn().mockResolvedValue({ token: 'confirmacao-1', actionId: 'seed', expiresAt: '2026-08-01T12:00:00.000Z' }),
  startScriptExecution: vi.fn().mockResolvedValue({ id: 'execucao-1', status: 'running' }),
}));

vi.mock('../src/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api')>();
  return { ...actual, ...api };
});

const wrappers: VueWrapper[] = [];

async function mountPalette(path = '/'): Promise<{ wrapper: VueWrapper; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'dashboard', component: { template: '<div />' } },
      { path: '/activity', name: 'activity', component: { template: '<div />' } },
      { path: '/processes', name: 'processes', component: { template: '<div />' } },
      { path: '/settings', name: 'settings', component: { template: '<div />' } },
      { path: '/projects/:projectId', name: 'project-details', component: { template: '<div />' } },
      { path: '/projects/:projectId/server', name: 'project-server', component: { template: '<div />' } },
      { path: '/projects/:projectId/logs', name: 'project-logs', component: { template: '<div />' } },
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
        makeProject({ id: 'p1', name: 'Aplicação principal', path: '/projetos/principal', capabilities: ['server', 'tests', 'scripts', 'database'] }),
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
  localStorage.clear();
  vi.clearAllMocks();
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
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Buscar ou executar um comando');

    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('filtra projetos por nome e caminho', async () => {
    const { wrapper } = await mountPalette();
    (wrapper.vm as unknown as { show: () => void }).show();
    await flushPromises();

    const search = document.querySelector<HTMLInputElement>('[aria-label="Buscar ou executar um comando"]')!;
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

    const search = document.querySelector<HTMLInputElement>('[aria-label="Buscar ou executar um comando"]')!;
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

  it('oferece somente a ação de processo válida e exige confirmação', async () => {
    const { wrapper } = await mountPalette('/projects/p1');
    (wrapper.vm as unknown as { show: () => void }).show();
    await flushPromises();

    const action = [...document.querySelectorAll<HTMLButtonElement>('.command-palette-item')]
      .find((button) => button.textContent?.includes('Iniciar servidor'))!;
    expect(action.textContent).toContain('Executar');
    action.click();
    await flushPromises();
    expect(api.startProjectProcess).not.toHaveBeenCalled();
    expect(action.textContent).toContain('Confirmar');
    action.click();
    await flushPromises();
    expect(api.startProjectProcess).toHaveBeenCalledWith('p1', { port: 3100 });
    expect(document.body.textContent).toContain('Servidor iniciado com sucesso.');
    expect(document.body.textContent).toContain('Parar servidor');
  });

  it('usa busca fuzzy e os prefixos de ações, páginas e projetos', async () => {
    const { wrapper } = await mountPalette('/projects/p1');
    (wrapper.vm as unknown as { show: () => void }).show();
    await flushPromises();
    const search = document.querySelector<HTMLInputElement>('[aria-label="Buscar ou executar um comando"]')!;

    search.value = '> ex tds tst';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(document.body.textContent).toContain('Executar todos os testes');

    search.value = '/ banco';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    expect(document.body.textContent).toContain('Banco de dados');
    expect(document.body.textContent).not.toContain('Popular banco');

    search.value = '@ financas';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    expect(document.body.textContent).toContain('Serviço financeiro');
  });

  it('executa testes e scripts do catálogo com confirmação em duas etapas', async () => {
    const { wrapper } = await mountPalette('/projects/p1');
    (wrapper.vm as unknown as { show: () => void }).show();
    await flushPromises();

    const testAction = [...document.querySelectorAll<HTMLButtonElement>('.command-palette-item')]
      .find((button) => button.textContent?.includes('Executar todos os testes'))!;
    testAction.click();
    testAction.click();
    await flushPromises();
    expect(api.startProjectTest).toHaveBeenCalledWith('p1', 'all');
    expect(document.body.textContent).toContain('Testes iniciados com sucesso.');

    const scriptAction = [...document.querySelectorAll<HTMLButtonElement>('.command-palette-item')]
      .find((button) => button.textContent?.includes('Popular banco'))!;
    scriptAction.click();
    scriptAction.click();
    await flushPromises();
    expect(api.prepareScriptExecution).toHaveBeenCalledWith('p1', 'seed');
    expect(api.startScriptExecution).toHaveBeenCalledWith('p1', 'seed', 'confirmacao-1');
  });

  it('abre ferramentas na seção correta e registra o comando recente', async () => {
    const { wrapper, router } = await mountPalette('/projects/p1');
    (wrapper.vm as unknown as { show: () => void }).show();
    await flushPromises();

    const snapshot = [...document.querySelectorAll<HTMLButtonElement>('.command-palette-item')]
      .find((button) => button.textContent?.includes('Criar snapshot'))!;
    snapshot.click();
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('project-database');
    expect(router.currentRoute.value.query.section).toBe('snapshots');

    (wrapper.vm as unknown as { show: () => void }).show();
    await flushPromises();
    const recentGroup = document.querySelector('.command-palette-group');
    expect(recentGroup?.textContent).toContain('Recentes');
    expect(recentGroup?.textContent).toContain('Criar snapshot');
  });

  it('autocompleta projeto e executa uma ação no contexto selecionado', async () => {
    const { wrapper } = await mountPalette('/');
    (wrapper.vm as unknown as { show: () => void }).show();
    await flushPromises();
    const search = document.querySelector<HTMLInputElement>('[aria-label="Buscar ou executar um comando"]')!;

    search.value = '@aplic princ';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    await flushPromises();

    expect(search.value).toBe('@Aplicação principal > ');
    expect(document.querySelector('.command-palette-context')?.textContent).toContain('Aplicação principal');
    expect(api.fetchProjectProcess).toHaveBeenCalledWith('p1');

    search.value += 'iniciar server';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
    expect(document.body.textContent).toContain('Iniciar servidor');

    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    await flushPromises();
    expect(search.value).toBe('@Aplicação principal > Iniciar servidor');
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushPromises();
    expect(api.startProjectProcess).toHaveBeenCalledWith('p1', { port: 3100 });
  });

  it('não oferece ação de servidor sem a capacidade correspondente', async () => {
    const { wrapper } = await mountPalette('/projects/p1');
    await wrapper.setProps({ projects: [makeProject({ id: 'p1', capabilities: ['git'] })] });
    api.fetchProjectProcess.mockClear();
    (wrapper.vm as unknown as { show: () => void }).show();
    await flushPromises();
    expect(document.body.textContent).not.toContain('Iniciar servidor');
    expect(api.fetchProjectProcess).not.toHaveBeenCalled();
  });
});
