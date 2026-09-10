<script setup lang="ts">
import {
  ArrowPathIcon,
  ArrowRightIcon,
  DocumentTextIcon,
  ShareIcon,
} from '@heroicons/vue/24/outline';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import type {
  GitOpenPullRequest,
  GitPullRequestMergeMethod,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import {
  composeProjectGitPullRequest,
  getProjectGitPullRequestStatus,
  prepareProjectGitPullRequestAction,
  runProjectGitPullRequestAction,
  type GitPullRequestTargetRemote,
} from '../api';
import ProjectGitPullRequestConfirmations from './ProjectGitPullRequestConfirmations.vue';
import ProjectGitPullRequestForm from './ProjectGitPullRequestForm.vue';
import ProjectGitPullRequestStatus from './ProjectGitPullRequestStatus.vue';

const props = defineProps<{
  projectId: string;
  overview: ProjectGitOverview;
  workspace: ProjectGitWorkspace | null;
  busy: boolean;
  forcePushBranch: string | null;
}>();

const emit = defineEmits<{
  'force-push': [];
}>();

const activeView = ref<'overview' | 'create'>('overview');
const targetRemote = ref<GitPullRequestTargetRemote>('origin');
const baseBranch = ref('main');
const title = ref('');
const description = ref('');
const opening = ref(false);
const checkingExisting = ref(false);
const existingPullRequest = ref<GitOpenPullRequest | null>(null);
const lookupUnavailable = ref(false);
const errorMessage = ref('');
const generatedUrl = ref('');
let lookupGeneration = 0;
let lookupScheduled = false;

const showCreateConfirm = ref(false);
const showCloseConfirm = ref(false);
const showMergeConfirm = ref(false);
const closeConfirmText = ref('');
const mergeConfirmText = ref('');
const mergeMethod = ref<GitPullRequestMergeMethod>('squash');
const mutationBusy = ref(false);
const mutationError = ref('');
const forcePushAcknowledged = ref(false);

function cancelMergeConfirmation() {
  showMergeConfirm.value = false;
  mergeConfirmText.value = '';
}

function cancelCloseConfirmation() {
  showCloseConfirm.value = false;
  closeConfirmText.value = '';
}

function cancelCreateConfirmation() {
  showCreateConfirm.value = false;
}

const availableTargets = computed(() => {
  const names = new Set(
    (props.workspace?.remotes ?? [])
      .filter(
        (remote) => remote.name === 'origin' || remote.name === 'upstream',
      )
      .map((remote) => remote.name as GitPullRequestTargetRemote),
  );
  return (['origin', 'upstream'] as const).filter((name) => names.has(name));
});

const baseBranches = computed(() => {
  const values = (props.workspace?.branches ?? [])
    .filter(
      (branch) =>
        branch.kind === 'remote' &&
        branch.remote === targetRemote.value &&
        branch.shortName !== props.overview.branch,
    )
    .map((branch) => branch.shortName);
  return Array.from(new Set(values)).sort((left, right) => {
    const rank = (value: string): number => {
      if (value === 'main') return 0;
      if (value === 'master') return 1;
      if (value === 'develop') return 2;
      return 3;
    };
    return rank(left) - rank(right) || left.localeCompare(right);
  });
});

const branchPublished = computed(() => Boolean(props.overview.upstream));

const canLookup = computed(
  () =>
    !props.overview.detached &&
    Boolean(props.overview.branch) &&
    branchPublished.value &&
    availableTargets.value.includes(targetRemote.value) &&
    Boolean(baseBranch.value.trim()),
);

const canOpen = computed(
  () =>
    !props.busy &&
    !opening.value &&
    !checkingExisting.value &&
    !existingPullRequest.value &&
    canLookup.value &&
    Boolean(title.value.trim()),
);

const canCreateViaGh = computed(() => canOpen.value && !mutationBusy.value);
const canForcePush = computed(
  () =>
    Boolean(props.forcePushBranch) &&
    forcePushAcknowledged.value &&
    !props.busy &&
    !mutationBusy.value,
);

const changedFilesCount = computed(() => props.overview.files.length);
const commitCount = computed(() => props.overview.recentCommits.length);

const branchState = computed(() => {
  if (!branchPublished.value) {
    return { label: 'Não publicada', tone: 'neutral' };
  }
  if (props.overview.ahead > 0 && props.overview.behind > 0) {
    return { label: 'Divergente do remoto', tone: 'warning' };
  }
  if (props.overview.behind > 0) {
    return {
      label: `${props.overview.behind} ${props.overview.behind === 1 ? 'commit atrás' : 'commits atrás'}`,
      tone: 'warning',
    };
  }
  if (props.overview.ahead > 0) {
    return {
      label: `${props.overview.ahead} ${props.overview.ahead === 1 ? 'commit à frente' : 'commits à frente'}`,
      tone: 'accent',
    };
  }
  return { label: 'Em dia com o remoto', tone: 'success' };
});

const pullRequestState = computed(() => {
  if (checkingExisting.value) {
    return { value: 'Verificando…', detail: 'Consultando o destino selecionado' };
  }
  if (existingPullRequest.value) {
    return {
      value: `#${existingPullRequest.value.number}`,
      detail: existingPullRequest.value.title,
    };
  }
  if (lookupUnavailable.value) {
    return { value: 'Indisponível', detail: 'Não foi possível consultar o remoto' };
  }
  if (!branchPublished.value) {
    return { value: 'Não disponível', detail: 'Publique a branch antes de criar o PR' };
  }
  return { value: 'Nenhuma aberta', detail: 'A branch está pronta para comparação' };
});

const destinationLabel = computed(
  () => `${targetRemote.value}/${baseBranch.value || 'main'}`,
);

const createCommandPreview = computed(() => {
  const parts = [
    'gh pr create',
    `--base ${baseBranch.value.trim() || 'main'}`,
    `--head ${props.overview.upstream ?? props.overview.branch ?? 'HEAD'}`,
    `--title "${title.value.trim()}"`,
  ];
  return parts.join(' ');
});

const closeCommandPreview = computed(() =>
  existingPullRequest.value
    ? `gh pr close ${existingPullRequest.value.number}`
    : '',
);

const mergeCommandPreview = computed(() =>
  existingPullRequest.value
    ? `gh pr merge ${existingPullRequest.value.number} --${mergeMethod.value}`
    : '',
);

const canConfirmClose = computed(
  () =>
    !mutationBusy.value &&
    existingPullRequest.value !== null &&
    closeConfirmText.value.trim() === String(existingPullRequest.value.number),
);

const canConfirmMerge = computed(
  () =>
    !mutationBusy.value &&
    existingPullRequest.value !== null &&
    mergeConfirmText.value.trim() === String(existingPullRequest.value.number),
);

function defaultBase(): string {
  return (
    baseBranches.value.find((branch) => branch === 'main') ??
    baseBranches.value.find((branch) => branch === 'master') ??
    baseBranches.value.find((branch) => branch === 'develop') ??
    baseBranches.value[0] ??
    'main'
  );
}

function defaultDescription(): string {
  const subject =
    props.overview.latestCommit?.subject ??
    `Alterações da branch ${props.overview.branch ?? ''}`;
  return `## Resumo\n\n${subject}`;
}

function reserveExternalWindow(): Window | null {
  if (typeof window === 'undefined') return null;
  const popup = window.open('', '_blank');
  if (!popup) return null;
  try {
    popup.opener = null;
  } catch {
    // Alguns navegadores tornam opener somente leitura; a navegação ainda é segura no novo contexto.
  }
  return popup;
}

function navigateExternal(popup: Window | null, url: string): boolean {
  if (popup && !popup.closed) {
    try {
      popup.location.href = url;
      return true;
    } catch {
      // Cai no link explícito abaixo quando o navegador impedir a navegação da janela reservada.
    }
  }
  generatedUrl.value = url;
  errorMessage.value =
    'O navegador bloqueou a nova aba. Use o botão abaixo para continuar.';
  return false;
}

function closeReservedWindow(popup: Window | null): void {
  if (!popup || popup.closed) return;
  try {
    popup.close();
  } catch {
    // Sem ação: a mensagem de erro da operação é mais importante do que fechar a janela vazia.
  }
}

async function checkExistingPullRequest(): Promise<GitOpenPullRequest | null> {
  const generation = ++lookupGeneration;
  existingPullRequest.value = null;
  lookupUnavailable.value = false;

  if (!canLookup.value) {
    checkingExisting.value = false;
    return null;
  }

  checkingExisting.value = true;
  try {
    const lookup = await getProjectGitPullRequestStatus(props.projectId, {
      targetRemote: targetRemote.value,
      baseBranch: baseBranch.value.trim(),
    });
    if (generation !== lookupGeneration) return null;
    lookupUnavailable.value = !lookup.checked;
    existingPullRequest.value = lookup.existing ?? null;
    return existingPullRequest.value;
  } catch {
    if (generation !== lookupGeneration) return null;
    lookupUnavailable.value = true;
    existingPullRequest.value = null;
    return null;
  } finally {
    if (generation === lookupGeneration) checkingExisting.value = false;
  }
}

function scheduleExistingLookup(): void {
  if (lookupScheduled) return;
  lookupScheduled = true;
  queueMicrotask(() => {
    lookupScheduled = false;
    void checkExistingPullRequest();
  });
}

watch(
  () =>
    [props.overview.branch, props.overview.upstream, props.workspace] as const,
  () => {
    if (availableTargets.value.includes('upstream'))
      targetRemote.value = 'upstream';
    else if (availableTargets.value.includes('origin'))
      targetRemote.value = 'origin';
    baseBranch.value = defaultBase();
    title.value =
      props.overview.latestCommit?.subject ?? props.overview.branch ?? '';
    description.value = defaultDescription();
    generatedUrl.value = '';
    errorMessage.value = '';
    existingPullRequest.value = null;
    lookupUnavailable.value = false;
    showCreateConfirm.value = false;
    showCloseConfirm.value = false;
    showMergeConfirm.value = false;
    closeConfirmText.value = '';
    mergeConfirmText.value = '';
    mutationError.value = '';
    scheduleExistingLookup();
  },
  { immediate: true },
);

watch(targetRemote, () => {
  baseBranch.value = defaultBase();
  generatedUrl.value = '';
  existingPullRequest.value = null;
  lookupUnavailable.value = false;
  showCreateConfirm.value = false;
  scheduleExistingLookup();
});

watch(baseBranch, () => {
  generatedUrl.value = '';
  existingPullRequest.value = null;
  lookupUnavailable.value = false;
  showCreateConfirm.value = false;
  scheduleExistingLookup();
});

watch(
  () => props.forcePushBranch,
  () => {
    forcePushAcknowledged.value = false;
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  lookupGeneration += 1;
});

async function openPullRequest(): Promise<void> {
  if (!canOpen.value) return;

  // Reserva a aba ainda dentro do gesto do usuário. Assim a chamada assíncrona à API
  // não perde a permissão de popup e `noopener` não gera um falso positivo de bloqueio.
  const reservedWindow = reserveExternalWindow();
  opening.value = true;
  errorMessage.value = '';
  generatedUrl.value = '';

  try {
    const existing = await checkExistingPullRequest();
    if (existing) {
      navigateExternal(reservedWindow, existing.url);
      return;
    }

    const pullRequest = await composeProjectGitPullRequest(props.projectId, {
      targetRemote: targetRemote.value,
      baseBranch: baseBranch.value.trim(),
      title: title.value.trim(),
      description: description.value.trim(),
    });
    navigateExternal(reservedWindow, pullRequest.url);
  } catch (error) {
    closeReservedWindow(reservedWindow);
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível preparar a Pull Request.';
  } finally {
    opening.value = false;
  }
}

async function createPullRequestViaGh(): Promise<void> {
  if (!canCreateViaGh.value) return;
  mutationBusy.value = true;
  mutationError.value = '';
  try {
    const input = {
      targetRemote: targetRemote.value,
      baseBranch: baseBranch.value.trim(),
      title: title.value.trim(),
      description: description.value.trim(),
    };
    const confirmation = await prepareProjectGitPullRequestAction(
      props.projectId,
      'pull-request-create',
      input,
    );
    await runProjectGitPullRequestAction(
      props.projectId,
      'pull-request-create',
      input,
      confirmation.token,
    );
    showCreateConfirm.value = false;
    activeView.value = 'overview';
    await checkExistingPullRequest();
  } catch (error) {
    mutationError.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível criar a Pull Request pelo gh.';
  } finally {
    mutationBusy.value = false;
  }
}

async function closePullRequest(): Promise<void> {
  if (!canConfirmClose.value || !existingPullRequest.value) return;
  mutationBusy.value = true;
  mutationError.value = '';
  try {
    const input = { number: existingPullRequest.value.number };
    const confirmation = await prepareProjectGitPullRequestAction(
      props.projectId,
      'pull-request-close',
      input,
    );
    await runProjectGitPullRequestAction(
      props.projectId,
      'pull-request-close',
      input,
      confirmation.token,
    );
    showCloseConfirm.value = false;
    closeConfirmText.value = '';
    await checkExistingPullRequest();
  } catch (error) {
    mutationError.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível fechar a Pull Request.';
  } finally {
    mutationBusy.value = false;
  }
}

async function mergePullRequest(): Promise<void> {
  if (!canConfirmMerge.value || !existingPullRequest.value) return;
  mutationBusy.value = true;
  mutationError.value = '';
  try {
    const input = {
      number: existingPullRequest.value.number,
      mergeMethod: mergeMethod.value,
    };
    const confirmation = await prepareProjectGitPullRequestAction(
      props.projectId,
      'pull-request-merge',
      input,
    );
    await runProjectGitPullRequestAction(
      props.projectId,
      'pull-request-merge',
      input,
      confirmation.token,
    );
    showMergeConfirm.value = false;
    mergeConfirmText.value = '';
    await checkExistingPullRequest();
  } catch (error) {
    mutationError.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível mesclar a Pull Request.';
  } finally {
    mutationBusy.value = false;
  }
}
</script>

<template>
  <section class="git-pr-card git-pr-page">
    <p v-if="errorMessage" class="project-error" role="alert">
      {{ errorMessage }}
    </p>
    <p v-if="mutationError" class="project-error" role="alert">
      {{ mutationError }}
    </p>

    <section class="git-pr-summary" aria-label="Resumo da Pull Request">
      <article class="git-pr-summary-card">
        <div class="git-pr-summary-icon" aria-hidden="true">
          <ShareIcon />
        </div>
        <div>
          <span>Branch atual</span>
          <div class="git-pr-summary-value-line">
            <strong>{{ overview.branch ?? 'HEAD' }}</strong>
            <small class="git-pr-state" :class="`is-${branchState.tone}`">
              {{ branchState.label }}
            </small>
          </div>
          <small>{{ overview.upstream ?? 'Sem upstream configurado' }}</small>
        </div>
      </article>

      <article class="git-pr-summary-card">
        <div class="git-pr-summary-icon" aria-hidden="true">
          <DocumentTextIcon />
        </div>
        <div>
          <span>Pull Request atual</span>
          <strong>{{ pullRequestState.value }}</strong>
          <small>{{ pullRequestState.detail }}</small>
        </div>
      </article>

      <article class="git-pr-summary-card">
        <div class="git-pr-summary-icon" aria-hidden="true">
          <ArrowRightIcon />
        </div>
        <div>
          <span>Destino</span>
          <strong>{{ destinationLabel }}</strong>
          <small>Branch base selecionada para comparação</small>
        </div>
      </article>
    </section>

    <section class="git-pr-workspace">
      <nav class="git-pr-view-tabs" role="tablist" aria-label="Pull Request">
        <button
          id="git-pr-overview-tab"
          type="button"
          role="tab"
          :aria-selected="activeView === 'overview'"
          aria-controls="git-pr-overview-panel"
          :class="{ active: activeView === 'overview' }"
          @click="activeView = 'overview'"
        >
          Pull Request
        </button>
        <button
          id="git-pr-create-tab"
          type="button"
          role="tab"
          :aria-selected="activeView === 'create'"
          aria-controls="git-pr-create-panel"
          :class="{ active: activeView === 'create' }"
          @click="activeView = 'create'"
        >
          Criar Pull Request
        </button>
      </nav>

      <div
        id="git-pr-overview-panel"
        v-show="activeView === 'overview'"
        class="git-pr-overview"
        role="tabpanel"
        aria-labelledby="git-pr-overview-tab"
      >
        <header class="git-pr-overview-heading">
          <div>
            <h2>Pull Request da branch atual</h2>
            <p>
              Acompanhe o PR associado a {{ overview.branch ?? 'HEAD' }} e o
              estado real retornado pelo provedor.
            </p>
          </div>
          <button
            type="button"
            class="git-pr-refresh"
            :disabled="checkingExisting || mutationBusy || !canLookup"
            @click="checkExistingPullRequest"
          >
            <ArrowPathIcon aria-hidden="true" />
            {{ checkingExisting ? 'Atualizando…' : 'Atualizar status' }}
          </button>
        </header>

        <ProjectGitPullRequestStatus
          :branch-published="branchPublished"
          :checking-existing="checkingExisting"
          :existing-pull-request="existingPullRequest"
          :lookup-unavailable="lookupUnavailable"
          :target-remote="targetRemote"
          :mutation-busy="mutationBusy"
          @toggle-merge="showMergeConfirm = !showMergeConfirm"
          @toggle-close="showCloseConfirm = !showCloseConfirm"
        />

        <div
          v-if="
            branchPublished &&
            !checkingExisting &&
            !existingPullRequest &&
            !lookupUnavailable
          "
          class="git-pr-empty"
        >
          <div>
            <strong>Nenhuma Pull Request aberta para esta branch</strong>
            <p>
              Compare {{ overview.branch ?? 'HEAD' }} com
              {{ destinationLabel }} e prepare a próxima Pull Request.
            </p>
          </div>
          <button type="button" @click="activeView = 'create'">
            Criar Pull Request
          </button>
        </div>

        <section class="git-pr-overview-facts" aria-label="Contexto local">
          <div>
            <strong>{{ changedFilesCount }}</strong>
            <span>Arquivos alterados</span>
          </div>
          <div>
            <strong>{{ overview.ahead }}</strong>
            <span>Commits à frente</span>
          </div>
          <div>
            <strong>{{ overview.behind }}</strong>
            <span>Commits atrás</span>
          </div>
          <div>
            <strong>{{ commitCount }}</strong>
            <span>Commits carregados</span>
          </div>
        </section>
      </div>

      <div
        id="git-pr-create-panel"
        v-show="activeView === 'create'"
        class="git-pr-create-view"
        role="tabpanel"
        aria-labelledby="git-pr-create-tab"
      >
        <ProjectGitPullRequestForm
          :overview-branch="overview.branch ?? null"
          :available-targets="availableTargets"
          :base-branches="baseBranches"
          :target-remote="targetRemote"
          :base-branch="baseBranch"
          :title="title"
          :description="description"
          :opening="opening"
          :busy="busy"
          :force-push-branch="forcePushBranch"
          :force-push-acknowledged="forcePushAcknowledged"
          :changed-files-count="changedFilesCount"
          :commit-count="commitCount"
          :ahead="overview.ahead"
          :behind="overview.behind"
          :mutation-busy="mutationBusy"
          :can-force-push="canForcePush"
          :existing-number="existingPullRequest?.number"
          :existing-url="existingPullRequest?.url"
          :generated-url="generatedUrl"
          :checking-existing="checkingExisting"
          :can-open="canOpen"
          :existing-pull-request="Boolean(existingPullRequest)"
          @submit="openPullRequest"
          @update:target-remote="targetRemote = $event"
          @update:base-branch="baseBranch = $event"
          @update:title="title = $event"
          @update:description="description = $event"
          @update:force-push-acknowledged="forcePushAcknowledged = $event"
          @force-push="emit('force-push')"
          @open="openPullRequest"
          @toggle-create="showCreateConfirm = !showCreateConfirm"
        />
      </div>
    </section>

    <ProjectGitPullRequestConfirmations
      :show-merge="showMergeConfirm"
      :show-close="showCloseConfirm"
      :show-create="showCreateConfirm"
      :existing-pull-request="existingPullRequest"
      :merge-command-preview="mergeCommandPreview"
      :close-command-preview="closeCommandPreview"
      :create-command-preview="createCommandPreview"
      :merge-method="mergeMethod"
      :merge-confirm-text="mergeConfirmText"
      :close-confirm-text="closeConfirmText"
      :mutation-busy="mutationBusy"
      :can-confirm-merge="canConfirmMerge"
      :can-confirm-close="canConfirmClose"
      :can-create="canCreateViaGh"
      @update:merge-method="mergeMethod = $event"
      @update:merge-confirm-text="mergeConfirmText = $event"
      @update:close-confirm-text="closeConfirmText = $event"
      @cancel-merge="cancelMergeConfirmation"
      @cancel-close="cancelCloseConfirmation"
      @cancel-create="cancelCreateConfirmation"
      @merge="mergePullRequest"
      @close="closePullRequest"
      @create="createPullRequestViaGh"
    />
  </section>
</template>

<style src="./ProjectGitPullRequestPage.css"></style>

<style scoped>
.git-pr-page {
  gap: 18px;
}

.git-pr-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.git-pr-summary-card {
  display: flex;
  min-width: 0;
  min-height: 108px;
  align-items: center;
  gap: 16px;
  border: 1px solid var(--border);
  background: var(--surface-1);
  padding: 16px 18px;
}

.git-pr-summary-icon {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent);
}

.git-pr-summary-icon svg {
  width: 22px;
  height: 22px;
}

.git-pr-summary-card > div:last-child {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.git-pr-summary-card span,
.git-pr-summary-card small {
  overflow: hidden;
  color: var(--text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-pr-summary-card strong {
  overflow: hidden;
  color: var(--text);
  font-size: var(--font-xl);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-pr-summary-value-line {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.git-pr-state {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: var(--font-xs);
  font-weight: 700;
}

.git-pr-state.is-success {
  background: var(--success-surface);
  color: var(--success-text);
}

.git-pr-state.is-warning {
  background: var(--warning-surface);
  color: var(--warning-text);
}

.git-pr-state.is-accent {
  background: var(--accent-soft);
  color: var(--accent);
}

.git-pr-state.is-neutral {
  background: var(--surface-2);
  color: var(--text-muted);
}

.git-pr-workspace {
  display: grid;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--surface-1);
}

.git-pr-view-tabs {
  display: flex;
  min-width: 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.git-pr-view-tabs button {
  min-height: 48px;
  border: 0;
  border-right: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
  color: var(--text-muted);
  padding: 0 18px;
  font: inherit;
  font-weight: 700;
}

.git-pr-view-tabs button:hover {
  background: var(--surface-1);
  color: var(--text);
}

.git-pr-view-tabs button.active {
  box-shadow: inset 0 -2px 0 var(--accent);
  background: var(--surface-1);
  color: var(--accent);
}

.git-pr-overview,
.git-pr-create-view {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
}

.git-pr-overview-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.git-pr-overview-heading > div {
  display: grid;
  gap: 4px;
}

.git-pr-overview-heading h2,
.git-pr-overview-heading p,
.git-pr-empty p {
  margin: 0;
}

.git-pr-overview-heading h2 {
  color: var(--text);
  font-size: var(--font-lg);
}

.git-pr-overview-heading p,
.git-pr-empty p {
  color: var(--text-muted);
}

.git-pr-refresh,
.git-pr-empty button {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--border);
  background: var(--surface-1);
  color: var(--text);
  padding: 8px 12px;
  font: inherit;
  font-weight: 700;
}

.git-pr-refresh svg {
  width: 16px;
  height: 16px;
}

.git-pr-refresh:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}

.git-pr-refresh:disabled {
  color: var(--text-dim);
}

.git-pr-empty {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  border: 1px dashed var(--border);
  background: var(--surface-2);
  padding: 18px;
}

.git-pr-empty > div {
  display: grid;
  gap: 4px;
}

.git-pr-empty strong {
  color: var(--text);
}

.git-pr-empty button {
  flex: 0 0 auto;
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}

.git-pr-overview-facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--border);
  background: var(--surface-2);
}

.git-pr-overview-facts > div {
  display: grid;
  gap: 3px;
  border-right: 1px solid var(--border);
  padding: 14px 16px;
}

.git-pr-overview-facts > div:last-child {
  border-right: 0;
}

.git-pr-overview-facts strong {
  color: var(--text);
  font-size: var(--font-xl);
}

.git-pr-overview-facts span {
  color: var(--text-muted);
  font-size: var(--font-sm);
}

@media (max-width: 980px) {
  .git-pr-summary {
    grid-template-columns: 1fr;
  }

  .git-pr-overview-facts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .git-pr-overview-facts > div:nth-child(2) {
    border-right: 0;
  }

  .git-pr-overview-facts > div:nth-child(-n + 2) {
    border-bottom: 1px solid var(--border);
  }
}

@media (max-width: 720px) {
  .git-pr-view-tabs,
  .git-pr-overview-heading,
  .git-pr-empty {
    align-items: stretch;
    flex-direction: column;
  }

  .git-pr-view-tabs button {
    width: 100%;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .git-pr-overview-facts {
    grid-template-columns: 1fr;
  }

  .git-pr-overview-facts > div,
  .git-pr-overview-facts > div:nth-child(2) {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .git-pr-overview-facts > div:last-child {
    border-bottom: 0;
  }
}
</style>
