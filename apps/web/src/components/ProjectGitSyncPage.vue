<script setup lang="ts">
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  CodeBracketIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ShareIcon,
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

const currentBranchUpstream = computed(
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

const hasUpstreamRemote = computed(() =>
  (props.workspace?.remotes ?? []).some((remote) => remote.name === 'upstream'),
);

const syncRemote = computed(() =>
  hasUpstreamRemote.value ? 'upstream' : 'origin',
);

const syncReference = computed(() => `${syncRemote.value}/main`);

const synchronized = computed(() => {
  const localHash = localMain.value?.latestCommit?.hash;
  const originHash = originMain.value?.latestCommit?.hash;
  if (!localHash || !originHash || localHash !== originHash) return false;

  if (!hasUpstreamRemote.value) return true;

  const upstreamHash = upstreamMain.value?.latestCommit?.hash;
  return Boolean(upstreamHash && localHash === upstreamHash);
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
      label: 'Indisponível',
      tone: 'warning',
    };
  }
  if (synchronized.value) {
    return {
      label: 'Atualizado',
      tone: 'success',
    };
  }
  if (!props.overview.clean) {
    return {
      label: 'Alterações locais',
      tone: 'warning',
    };
  }
  return {
    label: 'Sincronização pendente',
    tone: 'pending',
  };
});

const statusDescription = computed(() => {
  if (props.checking) return 'Atualizando referências remotas.';
  if (!available.value) return 'Main local ou origin não disponível.';
  if (!props.overview.clean)
    return 'Guarde ou confirme as alterações antes de sincronizar.';
  if (synchronized.value)
    return `main alinhada com ${syncReference.value} e origin/main.`;
  return `Há diferenças entre main, ${syncReference.value} e origin/main.`;
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
    props.busy || props.checking || !props.overview.clean || !available.value,
);

const currentBranchButtonDisabled = computed(
  () =>
    props.busy ||
    props.checking ||
    !props.overview.clean ||
    !currentBranchUpstream.value ||
    currentBranchBehind.value <= 0,
);

const lastSynchronizationLabel = computed(() => {
  if (!props.lastSynchronizationAt) return 'Ainda não executada';

  const date = new Date(props.lastSynchronizationAt);
  if (Number.isNaN(date.getTime())) return props.lastSynchronizationAt;

  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
});

const lastSynchronizationDetail = computed(() =>
  props.lastSynchronizationAt ? 'Nesta sessão' : 'Nesta sessão',
);

const consoleState = computed(() => {
  if (props.checking) return { label: 'Verificando', tone: 'loading' };
  if (props.busy) return { label: 'Executando', tone: 'loading' };
  if (props.synchronizationError) return { label: 'Falhou', tone: 'warning' };
  if (props.lastSynchronizationAt)
    return { label: 'Concluída', tone: 'success' };
  return { label: 'Pronto', tone: 'idle' };
});

const consoleSteps = computed(() => [
  `git fetch --prune ${syncRemote.value}`,
  'git checkout main',
  `git merge --no-edit ${syncReference.value}`,
  'git push origin main:main',
]);

const consoleResult = computed(() => {
  if (props.checking) return 'Verificando as referências remotas…';
  if (props.busy) return 'Executando o fluxo de sincronização no repositório…';
  if (props.synchronizationError) return props.synchronizationError;
  if (props.lastSynchronizationAt) {
    return (
      props.synchronizationMessage || 'Sincronização concluída com sucesso.'
    );
  }
  if (synchronized.value) {
    return `Estado atual verificado: main alinhada com ${syncReference.value} e origin/main.`;
  }
  if (!props.overview.clean) {
    return 'Aguardando uma árvore de trabalho limpa para iniciar.';
  }
  return 'Pronto para sincronizar a main.';
});

function statusIcon(tone: string) {
  if (tone === 'warning') return ExclamationTriangleIcon;
  if (tone === 'loading') return ArrowPathIcon;
  return CheckCircleIcon;
}
</script>

<template>
  <section class="git-sync-page">
    <section class="git-sync-summary" aria-label="Resumo da sincronização">
      <article class="git-sync-summary-card">
        <span class="git-sync-summary-icon">
          <ShareIcon aria-hidden="true" />
        </span>
        <div>
          <span>Branch atual</span>
          <strong>{{ currentBranchName }}</strong>
          <small>{{
            currentBranchUpstream ?? 'Sem upstream configurado'
          }}</small>
        </div>
      </article>

      <article class="git-sync-summary-card">
        <span class="git-sync-summary-icon" :class="`is-${status.tone}`">
          <component :is="statusIcon(status.tone)" aria-hidden="true" />
        </span>
        <div>
          <span>Status</span>
          <strong class="git-sync-summary-status" :class="`is-${status.tone}`">
            {{ status.label }}
          </strong>
          <small>{{ statusDescription }}</small>
        </div>
      </article>

      <article class="git-sync-summary-card">
        <span class="git-sync-summary-icon">
          <ClockIcon aria-hidden="true" />
        </span>
        <div>
          <span>Última sincronização</span>
          <strong>{{ lastSynchronizationLabel }}</strong>
          <small>{{ lastSynchronizationDetail }}</small>
        </div>
      </article>
    </section>

    <section
      class="git-sync-console-card"
      aria-labelledby="git-sync-console-title"
    >
      <header class="git-sync-console-header">
        <div class="git-sync-console-title">
          <CommandLineIcon aria-hidden="true" />
          <div>
            <h2 id="git-sync-console-title">Console de sincronização</h2>
            <p>
              Atualiza a main a partir do repositório principal e publica em
              origin.
            </p>
          </div>
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
        class="git-sync-terminal"
        role="log"
        aria-live="polite"
        aria-label="Etapas da sincronização da main"
      >
        <div class="git-sync-terminal-intro">
          <span class="git-sync-terminal-prompt">$</span>
          <span>sincronizar main</span>
          <small>fonte: {{ syncReference }}</small>
        </div>

        <ol class="git-sync-terminal-steps">
          <li
            v-for="step in consoleSteps"
            :key="step"
            :class="{
              'is-complete':
                Boolean(lastSynchronizationAt) && !synchronizationError,
              'is-running': busy,
            }"
          >
            <span class="git-sync-step-marker" aria-hidden="true"></span>
            <code>$ {{ step }}</code>
          </li>
        </ol>

        <p
          class="git-sync-terminal-result"
          :class="{
            'is-success':
              Boolean(lastSynchronizationAt) && !synchronizationError,
            'is-error': Boolean(synchronizationError),
            'is-running': busy || checking,
          }"
        >
          <ArrowPathIcon v-if="busy || checking" aria-hidden="true" />
          <ExclamationTriangleIcon
            v-else-if="synchronizationError"
            aria-hidden="true"
          />
          <CheckCircleIcon v-else aria-hidden="true" />
          {{ consoleResult }}
        </p>
      </div>

      <footer class="git-sync-console-actions">
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

        <button
          type="button"
          class="secondary-button git-sync-settings-button"
          :aria-expanded="settingsOpen"
          aria-controls="git-sync-settings"
          @click="settingsOpen = !settingsOpen"
        >
          <Cog6ToothIcon aria-hidden="true" />
          Configurações
          <ChevronDownIcon
            class="git-sync-settings-chevron"
            :class="{ 'is-open': settingsOpen }"
            aria-hidden="true"
          />
        </button>
      </footer>

      <div
        v-if="settingsOpen"
        id="git-sync-settings"
        class="git-sync-settings"
        aria-label="Configuração detectada da sincronização"
      >
        <div>
          <span>Fonte principal</span>
          <strong>{{ syncReference }}</strong>
        </div>
        <div>
          <span>Destino</span>
          <strong>origin/main</strong>
        </div>
        <div>
          <span>Estratégia</span>
          <strong>merge</strong>
        </div>
        <div>
          <span>Pré-condição</span>
          <strong>Árvore de trabalho limpa</strong>
        </div>
      </div>
    </section>

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
          <span>Branch em uso</span>
          <strong>
            <span>{{ currentBranchName }}</span>
            <span aria-hidden="true">←</span>
            <span>{{ currentBranchUpstream ?? 'sem upstream' }}</span>
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

    <div class="git-sync-support-grid">
      <section
        class="git-sync-support-card"
        aria-labelledby="git-sync-next-title"
      >
        <header>
          <CheckCircleIcon aria-hidden="true" />
          <div>
            <h3 id="git-sync-next-title">Próximos passos</h3>
            <p>O que manter em ordem antes de continuar o trabalho.</p>
          </div>
        </header>

        <ul>
          <li :class="{ 'is-ready': overview.clean }">
            <i aria-hidden="true"></i>
            <span
              >Manter a árvore de trabalho limpa antes da sincronização</span
            >
          </li>
          <li :class="{ 'is-ready': synchronized }">
            <i aria-hidden="true"></i>
            <span>Manter a main alinhada com o repositório principal</span>
          </li>
          <li :class="{ 'is-ready': hasOriginRemote }">
            <i aria-hidden="true"></i>
            <span>Publicar a main atualizada em origin/main</span>
          </li>
        </ul>
      </section>

      <section
        class="git-sync-support-card git-sync-tip-card"
        aria-labelledby="git-sync-tip-title"
      >
        <header>
          <InformationCircleIcon aria-hidden="true" />
          <div>
            <h3 id="git-sync-tip-title">Dicas</h3>
            <p>Como este fluxo escolhe a origem da main.</p>
          </div>
        </header>

        <p v-if="hasUpstreamRemote">
          O remote <strong>upstream</strong> está configurado. A sincronização
          busca <code>upstream/main</code>, integra na sua <code>main</code> e
          publica o resultado em <code>origin/main</code>.
        </p>
        <p v-else>
          Sem <strong>upstream</strong>, a sincronização usa
          <code>origin/main</code> como fonte e mantém sua
          <code>main</code> alinhada com o origin.
        </p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.git-sync-page {
  display: grid;
  align-content: start;
  min-width: 0;
  gap: 14px;
  padding: 16px 18px 24px;
}

.git-sync-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.git-sync-summary-card {
  display: flex;
  min-width: 0;
  min-height: 84px;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
}

.git-sync-summary-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
  color: var(--accent);
  background: var(--accent-soft);
}

.git-sync-summary-icon svg {
  width: 18px;
  height: 18px;
}

.git-sync-summary-icon.is-success {
  color: var(--success-text);
  background: var(--success-surface);
}

.git-sync-summary-icon.is-warning {
  color: var(--warning-text);
  background: var(--warning-surface);
}

.git-sync-summary-card > div:last-child {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.git-sync-summary-card span:not(.git-sync-summary-icon),
.git-sync-summary-card small {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-sync-summary-card > div > span:first-child {
  color: var(--text-dim);
  font-weight: var(--font-weight-strong);
}

.git-sync-summary-card strong {
  overflow: hidden;
  color: var(--text);
  font-size: 14px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-sync-summary-status.is-success {
  color: var(--success-text);
}

.git-sync-summary-status.is-warning {
  color: var(--warning-text);
}

.git-sync-summary-status.is-pending,
.git-sync-summary-status.is-loading {
  color: var(--accent);
}

.git-sync-console-card,
.git-sync-current-card,
.git-sync-support-card {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
}

.git-sync-console-header {
  display: flex;
  min-height: 58px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 11px 14px;
  border-bottom: 1px solid var(--border);
}

.git-sync-console-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.git-sync-console-title > svg {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  color: var(--accent);
}

.git-sync-console-title h2,
.git-sync-console-title p {
  margin: 0;
}

.git-sync-console-title h2 {
  color: var(--text);
  font-size: 13px;
  line-height: 1.3;
}

.git-sync-console-title p {
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 10px;
}

.git-sync-console-tools {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
}

.git-sync-console-state {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: var(--font-weight-strong);
}

.git-sync-console-state i {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--text-dim);
}

.git-sync-console-state.is-success {
  color: var(--success-text);
}

.git-sync-console-state.is-success i {
  background: var(--success-text);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--success-text) 14%, transparent);
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
  min-height: 28px;
  padding: 4px 9px;
  border: 1px solid #484f58;
  border-radius: var(--radius-sm);
  color: #c9d1d9;
  background: #21262d;
  font: inherit;
  font-size: 10px;
  cursor: pointer;
}

.git-sync-console-clear:hover:not(:disabled) {
  border-color: #8b949e;
  color: #fff;
}

.git-sync-console-clear:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.git-sync-terminal {
  min-height: 290px;
  padding: 18px 20px 20px;
  color: #c9d1d9;
  background: #0d1117;
  color-scheme: dark;
  font-family: var(--font-family-code);
}

.git-sync-terminal-intro {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #e6edf3;
  font-size: 12px;
}

.git-sync-terminal-intro small {
  margin-left: auto;
  color: #8b949e;
  font-family: var(--font-family-sans);
  font-size: 10px;
}

.git-sync-terminal-prompt {
  color: #58a6ff;
  font-weight: 800;
}

.git-sync-terminal-steps {
  display: grid;
  gap: 14px;
  margin: 22px 0 20px;
  padding: 0;
  list-style: none;
}

.git-sync-terminal-steps li {
  display: grid;
  grid-template-columns: 9px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  color: #8b949e;
}

.git-sync-step-marker {
  width: 7px;
  height: 7px;
  border: 1px solid #6e7681;
  border-radius: 999px;
}

.git-sync-terminal-steps code {
  color: inherit;
  font: inherit;
  font-size: 12px;
}

.git-sync-terminal-steps li.is-complete {
  color: #c9d1d9;
}

.git-sync-terminal-steps li.is-complete .git-sync-step-marker {
  border-color: #3fb950;
  background: #3fb950;
}

.git-sync-terminal-steps li.is-running {
  color: #c9d1d9;
}

.git-sync-terminal-steps li.is-running .git-sync-step-marker {
  border-color: #58a6ff;
  background: #58a6ff;
  animation: git-sync-pulse 1s ease-in-out infinite alternate;
}

.git-sync-terminal-result {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding-top: 16px;
  border-top: 1px solid #21262d;
  color: #8b949e;
  font-family: var(--font-family-sans);
  font-size: 11px;
  line-height: 1.45;
}

.git-sync-terminal-result svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.git-sync-terminal-result.is-success {
  color: #3fb950;
}

.git-sync-terminal-result.is-error {
  color: #f85149;
}

.git-sync-terminal-result.is-running {
  color: #58a6ff;
}

.git-sync-terminal-result.is-running svg,
.git-sync-button.is-busy svg,
.git-sync-summary-icon.is-loading svg {
  animation: git-sync-spin 0.8s linear infinite;
}

.git-sync-console-actions {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto;
  gap: 10px;
  padding: 12px 14px;
  border-top: 1px solid var(--border);
}

.git-sync-button,
.git-sync-settings-button {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.git-sync-button svg,
.git-sync-settings-button svg {
  width: 16px;
  height: 16px;
}

.git-sync-primary-button {
  min-width: 220px;
}

.git-sync-settings-chevron {
  width: 14px !important;
  transition: transform 0.18s ease;
}

.git-sync-settings-chevron.is-open {
  transform: rotate(180deg);
}

.git-sync-settings {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  border-top: 1px solid var(--border);
  background: var(--border);
}

.git-sync-settings > div {
  display: grid;
  min-width: 0;
  gap: 4px;
  padding: 12px 14px;
  background: var(--surface-2);
}

.git-sync-settings span {
  color: var(--text-dim);
  font-size: 9px;
}

.git-sync-settings strong {
  overflow: hidden;
  color: var(--text);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-sync-current-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 14px;
}

.git-sync-current-copy {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 11px;
}

.git-sync-current-icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 9px;
  color: var(--accent);
  background: var(--accent-soft);
}

.git-sync-current-icon svg {
  width: 16px;
  height: 16px;
}

.git-sync-current-copy > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.git-sync-current-copy > div > span:first-child {
  color: var(--text-dim);
  font-size: 9px;
  font-weight: var(--font-weight-strong);
}

.git-sync-current-copy strong {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  color: var(--text);
  font-size: 12px;
}

.git-sync-current-copy small {
  color: var(--text-muted);
  font-size: 10px;
}

.git-sync-current-copy small.is-success {
  color: var(--success-text);
}

.git-sync-current-copy small.is-warning {
  color: var(--warning-text);
}

.git-sync-current-copy small.is-pending {
  color: var(--accent);
}

.git-sync-current-button {
  min-width: 140px;
}

.git-sync-support-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.78fr);
  gap: 14px;
}

.git-sync-support-card {
  padding: 14px;
}

.git-sync-support-card header {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

.git-sync-support-card header > svg {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  margin-top: 1px;
  color: var(--accent);
}

.git-sync-support-card h3,
.git-sync-support-card header p {
  margin: 0;
}

.git-sync-support-card h3 {
  color: var(--text);
  font-size: 12px;
}

.git-sync-support-card header p {
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 9px;
}

.git-sync-support-card ul {
  display: grid;
  gap: 9px;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}

.git-sync-support-card li {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 10px;
}

.git-sync-support-card li i {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border: 1px solid var(--text-dim);
  border-radius: 999px;
}

.git-sync-support-card li.is-ready i {
  border-color: var(--success-text);
  background: var(--success-text);
}

.git-sync-tip-card > p {
  margin: 15px 0 0;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.55;
}

.git-sync-tip-card strong {
  color: var(--text);
}

.git-sync-tip-card code {
  color: var(--accent);
  font-family: var(--font-family-code);
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
  .git-sync-terminal-result.is-running svg,
  .git-sync-button.is-busy svg,
  .git-sync-summary-icon.is-loading svg,
  .git-sync-console-state.is-loading i,
  .git-sync-terminal-steps li.is-running .git-sync-step-marker {
    animation: none;
  }

  .git-sync-settings-chevron {
    transition: none;
  }
}

@media (max-width: 960px) {
  .git-sync-summary,
  .git-sync-settings {
    grid-template-columns: 1fr;
  }

  .git-sync-support-grid {
    grid-template-columns: 1fr;
  }

  .git-sync-summary-card {
    min-height: 0;
  }
}

@media (max-width: 720px) {
  .git-sync-page {
    padding: 12px;
  }

  .git-sync-console-header,
  .git-sync-current-card {
    align-items: stretch;
    flex-direction: column;
  }

  .git-sync-console-tools {
    justify-content: space-between;
  }

  .git-sync-terminal {
    min-height: 240px;
    padding: 16px;
  }

  .git-sync-terminal-intro {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .git-sync-terminal-intro small {
    width: 100%;
    margin-left: 17px;
  }

  .git-sync-console-actions {
    grid-template-columns: 1fr;
  }

  .git-sync-primary-button,
  .git-sync-current-button {
    width: 100%;
  }
}
</style>
