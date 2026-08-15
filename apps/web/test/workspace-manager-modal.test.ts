import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({
  criar: vi.fn(),
  alternarRecursiveScan: vi.fn(),
}));

vi.mock('../src/stores/dashboard', async () => {
  const { ref } = await import('vue');

  return {
    dashboardStore: {
      workspaces: ref([]),
      newWorkspaceName: ref(''),
      newWorkspacePath: ref(''),
      newWorkspaceRecursiveScan: ref(false),
      creatingWorkspace: ref(false),
      recursiveScanUpdatingIds: ref([]),
      handleCreateWorkspace: actions.criar,
      toggleWorkspaceRecursiveScan: actions.alternarRecursiveScan,
    },
  };
});

import { dashboardStore } from '../src/stores/dashboard';
import WorkspaceManagerModal from '../src/components/WorkspaceManagerModal.vue';

const wrappers: VueWrapper[] = [];

function mountModal(open = true) {
  const wrapper = mount(WorkspaceManagerModal, {
    attachTo: document.body,
    props: { open },
    global: {
      stubs: {
        WorkspaceDirectoryPicker: true,
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

beforeEach(() => {
  vi.clearAllMocks();
  dashboardStore.workspaces.value = [];
  dashboardStore.newWorkspaceName.value = '';
  dashboardStore.newWorkspacePath.value = '';
  dashboardStore.newWorkspaceRecursiveScan.value = false;
  dashboardStore.creatingWorkspace.value = false;
  dashboardStore.recursiveScanUpdatingIds.value = [];
});

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.innerHTML = '';
});

describe('WorkspaceManagerModal', () => {
  it('não renderiza o diálogo quando fechado', () => {
    mountModal(false);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('cadastra um novo workspace pelo formulário', () => {
    mountModal();

    document
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }));

    expect(actions.criar).toHaveBeenCalledOnce();
  });

  it('emite close ao clicar em Fechar', () => {
    const wrapper = mountModal();

    document.querySelector<HTMLButtonElement>('[aria-label="close"]')?.click();

    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('ativa a varredura recursiva via switch e envia no cadastro', async () => {
    mountModal();

    const switchEl = document.querySelector<HTMLElement>(
      '[role="switch"][aria-labelledby="workspace-recursive-scan-label"]',
    );

    expect(switchEl).not.toBeNull();
    expect(switchEl?.getAttribute('aria-checked')).toBe('false');
    expect(dashboardStore.newWorkspaceRecursiveScan.value).toBe(false);

    switchEl?.click();
    await Promise.resolve();

    expect(dashboardStore.newWorkspaceRecursiveScan.value).toBe(true);

    document
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }));

    expect(actions.criar).toHaveBeenCalledOnce();
  });

  it('não mostra a lista de workspaces cadastrados quando não há nenhum', () => {
    mountModal();

    expect(document.querySelector('.workspace-existing-list')).toBeNull();
  });

  it('lista workspaces cadastrados e alterna a varredura recursiva de um deles', async () => {
    dashboardStore.workspaces.value = [
      {
        id: 'w1',
        name: 'Workspace 1',
        path: '/home/dev/projects',
        enabled: true,
        recursiveScan: false,
      },
    ];

    mountModal();

    expect(
      document.querySelector('.workspace-existing-list')?.textContent,
    ).toContain('Workspace 1');

    const switchEl = document.querySelector<HTMLElement>(
      '[role="switch"][aria-labelledby="workspace-existing-recursive-scan-label-w1"]',
    );

    expect(switchEl).not.toBeNull();
    expect(switchEl?.getAttribute('aria-checked')).toBe('false');

    switchEl?.click();

    expect(actions.alternarRecursiveScan).toHaveBeenCalledOnce();
    expect(actions.alternarRecursiveScan).toHaveBeenCalledWith(
      dashboardStore.workspaces.value[0],
    );
  });
});
