import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Workspace } from '@dev-dashboard/contracts';

const actions = vi.hoisted(() => ({
  criar: vi.fn(),
  escanear: vi.fn(),
  remover: vi.fn(),
}));

vi.mock('../src/stores/dashboard', async () => {
  const { computed, ref } = await import('vue');
  const workspaces = ref<Workspace[]>([]);
  const selectedWorkspaceId = ref('');

  return {
    dashboardStore: {
      workspaces,
      selectedWorkspaceId,
      newWorkspaceName: ref(''),
      newWorkspacePath: ref(''),
      scanningWorkspace: ref(false),
      creatingWorkspace: ref(false),
      deletingWorkspace: ref(false),
      selectedWorkspace: computed(() => workspaces.value.find((item) => item.id === selectedWorkspaceId.value)),
      scanSelectedWorkspace: actions.escanear,
      handleCreateWorkspace: actions.criar,
      handleDeleteWorkspace: actions.remover,
    },
  };
});

import { dashboardStore } from '../src/stores/dashboard';
import WorkspaceManagerModal from '../src/components/WorkspaceManagerModal.vue';

const workspace: Workspace = { id: 'w1', name: 'Principal', path: '/projetos', enabled: true };

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
  dashboardStore.selectedWorkspaceId.value = '';
  dashboardStore.newWorkspaceName.value = '';
  dashboardStore.newWorkspacePath.value = '';
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

  it('mostra caminho do workspace ativo e aciona scan/remoção', async () => {
    dashboardStore.workspaces.value = [workspace];
    dashboardStore.selectedWorkspaceId.value = workspace.id;
    mountModal();

    expect(document.querySelector('.modal-path')?.textContent).toBe(workspace.path);

    document.querySelector<HTMLButtonElement>('.primary-button')?.click();
    document.querySelector<HTMLButtonElement>('.danger-button')?.click();

    expect(actions.escanear).toHaveBeenCalledOnce();
    expect(actions.remover).toHaveBeenCalledOnce();
  });

  it('cadastra um novo workspace pelo formulário', () => {
    mountModal();

    document.querySelector('form')?.dispatchEvent(
      new Event('submit', { cancelable: true }),
    );

    expect(actions.criar).toHaveBeenCalledOnce();
  });

  it('emite close ao clicar em Fechar', () => {
    const wrapper = mountModal();

    document.querySelector<HTMLButtonElement>('.log-action-button')?.click();

    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
