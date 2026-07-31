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
}>();

const emit = defineEmits<{
  synchronize: [];
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

const hasRequiredRemotes = computed(() => {
  const remotes = props.workspace?.remotes ?? [];
  return remotes.some((remote) => remote.name === 'upstream')
    && remotes.some((remote) => remote.name === 'origin');
});

const synchronized = computed(() => {
  const localHash = localMain.value?.latestCommit?.hash;
  const originHash = originMain.value?.latestCommit?.hash;
  return Boolean(localHash && originHash && localHash === originHash);
});

const available = computed(() =>
  Boolean(localMain.value)
  && hasRequiredRemotes.value,
);

const status = computed(() => {
  if (!props.workspace) {
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
  if (!props.overview.clean) {
    return {
      label: 'Alterações locais pendentes',
      tone: 'warning',
    };
  }
  if (synchronized.value) {
    return {
      label: 'Sincronizado',
      tone: 'success',
    };
  }
  return {
    label: 'Sincronização pendente',
    tone: 'pending',
  };
});

const buttonLabel = computed(() =>
  props.busy ? 'Sincronizando…' : 'Sincronizar',
);

const buttonDisabled = computed(() =>
  props.busy
  || !props.overview.clean
  || !available.value,
);
</script>

<template>
  <section class="git-sync-page">
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
                :is="
                  status.tone === 'warning'
                    ? ExclamationTriangleIcon
                    : status.tone === 'loading'
                      ? ArrowPathIcon
                      : CheckCircleIcon
                "
                aria-hidden="true"
              />
              {{ status.label }}
            </span>
          </div>
        </div>

        <button
          class="secondary-button git-sync-button"
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
  width: min(1280px, 100%);
  min-width: 0;
  margin-inline: auto;
}

.git-sync-card {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: var(--shadow-1);
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
  gap: var(--space-3);
}

.git-sync-relationship strong {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text);
  font-size: 24px;
  line-height: 1.2;
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
.git-sync-button:disabled svg {
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
