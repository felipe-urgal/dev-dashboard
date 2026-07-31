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

const upstreamMain = computed(() =>
  props.workspace?.branches.find(
    (branch) =>
      branch.kind === 'remote'
      && branch.remote === 'upstream'
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
  if (synchronized.value) {
    return {
      label: 'Sincronizado na última verificação',
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

const buttonLabel = computed(() => {
  if (props.busy) return 'Sincronizando…';
  return synchronized.value ? 'Verificar' : 'Sincronizar';
});

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
        A sincronização verifica o upstream, atualiza a main e publica no origin.
      </p>
    </div>
  </section>
</template>

<style scoped>
.git-sync-page {
  min-width: 0;
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
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  min-height: 180px;
  padding: 32px 24px;
}

.git-sync-relationship {
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
}

.git-sync-relationship > svg {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  color: var(--accent);
}

.git-sync-relationship > div {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.git-sync-relationship strong {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text);
  font-size: 25px;
  letter-spacing: -0.02em;
}

.git-sync-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  color: var(--text-muted);
  font-size: var(--font-sm);
  font-weight: var(--font-weight-strong);
}

.git-sync-status svg {
  width: 19px;
  height: 19px;
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

.git-sync-status.is-loading svg {
  animation: git-sync-spin 1s linear infinite;
}

.git-sync-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 170px;
  min-height: 48px;
}

.git-sync-button svg {
  width: 20px;
  height: 20px;
}

.git-sync-button:disabled svg {
  animation: none;
}

.git-sync-button:not(:disabled) svg {
  animation: none;
}

.git-sync-note {
  margin: 0;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  padding: 14px 24px;
  font-size: var(--font-xs);
}

@keyframes git-sync-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .git-sync-main-row {
    align-items: stretch;
    flex-direction: column;
    min-height: 0;
    padding: 24px 18px;
  }

  .git-sync-relationship strong {
    flex-wrap: wrap;
    font-size: 21px;
  }

  .git-sync-button {
    width: 100%;
  }
}
</style>
