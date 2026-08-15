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
      errorMessage: ref(''),
      successMessage: ref(''),
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
  dashboardStore.errorMessage.value = '';
  dashboardStore.successMessage.value = '';
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

  it('não renderiza mais alerta inline (mensagens viram toast global)', () => {
    dashboardStore.errorMessage.value =
      'Informe o nome e o caminho do workspace.';
    mountModal();

    expect(document.querySelector('.alert-error')).toBeNull();
  });

  it('emite close ao clicar em Fechar', () => {
    const wrapper = mountModal();

    document.querySelector<HTMLButtonElement>('.log-action-button')?.click();

    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('ativa a varredura recursiva via checkbox e envia no cadastro', async () => {
    mountModal();

    const checkbox = document.querySelector<HTMLInputElement>(
      'input[aria-labelledby="workspace-recursive-scan-label"]',
    );

    expect(checkbox).not.toBeNull();
    expect(dashboardStore.newWorkspaceRecursiveScan.value).toBe(false);

    checkbox?.click();
    await checkbox?.dispatchEvent(new Event('change'));

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

    const checkbox = document.querySelector<HTMLInputElement>(
      'input[aria-labelledby="workspace-existing-recursive-scan-label-w1"]',
    );

    expect(checkbox).not.toBeNull();
    expect(checkbox?.checked).toBe(false);

    checkbox?.dispatchEvent(new Event('change'));

    expect(actions.alternarRecursiveScan).toHaveBeenCalledOnce();
    expect(actions.alternarRecursiveScan).toHaveBeenCalledWith(
      dashboardStore.workspaces.value[0],
    );
  });
});
