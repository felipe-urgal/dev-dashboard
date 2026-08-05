from pathlib import Path


def write(path: str, content: str) -> None:
    Path(path).write_text(content, encoding='utf-8')


def replace(path: str, old: str, new: str) -> None:
    file = Path(path)
    content = file.read_text(encoding='utf-8')
    if old not in content:
        raise SystemExit(f'pattern not found in {path}: {old[:160]!r}')
    file.write_text(content.replace(old, new, 1), encoding='utf-8')


write('apps/web/src/components/ProjectGitSyncPage.vue', '''<script setup lang="ts">
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShareIcon,
} from '@heroicons/vue/24/outline';
import { computed } from 'vue';

import type {
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

const props = defineProps<{
  overview: ProjectGitOverview;
  workspace: ProjectGitWorkspace | null;
  busy: boolean;
  checking?: boolean;
}>();

const emit = defineEmits<{
  synchronize: [];
  'update-current-branch': [];
}>();

const localMain = computed(() =>
  props.workspace?.branches.find(
    (branch) => branch.kind === 'local' && branch.name === 'main',
  ),
);

const originMain = computed(() =>
  props.workspace?.branches.find(
    (branch) =>
      branch.kind === 'remote'
      && branch.remote === 'origin'
      && branch.shortName === 'main',
  ),
);

const upstreamMain = computed(() =>
  props.workspace?.branches.find(
    (branch) =>
      branch.kind === 'remote'
      && branch.remote === 'upstream'
      && branch.shortName === 'main',
  ),
);

const currentLocalBranch = computed(() =>
  props.workspace?.branches.find(
    (branch) => branch.kind === 'local' && branch.current,
  ),
);

const showCurrentBranchSync = computed(() =>
  Boolean(
    currentLocalBranch.value
    && currentLocalBranch.value.name !== 'main',
  ),
);

const currentBranchName = computed(() =>
  currentLocalBranch.value?.name
  ?? props.overview.branch
  ?? 'HEAD',
);

const currentBranchUpstream = computed(() =>
  currentLocalBranch.value?.upstream
  ?? props.overview.upstream,
);

const currentBranchAhead = computed(() =>
  currentLocalBranch.value?.ahead
  ?? props.overview.ahead
  ?? 0,
);

const currentBranchBehind = computed(() =>
  currentLocalBranch.value?.behind
  ?? props.overview.behind
  ?? 0,
);

const hasRequiredRemotes = computed(() => {
  const remotes = props.workspace?.remotes ?? [];
  return remotes.some((remote) => remote.name === 'upstream')
    && remotes.some((remote) => remote.name === 'origin');
});

const synchronized = computed(() => {
  const localHash = localMain.value?.latestCommit?.hash;
  const originHash = originMain.value?.latestCommit?.hash;
  const upstreamHash = upstreamMain.value?.latestCommit?.hash;
  return Boolean(
    localHash
    && originHash
    && upstreamHash
    && localHash === originHash
    && localHash === upstreamHash,
  );
});

const available = computed(() =>
  Boolean(localMain.value)
  && hasRequiredRemotes.value,
);

const status = computed(() => {
  if (!props.workspace || props.checking) {
    return {
      label: 'Verificando…',
      tone: 'loading',
    };
  }
  if (!available.value) {
    return {
      label: 'Sincronização indisponível',
      tone: 'warning',
    };
  }
  if (synchronized.value) {
    return {
      label: 'Tudo sincronizado',
      tone: 'success',
    };
  }
  if (!props.overview.clean) {
    return {
      label: 'Alterações locais pendentes',
      tone: 'warning',
    };
  }
  return {
    label: 'Sincronização pendente',
    tone: 'pending',
  };
});

const currentBranchStatus = computed(() => {
  if (!props.workspace || props.checking) {
    return {
      label: 'Verificando…',
      tone: 'loading',
    };
  }
  if (!currentBranchUpstream.value) {
    return {
      label: 'Upstream não configurado',
      tone: 'warning',
    };
  }
  if (!props.overview.clean) {
    return {
      label: 'Alterações locais pendentes',
      tone: 'warning',
    };
  }
  if (currentBranchAhead.value > 0 && currentBranchBehind.value > 0) {
    return {
      label: 'Branch local e remota divergiram',
      tone: 'warning',
    };
  }
  if (currentBranchBehind.value > 0) {
    return {
      label: currentBranchBehind.value === 1
        ? '1 commit novo no remoto'
        : `${currentBranchBehind.value} commits novos no remoto`,
      tone: 'pending',
    };
  }
  return {
    label: currentBranchAhead.value > 0
      ? 'Sem commits remotos novos'
      : 'Branch atualizada',
    tone: 'success',
  };
});

const buttonLabel = computed(() =>
  props.busy ? 'Sincronizando…' : 'Sincronizar',
);

const buttonDisabled = computed(() =>
  props.busy
  || props.checking
  || synchronized.value
  || !props.overview.clean
  || !available.value,
);

const currentBranchButtonDisabled = computed(() =>
  props.busy
  || props.checking
  || !props.overview.clean
  || !currentBranchUpstream.value
  || currentBranchBehind.value <= 0
  || currentBranchAhead.value > 0,
);

function statusIcon(tone: string) {
  if (tone === 'warning') return ExclamationTriangleIcon;
  if (tone === 'loading') return ArrowPathIcon;
  return CheckCircleIcon;
}
</script>

<template>
  <section class="git-sync-page">
    <div
      v-if="showCurrentBranchSync"
      class="git-sync-card git-sync-current-card"
    >
      <div class="git-sync-main-row">
        <div class="git-sync-relationship">
          <ShareIcon aria-hidden="true" />
          <div>
            <strong>
              <span>{{ currentBranchName }}</span>
              <span aria-hidden="true">←</span>
              <span>{{ currentBranchUpstream ?? 'sem upstream' }}</span>
            </strong>
            <span
              class="git-sync-status"
              :class="`is-${currentBranchStatus.tone}`"
              role="status"
            >
              <component
                :is="statusIcon(currentBranchStatus.tone)"
                aria-hidden="true"
              />
              {{ currentBranchStatus.label }}
            </span>
          </div>
        </div>

        <button
          class="secondary-button git-sync-button"
          :class="{ 'is-busy': busy }"
          type="button"
          :disabled="currentBranchButtonDisabled"
          @click="emit('update-current-branch')"
        >
          <ArrowPathIcon aria-hidden="true" />
          {{ busy ? 'Atualizando…' : 'Atualizar local' }}
        </button>
      </div>

      <p class="git-sync-note">
        Traz os commits do upstream configurado usando somente fast-forward.
        Não cria merge nem rebase automaticamente.
      </p>
    </div>

    <div class="git-sync-card">
      <div class="git-sync-main-row">
        <div class="git-sync-relationship">
          <ShareIcon aria-hidden="true" />
          <div>
            <strong>
              <span>main</span>
              <span aria-hidden="true">→</span>
              <span>origin/main</span>
            </strong>
            <span
              class="git-sync-status"
              :class="`is-${status.tone}`"
              role="status"
            >
              <component
                :is="statusIcon(status.tone)"
                aria-hidden="true"
              />
              {{ status.label }}
            </span>
          </div>
        </div>

        <button
          class="secondary-button git-sync-button"
          :class="{ 'is-busy': busy }"
          type="button"
          :disabled="buttonDisabled"
          @click="emit('synchronize')"
        >
          <ArrowPathIcon aria-hidden="true" />
          {{ buttonLabel }}
        </button>
      </div>

      <p class="git-sync-note">
        A sincronização atualiza a main e publica no origin.
      </p>
    </div>
  </section>
</template>

<style scoped>
.git-sync-page {
  display: grid;
  min-width: 0;
  gap: var(--space-4);
}

.git-sync-card {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: var(--shadow-1);
}

.git-sync-current-card {
  border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
}

.git-sync-main-row {
  display: flex;
  min-height: 180px;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding: var(--space-6);
}

.git-sync-relationship {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-4);
}

.git-sync-relationship > svg {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  color: var(--accent);
}

.git-sync-relationship > div {
  display: grid;
  min-width: 0;
  gap: var(--space-3);
}

.git-sync-relationship strong {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  color: var(--text);
  font-size: 24px;
  line-height: 1.2;
}

.git-sync-relationship strong span {
  overflow-wrap: anywhere;
}

.git-sync-status {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: var(--font-md);
  font-weight: var(--font-weight-strong);
}

.git-sync-status svg {
  width: 22px;
  height: 22px;
}

.git-sync-status.is-success {
  color: var(--success-text);
}

.git-sync-status.is-warning {
  color: var(--warning-text);
}

.git-sync-status.is-pending {
  color: var(--accent);
}

.git-sync-status.is-loading svg,
.git-sync-button.is-busy svg {
  animation: git-sync-spin 0.8s linear infinite;
}

.git-sync-button {
  display: inline-flex;
  min-width: 170px;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 9px;
}

.git-sync-button svg {
  width: 19px;
  height: 19px;
}

.git-sync-note {
  margin: 0;
  border-top: 1px solid var(--border);
  padding: var(--space-4) var(--space-6);
  color: var(--text-muted);
  font-size: var(--font-sm);
}

@keyframes git-sync-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .git-sync-main-row {
    min-height: 0;
    align-items: stretch;
    flex-direction: column;
    padding: var(--space-5);
  }

  .git-sync-relationship strong {
    flex-wrap: wrap;
    font-size: 20px;
  }

  .git-sync-button {
    width: 100%;
  }

  .git-sync-note {
    padding: var(--space-4) var(--space-5);
  }
}
</style>
''')

replace(
    'apps/web/src/composables/useProjectGitPanel.ts',
    "  prepareProjectGitMutation,\n  renameProjectGitBranch,",
    "  prepareProjectGitMutation,\n  pullProjectGitBranch,\n  renameProjectGitBranch,",
)
replace(
    'apps/web/src/composables/useProjectGitPanel.ts',
    '''  async function runMainSynchronization(): Promise<void> {
''',
    '''  async function runUpdateCurrentBranch(): Promise<void> {
    if (mutationRunning.value || remoteRefreshRunning.value) return;

    const branch = overview.value?.branch;
    const upstream = overview.value?.upstream;
    if (!branch || overview.value?.detached) {
      mutationErrorMessage.value =
        'Selecione uma branch local antes de atualizar.';
      return;
    }
    if (!upstream) {
      mutationErrorMessage.value =
        `A branch "${branch}" não possui upstream configurado.`;
      return;
    }
    if (!overview.value?.clean) {
      mutationErrorMessage.value =
        'Guarde ou confirme as alterações locais antes de atualizar a branch.';
      return;
    }

    const confirmed = await confirmDialog({
      title: 'Atualizar branch local?',
      message:
        `Os commits de "${upstream}" serão trazidos para "${branch}" `
        + 'somente por fast-forward. Nenhum merge ou rebase será criado automaticamente.',
      confirmLabel: 'Atualizar local',
      tone: 'warning',
    });
    if (!confirmed) return;

    mutationRunning.value = true;
    mutationMessage.value = '';
    mutationErrorMessage.value = '';

    try {
      const confirmation = await prepareProjectGitMutation(
        props.project.id,
        'pull',
        branch,
      );
      const updatedBranch = await pullProjectGitBranch(
        props.project.id,
        confirmation.token,
      );
      mutationMessage.value =
        `Branch "${updatedBranch}" atualizada a partir de ${upstream}.`;
      await reloadGitData();
    } catch (error) {
      mutationErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar a branch local.';
    } finally {
      mutationRunning.value = false;
    }
  }

  async function runMainSynchronization(): Promise<void> {
''',
)
replace(
    'apps/web/src/composables/useProjectGitPanel.ts',
    "    runDeleteRemoteBranch,\n    runMainSynchronization,",
    "    runDeleteRemoteBranch,\n    runUpdateCurrentBranch,\n    runMainSynchronization,",
)

replace(
    'apps/web/src/components/ProjectGitPanel.vue',
    "  runDeleteRemoteBranch,\n  runMainSynchronization,",
    "  runDeleteRemoteBranch,\n  runUpdateCurrentBranch,\n  runMainSynchronization,",
)
replace(
    'apps/web/src/components/ProjectGitPanel.template.html',
    '''        :checking="remoteRefreshRunning"
        @synchronize="runMainSynchronization"
      />''',
    '''        :checking="remoteRefreshRunning"
        @update-current-branch="runUpdateCurrentBranch"
        @synchronize="runMainSynchronization"
      />''',
)

with Path('apps/web/test/project-git-sync-and-branches.test.ts').open('a', encoding='utf-8') as file:
    file.write('''

test('branch atual atrasada oferece atualização local por fast-forward', async () => {
  const branchName = 'agent/redesign-home-observatorio';
  const branchOverview: ProjectGitOverview = {
    ...overview,
    branch: branchName,
    upstream: `origin/${branchName}`,
    behind: 2,
  };
  const branchWorkspace: ProjectGitWorkspace = {
    ...workspace,
    branches: [
      ...workspace.branches.map((branch) =>
        branch.name === 'main'
          ? { ...branch, current: false }
          : branch,
      ),
      {
        name: branchName,
        shortName: branchName,
        kind: 'local',
        current: true,
        upstream: `origin/${branchName}`,
        ahead: 0,
        behind: 2,
        latestCommit: commit,
      },
      {
        name: `origin/${branchName}`,
        shortName: branchName,
        kind: 'remote',
        current: false,
        remote: 'origin',
        ahead: 0,
        behind: 0,
        latestCommit: commit,
      },
    ],
  };

  const wrapper = mount(ProjectGitSyncPage, {
    props: {
      overview: branchOverview,
      workspace: branchWorkspace,
      busy: false,
      checking: false,
    },
  });

  const card = wrapper.find('.git-sync-current-card');
  assert.ok(card.exists());
  assert.match(
    card.text(),
    /agent\/redesign-home-observatorio\s*←\s*origin\/agent\/redesign-home-observatorio/,
  );
  assert.match(card.text(), /2 commits novos no remoto/);

  const update = card.find('.git-sync-button');
  assert.equal(update.attributes('disabled'), undefined);
  await update.trigger('click');
  assert.equal(wrapper.emitted('update-current-branch')?.length, 1);
});

test('branch divergente não permite atualização automática', () => {
  const branchName = 'feature/colaborativa';
  const branchOverview: ProjectGitOverview = {
    ...overview,
    branch: branchName,
    upstream: `origin/${branchName}`,
    ahead: 1,
    behind: 2,
  };
  const branchWorkspace: ProjectGitWorkspace = {
    ...workspace,
    branches: [
      ...workspace.branches.map((branch) =>
        branch.name === 'main'
          ? { ...branch, current: false }
          : branch,
      ),
      {
        name: branchName,
        shortName: branchName,
        kind: 'local',
        current: true,
        upstream: `origin/${branchName}`,
        ahead: 1,
        behind: 2,
        latestCommit: commit,
      },
    ],
  };

  const wrapper = mount(ProjectGitSyncPage, {
    props: {
      overview: branchOverview,
      workspace: branchWorkspace,
      busy: false,
      checking: false,
    },
  });

  const card = wrapper.find('.git-sync-current-card');
  assert.match(card.text(), /divergiram/);
  assert.ok(card.find('.git-sync-button').attributes('disabled') !== undefined);
});
''')

replace(
    'apps/web/test/project-git-panel.test.ts',
    "test('lista branches locais e origin sem expor ações de sincronização', async () => {",
    '''test('atualiza a branch atual a partir do upstream por pull confirmado', async () => {
  const originalConfirm = globalThis.confirm;
  globalThis.confirm = () => true;

  const collaborativeOverview: ProjectGitOverview = {
    ...baseOverview,
    behind: 2,
    ahead: 0,
    clean: true,
  };
  const collaborativeWorkspace: ProjectGitWorkspace = {
    ...baseWorkspace,
    branches: baseWorkspace.branches.map((branch) =>
      branch.name === 'feature/git-ui'
        ? { ...branch, behind: 2, ahead: 0 }
        : branch,
    ),
  };

  const mounted = await mountPanel({
    overview: collaborativeOverview,
    workspace: collaborativeWorkspace,
    handler: (request) => {
      if (request.path.endsWith('/git/mutations/confirmations')) {
        return jsonResponse({
          confirmation: {
            token: 'p'.repeat(64),
            operation: 'pull',
            target: 'feature/git-ui',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        }, 201);
      }
      if (request.path.endsWith('/git/pull')) {
        return jsonResponse({ branch: { branch: 'feature/git-ui' } });
      }
      return undefined;
    },
  });
  cleanup = () => {
    mounted.restore();
    globalThis.confirm = originalConfirm;
  };

  const card = mounted.wrapper.find('.git-sync-current-card');
  assert.ok(card.exists());
  const update = card.find('.git-sync-button');
  assert.match(update.text(), /Atualizar local/);
  await update.trigger('click');
  await flushPromises();
  await flushPromises();

  const confirmation = mounted.requests.find((request) =>
    request.path.endsWith('/git/mutations/confirmations')
      && (request.body as { operation?: string } | undefined)?.operation === 'pull',
  );
  const pull = mounted.requests.find((request) =>
    request.path.endsWith('/git/pull'),
  );
  assert.deepEqual(confirmation?.body, {
    operation: 'pull',
    target: 'feature/git-ui',
  });
  assert.deepEqual(pull?.body, {
    confirmationToken: 'p'.repeat(64),
  });
  assert.match(
    mounted.wrapper.text(),
    /Branch "feature\/git-ui" atualizada a partir de origin\/feature\/git-ui/,
  );
});

test('lista branches locais e origin sem expor ações de sincronização', async () => {''',
)

replace(
    'docs/tasks/100-test-failure-navigator.md',
    '''- após um amend em branch publicada no origin, o painel oferece reenvio manual
  com `--force-with-lease` explícito, confirmação vinculada ao SHA remoto,
  recusa de branch protegida e registro no histórico de mutações.''',
    '''- após um amend em branch publicada no origin, o painel oferece reenvio manual
  com `--force-with-lease` explícito, confirmação vinculada ao SHA remoto,
  recusa de branch protegida e registro no histórico de mutações;
- a aba Sincronização mostra a branch atual quando ela não é `main` e permite
  trazer commits do upstream configurado por `pull --ff-only`, sem merge ou
  rebase automático; branches divergentes e árvores sujas permanecem bloqueadas.''',
)
replace(
    'docs/tasks/100-test-failure-navigator.md',
    '''6. Alterar o último commit de uma branch publicada e confirmar que “Reenviar
   com lease” aparece; a ação deve falhar caso o origin tenha mudado desde a
   confirmação.''',
    '''6. Alterar o último commit de uma branch publicada e confirmar que “Reenviar
   com lease” aparece; a ação deve falhar caso o origin tenha mudado desde a
   confirmação.
7. Em uma branch rastreada que esteja atrás do origin, abrir Sincronização e
   usar “Atualizar local”; confirmar fast-forward sem commit de merge. Em uma
   branch divergente, confirmar que a ação permanece bloqueada.''',
)

for temporary in [
    '.tmp_current_branch_sync.py',
    '.github/workflows/_temp_current_branch_sync.yml',
]:
    Path(temporary).unlink(missing_ok=True)
