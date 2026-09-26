<script setup lang="ts">
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CodeBracketIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  ExclamationTriangleIcon,
} from '@heroicons/vue/24/outline';
import { computed, ref } from 'vue';

import type {
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

const props = defineProps<{
  overview: ProjectGitOverview;
  workspace: ProjectGitWorkspace | null;
  busy: boolean;
  checking?: boolean;
  lastSynchronizationAt?: string | null;
  synchronizationMessage?: string;
  synchronizationError?: string;
}>();

const emit = defineEmits<{
  synchronize: [];
  'update-current-branch': [];
  'clear-console': [];
}>();

const settingsOpen = ref(false);

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

const currentBranchRemote = computed(
  () => currentLocalBranch.value?.upstream ?? props.overview.upstream,
);

const currentBranchAhead = computed(
  () => currentLocalBranch.value?.ahead ?? props.overview.ahead ?? 0,
);

const currentBranchBehind = computed(
  () => currentLocalBranch.value?.behind ?? props.overview.behind ?? 0,
);

const hasOriginRemote = computed(() =>
  (props.workspace?.remotes ?? []).some((remote) => remote.name === 'origin'),
);

const hasPrimaryRemote = computed(() =>
  (props.workspace?.remotes ?? []).some((remote) => remote.name === 'upstream'),
);

const synchronized = computed(() => {
  const localHash = localMain.value?.latestCommit?.hash;
  const originHash = originMain.value?.latestCommit?.hash;
  if (!localHash || !originHash || localHash !== originHash) return false;

  if (!hasPrimaryRemote.value) return true;

  const primaryHash = upstreamMain.value?.latestCommit?.hash;
  return Boolean(primaryHash && localHash === primaryHash);
});

const available = computed(
  () => Boolean(localMain.value) && hasOriginRemote.value,
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
  if (!currentBranchRemote.value) {
    return {
      label: 'Remoto não configurado',
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
      label: 'Commits locais e remotos pendentes',
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
  props.busy ? 'Sincronizando…' : 'Iniciar sincronização',
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
    !currentBranchRemote.value ||
    currentBranchBehind.value <= 0,
);

const lastSynchronizationLabel = computed(() => {
  if (!props.lastSynchronizationAt) return 'ainda não executada';

  const date = new Date(props.lastSynchronizationAt);
  if (Number.isNaN(date.getTime())) return props.lastSynchronizationAt;

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
});

const consoleState = computed(() => {
  if (props.checking) return { label: 'Verificando', tone: 'loading' };
  if (props.busy) return { label: 'Executando', tone: 'loading' };
  if (props.synchronizationError) return { label: 'Falhou', tone: 'warning' };
  if (props.lastSynchronizationAt)
    return { label: 'Concluída', tone: 'success' };
  return { label: 'Pronto', tone: 'idle' };
});

const consoleResult = computed(() => {
  if (props.checking) return 'Verificando referências remotas…';
  if (props.busy) return 'Executando a sincronização da main…';
  if (props.synchronizationError) return props.synchronizationError;
  if (props.lastSynchronizationAt) {
    return (
      props.synchronizationMessage || 'Sincronização concluída com sucesso.'
    );
  }
  if (synchronized.value) {
    return 'main e origin/main estão sincronizadas.';
  }
  if (!props.overview.clean) {
    return 'Confirme ou guarde as alterações locais antes de sincronizar.';
  }
  return 'Pronto para sincronizar main com origin/main.';
});

function statusIcon(tone: string) {
  if (tone === 'warning') return ExclamationTriangleIcon;
  if (tone === 'loading') return ArrowPathIcon;
  return CheckCircleIcon;
}
</script>

<template>
  <section class="git-sync-page">
    <section class="git-sync-main-card" aria-label="Sincronização da main">
      <div class="git-sync-main-copy">
        <span class="git-sync-main-icon" :class="`is-${status.tone}`">
          <component :is="statusIcon(status.tone)" aria-hidden="true" />
        </span>

        <div class="git-sync-main-details">
          <div class="git-sync-main-line">
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

          <small>
            Última sincronização:
            <strong>{{ lastSynchronizationLabel }}</strong>
          </small>
        </div>
      </div>

      <div class="git-sync-main-actions">
        <button
          type="button"
          class="git-sync-settings-button"
          :aria-expanded="settingsOpen"
          aria-controls="git-sync-settings"
          aria-label="Configurações da sincronização"
          title="Configurações"
          @click="settingsOpen = !settingsOpen"
        >
          <Cog6ToothIcon aria-hidden="true" />
          <ChevronDownIcon
            class="git-sync-settings-chevron"
            :class="{ 'is-open': settingsOpen }"
            aria-hidden="true"
          />
        </button>

        <button
          class="primary-button git-sync-button git-sync-primary-button"
          :class="{ 'is-busy': busy }"
          type="button"
          :disabled="buttonDisabled"
          @click="emit('synchronize')"
        >
          <ArrowPathIcon aria-hidden="true" />
          {{ buttonLabel }}
        </button>
      </div>
    </section>

    <div
      v-if="settingsOpen"
      id="git-sync-settings"
      class="git-sync-settings"
      aria-label="Configuração detectada da sincronização"
    >
      <div>
        <span>Origem principal</span>
        <strong>Detectada automaticamente</strong>
      </div>
      <div>
        <span>Destino</span>
        <strong>origin/main</strong>
      </div>
      <div>
        <span>Método</span>
        <strong>merge</strong>
      </div>
      <div>
        <span>Pré-condição</span>
        <strong>Árvore de trabalho limpa</strong>
      </div>
    </div>

    <section
      v-if="showCurrentBranchSync"
      class="git-sync-current-card"
      aria-label="Atualização da branch atual"
    >
      <div class="git-sync-current-copy">
        <span class="git-sync-current-icon">
          <CodeBracketIcon aria-hidden="true" />
        </span>
        <div>
          <small>Branch em uso</small>
          <strong>
            <span>{{ currentBranchName }}</span>
            <span aria-hidden="true">←</span>
            <span>{{ currentBranchRemote ?? 'sem remoto' }}</span>
          </strong>
          <small :class="`is-${currentBranchStatus.tone}`">
            {{ currentBranchStatus.label }}
          </small>
        </div>
      </div>

      <button
        class="secondary-button git-sync-button git-sync-current-button"
        :class="{ 'is-busy': busy }"
        type="button"
        :disabled="currentBranchButtonDisabled"
        @click="emit('update-current-branch')"
      >
        <ArrowPathIcon aria-hidden="true" />
        {{ busy ? 'Atualizando…' : 'Atualizar local' }}
      </button>
    </section>

    <section
      class="git-sync-console-card"
      aria-labelledby="git-sync-console-title"
    >
      <header class="git-sync-console-header">
        <div class="git-sync-console-title">
          <CommandLineIcon aria-hidden="true" />
          <h3 id="git-sync-console-title">Console</h3>
        </div>

        <div class="git-sync-console-tools">
          <span
            class="git-sync-console-state"
            :class="`is-${consoleState.tone}`"
            role="status"
          >
            <i aria-hidden="true"></i>
            {{ consoleState.label }}
          </span>

          <button
            type="button"
            class="git-sync-console-clear"
            :disabled="
              busy ||
              checking ||
              (!lastSynchronizationAt && !synchronizationError)
            "
            @click="emit('clear-console')"
          >
            Limpar
          </button>
        </div>
      </header>

      <div
        class="git-sync-console-output"
        role="log"
        aria-live="polite"
        aria-label="Resultado da sincronização"
      >
        <component
          :is="
            busy || checking
              ? ArrowPathIcon
              : synchronizationError
                ? ExclamationTriangleIcon
                : CheckCircleIcon
          "
          :class="{ 'is-spinning': busy || checking }"
          aria-hidden="true"
        />
        <span>{{ consoleResult }}</span>
        <time v-if="lastSynchronizationAt">{{ lastSynchronizationLabel }}</time>
      </div>
    </section>
  </section>
</template>

<style scoped>
.git-sync-page {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: calc(100vh - var(--app-topbar-height, 72px));
  flex-direction: column;
  background: var(--surface-1);
}

.git-sync-main-card,
.git-sync-current-card {
  display: flex;
  min-width: 0;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-1) 96%, var(--surface-2) 4%);
}

.git-sync-main-copy,
.git-sync-current-copy {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.git-sync-main-icon,
.git-sync-current-icon {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 8px;
  color: var(--accent);
  background: var(--accent-soft);
}

.git-sync-main-icon svg,
.git-sync-current-icon svg {
  width: 15px;
  height: 15px;
}

.git-sync-main-icon.is-success {
  color: var(--success-text);
  background: var(--success-surface);
}

.git-sync-main-icon.is-warning {
  color: var(--warning-text);
  background: var(--warning-surface);
}

.git-sync-main-details,
.git-sync-current-copy > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.git-sync-main-line {
  display: flex;
  min-width: 0;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
}

.git-sync-main-line > strong,
.git-sync-current-copy strong {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--text);
  font-size: 13px;
  line-height: 1.3;
}

.git-sync-main-details > small,
.git-sync-current-copy small {
  color: var(--text-muted);
  font-size: 9px;
}

.git-sync-main-details > small strong {
  color: var(--text-muted);
  font-weight: var(--font-weight-strong);
}

.git-sync-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 7px;
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: 9px;
  font-weight: var(--font-weight-strong);
  white-space: nowrap;
}

.git-sync-status svg {
  width: 12px;
  height: 12px;
}

.git-sync-status.is-success {
  color: var(--success-text);
  background: var(--success-surface);
}

.git-sync-status.is-warning {
  color: var(--warning-text);
  background: var(--warning-surface);
}

.git-sync-status.is-pending,
.git-sync-status.is-loading {
  color: var(--accent);
  background: var(--accent-soft);
}

.git-sync-main-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
}

.git-sync-button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 7px;
}

.git-sync-button svg {
  width: 14px;
  height: 14px;
}

.git-sync-primary-button {
  min-width: 164px;
}

.git-sync-current-button {
  min-width: 122px;
}

.git-sync-settings-button,
.git-sync-console-clear {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 9px;
}

.git-sync-settings-button {
  gap: 2px;
  padding: 4px 6px;
}

.git-sync-settings-button svg {
  width: 14px;
  height: 14px;
}

.git-sync-settings-button:hover,
.git-sync-console-clear:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text);
  background: var(--surface-2);
}

.git-sync-settings-chevron {
  width: 11px !important;
  transition: transform 0.18s ease;
}

.git-sync-settings-chevron.is-open {
  transform: rotate(180deg);
}

.git-sync-settings {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  border-bottom: 1px solid var(--border);
  background: var(--border);
}

.git-sync-settings > div {
  display: grid;
  min-width: 0;
  gap: 3px;
  padding: 9px 12px;
  background: var(--surface-2);
}

.git-sync-settings span {
  color: var(--text-dim);
  font-size: 8px;
}

.git-sync-settings strong {
  overflow: hidden;
  color: var(--text);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-sync-current-copy small:first-child {
  color: var(--text-dim);
  font-size: 8px;
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.git-sync-current-copy small.is-success {
  color: var(--success-text);
}

.git-sync-current-copy small.is-warning {
  color: var(--warning-text);
}

.git-sync-current-copy small.is-pending,
.git-sync-current-copy small.is-loading {
  color: var(--accent);
}

.git-sync-console-card {
  display: flex;
  min-width: 0;
  min-height: 180px;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-0);
}

.git-sync-console-header {
  display: flex;
  min-height: 44px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-1) 96%, var(--surface-2) 4%);
}

.git-sync-console-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.git-sync-console-title svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: var(--accent);
}

.git-sync-console-title h3 {
  margin: 0;
  color: var(--text);
  font-size: 10px;
  line-height: 1.3;
}

.git-sync-console-tools {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.git-sync-console-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 9px;
  font-weight: var(--font-weight-strong);
}

.git-sync-console-state i {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--text-dim);
}

.git-sync-console-state.is-success {
  color: var(--success-text);
}

.git-sync-console-state.is-success i {
  background: var(--success-text);
}

.git-sync-console-state.is-warning {
  color: var(--warning-text);
}

.git-sync-console-state.is-warning i {
  background: var(--warning-text);
}

.git-sync-console-state.is-loading {
  color: var(--accent);
}

.git-sync-console-state.is-loading i {
  background: var(--accent);
  animation: git-sync-pulse 1s ease-in-out infinite alternate;
}

.git-sync-console-clear {
  padding: 4px 9px;
}

.git-sync-console-clear:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.git-sync-console-output {
  display: grid;
  min-height: 0;
  flex: 1 1 auto;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-content: start;
  align-items: center;
  gap: 9px;
  padding: 16px 14px;
  color: var(--text-muted);
  background: var(--surface-0);
  font-family: var(--font-family-code);
  font-size: 10px;
  line-height: 1.5;
}

.git-sync-console-output > svg {
  width: 15px;
  height: 15px;
  color: var(--success-text);
}

.git-sync-console-output > svg.is-spinning {
  color: var(--accent);
  animation: git-sync-spin 0.8s linear infinite;
}

.git-sync-console-output time {
  color: var(--text-dim);
  font-family: var(--font-family-sans);
  font-size: 9px;
  white-space: nowrap;
}

.git-sync-button.is-busy svg,
.git-sync-main-icon.is-loading svg,
.git-sync-status.is-loading svg {
  animation: git-sync-spin 0.8s linear infinite;
}

@keyframes git-sync-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes git-sync-pulse {
  from {
    opacity: 0.45;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .git-sync-button.is-busy svg,
  .git-sync-main-icon.is-loading svg,
  .git-sync-status.is-loading svg,
  .git-sync-console-output > svg.is-spinning,
  .git-sync-console-state.is-loading i {
    animation: none;
  }

  .git-sync-settings-chevron {
    transition: none;
  }
}

@media (max-width: 960px) {
  .git-sync-settings {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .git-sync-main-card,
  .git-sync-current-card {
    align-items: stretch;
    flex-direction: column;
  }

  .git-sync-main-actions {
    width: 100%;
  }

  .git-sync-primary-button,
  .git-sync-current-button {
    flex: 1 1 auto;
  }

  .git-sync-console-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .git-sync-console-tools {
    width: 100%;
    justify-content: flex-end;
  }

  .git-sync-console-output {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .git-sync-console-output time {
    display: none;
  }

  .git-sync-settings {
    grid-template-columns: 1fr;
  }
}
</style>
