<script setup lang="ts">
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
      branch.kind === 'remote' &&
      branch.remote === 'origin' &&
      branch.shortName === 'main',
  ),
);

const upstreamMain = computed(() =>
  props.workspace?.branches.find(
    (branch) =>
      branch.kind === 'remote' &&
      branch.remote === 'upstream' &&
      branch.shortName === 'main',
  ),
);

const currentLocalBranch = computed(() =>
  props.workspace?.branches.find(
    (branch) => branch.kind === 'local' && branch.current,
  ),
);

const showCurrentBranchSync = computed(() =>
  Boolean(currentLocalBranch.value && currentLocalBranch.value.name !== 'main'),
);

const currentBranchName = computed(
  () => currentLocalBranch.value?.name ?? props.overview.branch ?? 'HEAD',
);

const currentBranchUpstream = computed(
  () => currentLocalBranch.value?.upstream ?? props.overview.upstream,
);

const currentBranchAhead = computed(
  () => currentLocalBranch.value?.ahead ?? props.overview.ahead ?? 0,
);

const currentBranchBehind = computed(
  () => currentLocalBranch.value?.behind ?? props.overview.behind ?? 0,
);

const hasRequiredRemotes = computed(() => {
  const remotes = props.workspace?.remotes ?? [];
  return (
    remotes.some((remote) => remote.name === 'upstream') &&
    remotes.some((remote) => remote.name === 'origin')
  );
});

const synchronized = computed(() => {
  const localHash = localMain.value?.latestCommit?.hash;
  const originHash = originMain.value?.latestCommit?.hash;
  const upstreamHash = upstreamMain.value?.latestCommit?.hash;
  return Boolean(
    localHash &&
    originHash &&
    upstreamHash &&
    localHash === originHash &&
    localHash === upstreamHash,
  );
});

const available = computed(
  () => Boolean(localMain.value) && hasRequiredRemotes.value,
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
      label:
        currentBranchBehind.value === 1
          ? '1 commit novo no remoto'
          : `${currentBranchBehind.value} commits novos no remoto`,
      tone: 'pending',
    };
  }
  return {
    label:
      currentBranchAhead.value > 0
        ? 'Sem commits remotos novos'
        : 'Branch atualizada',
    tone: 'success',
  };
});

const buttonLabel = computed(() =>
  props.busy ? 'Sincronizando…' : 'Sincronizar',
);

const buttonDisabled = computed(
  () =>
    props.busy ||
    props.checking ||
    synchronized.value ||
    !props.overview.clean ||
    !available.value,
);

const currentBranchButtonDisabled = computed(
  () =>
    props.busy ||
    props.checking ||
    !props.overview.clean ||
    !currentBranchUpstream.value ||
    currentBranchBehind.value <= 0 ||
    currentBranchAhead.value > 0,
);

function statusIcon(tone: string) {
  if (tone === 'warning') return ExclamationTriangleIcon;
  if (tone === 'loading') return ArrowPathIcon;
  return CheckCircleIcon;
}
</script>

<template>
  <section class="git-sync-page">
    <header class="git-sync-heading">
      <div>
        <span class="git-sync-eyebrow">Estado do repositório</span>
        <h2>Sincronização</h2>
        <p>
          Compare suas branches locais e remotas e mantenha o projeto
          atualizado.
        </p>
      </div>
      <span class="git-sync-heading-badge">
        <CheckCircleIcon aria-hidden="true" />
        Git conectado
      </span>
    </header>
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
    </div>

    <div class="git-sync-card git-sync-main-card">
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
              <component :is="statusIcon(status.tone)" aria-hidden="true" />
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
    </div>
  </section>
</template>

<style scoped>
.git-sync-page {
  display: grid;
  align-content: start;
  grid-auto-rows: max-content;
  min-width: 0;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
}

.git-sync-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: 4px 0 var(--space-2);
}

.git-sync-heading > div {
  display: grid;
  gap: 5px;
}

.git-sync-eyebrow {
  color: var(--accent);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.git-sync-heading h2,
.git-sync-heading p {
  margin: 0;
}

.git-sync-heading h2 {
  color: var(--text);
  font-size: var(--font-xl);
}

.git-sync-heading p {
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.git-sync-heading-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid color-mix(in srgb, var(--success-text) 28%, var(--border));
  border-radius: 999px;
  background: var(--success-surface);
  color: var(--success-text);
  padding: 7px 10px;
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  white-space: nowrap;
}

.git-sync-heading-badge svg {
  width: 16px;
  height: 16px;
}

.git-sync-card {
  overflow: hidden;
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.git-sync-main-row {
  display: flex;
  min-height: 108px;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding: var(--space-5);
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
  font-size: clamp(20px, 2vw, 28px);
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
  .git-sync-page {
    padding: var(--space-3);
  }

  .git-sync-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .git-sync-heading-badge {
    align-self: flex-start;
  }

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
