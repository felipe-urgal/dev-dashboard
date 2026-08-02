import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ProjectEditorLauncher from '../src/components/ProjectEditorLauncher.vue';

const api = vi.hoisted(() => ({
  fetchProjectEditors: vi.fn(),
  openProjectEditor: vi.fn(),
}));

vi.mock('../src/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api')>()),
  ...api,
}));

afterEach(() => vi.clearAllMocks());

describe('abertura do editor local', () => {
  it('abre diretamente quando existe um único editor', async () => {
    api.fetchProjectEditors.mockResolvedValue({
      editors: [{ id: 'vscode', name: 'Visual Studio Code' }],
      preferredEditorId: 'vscode',
    });
    api.openProjectEditor.mockResolvedValue({
      editor: { id: 'vscode', name: 'Visual Studio Code' },
      opened: true,
    });
    const wrapper = mount(ProjectEditorLauncher, {
      props: { projectId: 'painel' },
    });
    await flushPromises();

    expect(wrapper.find('select').exists()).toBe(false);
    expect(wrapper.get('button').text()).toContain('Abrir no Visual Studio Code');
    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(api.openProjectEditor).toHaveBeenCalledWith('painel', 'vscode');
    expect(wrapper.get('[role="status"]').text()).toBe(
      'Projeto aberto no Visual Studio Code.',
    );
  });

  it('permite escolher quando há mais de um editor', async () => {
    api.fetchProjectEditors.mockResolvedValue({
      editors: [
        { id: 'vscode', name: 'Visual Studio Code' },
        { id: 'cursor', name: 'Cursor' },
      ],
      preferredEditorId: 'cursor',
    });
    api.openProjectEditor.mockResolvedValue({
      editor: { id: 'vscode', name: 'Visual Studio Code' },
      opened: true,
    });
    const wrapper = mount(ProjectEditorLauncher, {
      props: { projectId: 'painel' },
    });
    await flushPromises();

    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('cursor');
    await wrapper.get('select').setValue('vscode');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(api.openProjectEditor).toHaveBeenCalledWith('painel', 'vscode');
  });

  it('explica o estado indisponível sem oferecer uma ação inválida', async () => {
    api.fetchProjectEditors.mockResolvedValue({ editors: [] });
    const wrapper = mount(ProjectEditorLauncher, {
      props: { projectId: 'painel' },
    });
    await flushPromises();

    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    expect(wrapper.get('button').text()).toContain('Editor indisponível');
    expect(wrapper.get('button').attributes('title')).toContain('PATH');
  });
});
