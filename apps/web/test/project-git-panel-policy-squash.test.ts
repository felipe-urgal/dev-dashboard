import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  branch: 'bugfix/ajustar-layout',
  panel: {
    mutationRunning: { value: false },
    remoteRefreshRunning: { value: false },
    workspace: { value: null as any },
    mutationMessage: { value: '' },
    mutationErrorMessage: { value: '' },
    amendedBranch: { value: null as string | null },
    overview: {
      value: {
        branch: 'bugfix/ajustar-layout',
        latestCommit: { hash: 'commit-anterior' },
      } as any,
    },
    reloadGitData: vi.fn().mockResolvedValue(undefined),
    runMutation: vi.fn(),
    changeImpact: { value: null },
    createBranchName: { value: '' },
    commitMode: { value: 'create' },
    runCommit: vi.fn().mockResolvedValue(undefined),
  },
  createBranch: vi.fn(),
  prepareMutation: vi.fn(),
  publishBranch: vi.fn(),
  preparePublish: vi.fn(),
  prepareForcePush: vi.fn(),
  forcePush: vi.fn(),
  fetchSquashStatus: vi.fn(),
  prepareSquash: vi.fn(),
  squashBranch: vi.fn(),
  confirmDialog: vi.fn(),
}));

vi.mock('../src/api', () => ({
  createProjectGitBranch: mocks.createBranch,
  prepareProjectGitMutation: mocks.prepareMutation,
}));

vi.mock('../src/api/git-branch-publish', () => ({
  forcePushProjectGitBranchWithLease: mocks.forcePush,
  prepareProjectGitBranchPublish: mocks.preparePublish,
  prepareProjectGitForcePushWithLease: mocks.prepareForcePush,
  publishProjectGitBranch: mocks.publishBranch,
}));

vi.mock('../src/api/git-branch-squash', () => ({
  fetchProjectGitBranchSquashStatus: mocks.fetchSquashStatus,
  prepareProjectGitBranchSquash: mocks.prepareSquash,
  squashProjectGitBranch: mocks.squashBranch,
}));

vi.mock('../src/stores/app-dialog', () => ({
  confirmDialog: mocks.confirmDialog,
}));

vi.mock('../src/composables/useProjectGitPanel', () => ({
  useProjectGitPanel: () => mocks.panel,
}));

async function policy() {
  // O tsconfig de testes usa tsc puro, que enxerga arquivos .vue apenas pelo
  // shim genérico e não resolve exports de tipo de <script setup>. Importar o
  // policy estaticamente faria o tsc seguir useProjectGitPanel.ts e falhar no
  // tipo CommitMode exportado pelo SFC, mesmo que essa dependência esteja
  // mockada neste teste. O import em runtime mantém o teste comportamental sem
  // acoplar a checagem de tipos à implementação interna do componente Vue.
  const modulePath = '../src/composables/useProjectGitPanelPolicy';
  const { useProjectGitPanelPolicy } = await vi.importActual<any>(modulePath);

  return useProjectGitPanelPolicy(
    { project: { id: 'projeto-1' } as any },
    undefined,
    vi.fn(),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.panel.mutationRunning.value = false;
  mocks.panel.remoteRefreshRunning.value = false;
  mocks.panel.mutationMessage.value = '';
  mocks.panel.mutationErrorMessage.value = '';
  mocks.panel.amendedBranch.value = null;
  mocks.panel.overview.value = {
    branch: mocks.branch,
    latestCommit: { hash: 'commit-anterior' },
  } as any;
  mocks.panel.workspace.value = {
    branches: [
      {
        kind: 'remote',
        remote: 'origin',
        shortName: mocks.branch,
        name: `origin/${mocks.branch}`,
      },
    ],
  } as any;
  mocks.prepareSquash.mockResolvedValue({ token: 'token-squash' });
  mocks.squashBranch.mockResolvedValue(mocks.branch);
  mocks.prepareForcePush.mockResolvedValue({ token: 'token-force-push' });
  mocks.forcePush.mockResolvedValue(mocks.branch);
  mocks.panel.reloadGitData.mockResolvedValue(undefined);
});

describe('squash de branch publicada', () => {
  it('cria o commit com a mensagem escolhida e reenvia para origin com lease', async () => {
    const git = await policy();

    await git.runSquashBranch(
      mocks.branch,
      'fix: corrigir ajustes de layout identificados no QA',
    );

    expect(mocks.squashBranch).toHaveBeenCalledWith(
      'projeto-1',
      mocks.branch,
      'fix: corrigir ajustes de layout identificados no QA',
      'token-squash',
    );
    expect(mocks.prepareForcePush).toHaveBeenCalledWith(
      'projeto-1',
      mocks.branch,
    );
    expect(mocks.forcePush).toHaveBeenCalledWith(
      'projeto-1',
      mocks.branch,
      'token-force-push',
    );
    expect(mocks.panel.amendedBranch.value).toBeNull();
    expect(mocks.panel.mutationMessage.value).toContain(
      'reenviada para origin/bugfix/ajustar-layout com lease',
    );
    expect(mocks.panel.mutationErrorMessage.value).toBe('');
  });

  it('mantém a ação Reenviar disponível quando o squash local funciona e o push falha', async () => {
    mocks.forcePush.mockRejectedValueOnce(new Error('lease recusado'));
    const git = await policy();

    await git.runSquashBranch(
      mocks.branch,
      'fix: corrigir ajustes de layout identificados no QA',
    );

    expect(mocks.squashBranch).toHaveBeenCalledTimes(1);
    expect(mocks.panel.amendedBranch.value).toBe(mocks.branch);
    expect(mocks.panel.mutationMessage.value).toContain(
      'Squash concluído localmente',
    );
    expect(mocks.panel.mutationErrorMessage.value).toContain(
      'Não foi possível reenviar origin/bugfix/ajustar-layout com lease',
    );
    expect(mocks.panel.mutationErrorMessage.value).toContain('lease recusado');
    expect(mocks.panel.reloadGitData).toHaveBeenCalledTimes(1);
  });
});
