<script setup lang="ts">
import { ArrowPathIcon, ShareIcon } from '@heroicons/vue/24/outline';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import type {
  GitOpenPullRequest,
  GitPullRequestMergeMethod,
  GitPullRequestProvider,
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
const draft = ref(false);
const opening = ref(false);
const checkingExisting = ref(false);
const existingPullRequest = ref<GitOpenPullRequest | null>(null);
const lookupUnavailable = ref(false);
const errorMessage = ref('');
const generatedUrl = ref('');
let lookupGeneration = 0;
let lookupScheduled = false;

const showCreateConfirm = ref(false);
const showEditConfirm = ref(false);
const showCloseConfirm = ref(false);
const showMergeConfirm = ref(false);
const showEditForm = ref(false);
const editTitle = ref('');
const editDescription = ref('');
const closeConfirmText = ref('');
const mergeConfirmText = ref('');
const mergeMethod = ref<GitPullRequestMergeMethod>('squash');
const mutationBusy = ref(false);
const mutationError = ref('');
const forcePushAcknowledged = ref(false);

function parseProvider(remoteUrl: string): GitPullRequestProvider | null {
  const normalized = remoteUrl.toLowerCase();
  if (normalized.includes('github.com')) return 'github';
  if (normalized.includes('gitlab')) return 'gitlab';
  return null;
}

function repositoryLabel(remoteUrl: string): string {
  const trimmed = remoteUrl.trim().replace(/\.git$/, '');
  const scp = /^(?:[^@/]+@)?[^:/]+:(.+)$/.exec(trimmed);
  if (!trimmed.includes('://') && scp?.[1]) return scp[1].replace(/^\/+/, '');
  try {
    const url = new URL(trimmed);
    return url.pathname.replace(/^\/+/, '');
  } catch {
    return targetRemote.value;
  }
}

const targetRemoteInfo = computed(() =>
  props.workspace?.remotes.find((remote) => remote.name === targetRemote.value),
);

const targetProvider = computed<GitPullRequestProvider | null>(() => {
  const remote = targetRemoteInfo.value;
  return remote ? parseProvider(remote.fetchUrl || remote.pushUrl) : null;
});

const targetRepository = computed(() => {
  const remote = targetRemoteInfo.value;
  return remote
    ? repositoryLabel(remote.fetchUrl || remote.pushUrl)
    : targetRemote.value;
});

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
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right),
  );
});

const branchPublished = computed(() => Boolean(props.overview.upstream));
const sourceReference = computed(
  () => props.overview.upstream ?? props.overview.branch ?? 'HEAD',
);

const canLookup = computed(
  () =>
    !props.overview.detached &&
    Boolean(props.overview.branch) &&
    branchPublished.value &&
    availableTargets.value.includes(targetRemote.value) &&
    Boolean(baseBranch.value.trim()),
);

const canPreparePullRequest = computed(
  () =>
    !props.busy &&
    !opening.value &&
    !checkingExisting.value &&
    !existingPullRequest.value &&
    canLookup.value &&
    Boolean(title.value.trim()),
);

const supportsGh = computed(() => targetProvider.value === 'github');
const canCreateViaGh = computed(
  () =>
    canPreparePullRequest.value &&
    supportsGh.value &&
    !mutationBusy.value,
);

const canForcePush = computed(
  () =>
    Boolean(props.forcePushBranch) &&
    forcePushAcknowledged.value &&
    !props.busy &&
    !mutationBusy.value,
);

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

const destinationLabel = computed(
  () => `${targetRemote.value}/${baseBranch.value || 'main'}`,
);

const mergeBlockers = computed(() => {
  const pullRequest = existingPullRequest.value;
  if (!pullRequest || pullRequest.provider !== 'github') return [];
  const cockpit = pullRequest.cockpit;
  if (!cockpit || cockpit.remoteStatus !== 'available') {
    return ['Não foi possível verificar os requisitos de merge no GitHub.'];
  }

  const blockers: string[] = [];
  if (cockpit.draft) blockers.push('A Pull Request ainda está em rascunho.');
  if (pullRequest.ciStatus === 'failure')
    blockers.push('Existem checks ou status de CI falhando.');
  if (pullRequest.ciStatus === 'pending')
    blockers.push('Existem checks ou status de CI pendentes.');
  if (cockpit.reviewState === 'changes-requested')
    blockers.push('Há alterações solicitadas em review.');
  if ((pullRequest.unresolvedConversationsCount ?? 0) > 0) {
    blockers.push(
      `${pullRequest.unresolvedConversationsCount} conversa(s) de review ainda não resolvida(s).`,
    );
  }
  if (cockpit.mergeable === false)
    blockers.push('O GitHub informa que a Pull Request não é mergeável.');
  if (cockpit.mergeable === null)
    blockers.push('O GitHub ainda está calculando a mergeabilidade.');
  if (
    cockpit.mergeableState === 'blocked' ||
    cockpit.mergeableState === 'dirty' ||
    cockpit.mergeableState === 'behind'
  ) {
    blockers.push(
      `O estado de merge no GitHub é "${cockpit.mergeableState}".`,
    );
  }
  return Array.from(new Set(blockers));
});

const canMerge = computed(
  () =>
    existingPullRequest.value?.provider === 'github' &&
    mergeBlockers.value.length === 0 &&
    !mutationBusy.value,
);

const createCommandPreview = computed(() => {
  const parts = [
    'gh pr create',
    `--repo ${targetRepository.value}`,
    `--base ${baseBranch.value.trim() || 'main'}`,
    `--head ${sourceReference.value}`,
    `--title "${title.value.trim()}"`,
  ];
  if (draft.value) parts.push('--draft');
  return parts.join(' ');
});

const editCommandPreview = computed(() =>
  existingPullRequest.value
    ? `gh pr edit ${existingPullRequest.value.number} --repo ${targetRepository.value}`
    : '',
);

const closeCommandPreview = computed(() =>
  existingPullRequest.value
    ? `gh pr close ${existingPullRequest.value.number} --repo ${targetRepository.value}`
    : '',
);

const mergeCommandPreview = computed(() =>
  existingPullRequest.value
    ? `gh pr merge ${existingPullRequest.value.number} --repo ${targetRepository.value} --${mergeMethod.value}`
    : '',
);

const canConfirmClose = computed(
  () =>
    !mutationBusy.value &&
    existingPullRequest.value?.provider === 'github' &&
    closeConfirmText.value.trim() === String(existingPullRequest.value.number),
);

const canConfirmMerge = computed(
  () =>
    canMerge.value &&
    existingPullRequest.value !== null &&
    mergeConfirmText.value.trim() === String(existingPullRequest.value.number),
);

const canEdit = computed(() => {
  const pullRequest = existingPullRequest.value;
  if (!pullRequest || pullRequest.provider !== 'github' || mutationBusy.value)
    return false;
  const nextTitle = editTitle.value.trim();
  return (
    nextTitle.length > 0 &&
    (nextTitle !== pullRequest.title ||
      editDescription.value !== (pullRequest.description ?? ''))
  );
});

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

function cancelEditConfirmation() {
  showEditConfirm.value = false;
}

function startEdit(): void {
  if (!existingPullRequest.value || existingPullRequest.value.provider !== 'github')
    return;
  editTitle.value = existingPullRequest.value.title;
  editDescription.value = existingPullRequest.value.description ?? '';
  showEditForm.value = true;
  showEditConfirm.value = false;
}

function cancelEdit(): void {
  showEditForm.value = false;
  showEditConfirm.value = false;
}

function defaultBase(): string {
  const configured = targetRemoteInfo.value?.defaultBranch;
  if (configured && baseBranches.value.includes(configured)) return configured;
  return (
    baseBranches.value.find((branch) => branch === 'main') ??
    baseBranches.value.find((branch) => branch === 'master') ??
    baseBranches.value.find((branch) => branch === 'develop') ??
    baseBranches.value[0] ??
    configured ??
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
    // A navegação ainda é segura no novo contexto.
  }
  return popup;
}

function navigateExternal(popup: Window | null, url: string): boolean {
  if (popup && !popup.closed) {
    try {
      popup.location.href = url;
      return true;
    } catch {
      // Cai no link explícito abaixo.
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
    // Sem ação.
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
    if (lookup.existing && !showEditForm.value) {
      editTitle.value = lookup.existing.title;
      editDescription.value = lookup.existing.description ?? '';
    }
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
    draft.value = false;
    generatedUrl.value = '';
    errorMessage.value = '';
    existingPullRequest.value = null;
    lookupUnavailable.value = false;
    showCreateConfirm.value = false;
    showEditConfirm.value = false;
    showCloseConfirm.value = false;
    showMergeConfirm.value = false;
    showEditForm.value = false;
    closeConfirmText.value = '';
    mergeConfirmText.value = '';
    mutationError.value = '';
    scheduleExistingLookup();
  },
  { immediate: true },
);

watch(targetRemote, () => {
  baseBranch.value = defaultBase();
  draft.value = false;
  generatedUrl.value = '';
  existingPullRequest.value = null;
  lookupUnavailable.value = false;
  showCreateConfirm.value = false;
  showEditForm.value = false;
  scheduleExistingLookup();
});

watch(baseBranch, () => {
  generatedUrl.value = '';
  existingPullRequest.value = null;
  lookupUnavailable.value = false;
  showCreateConfirm.value = false;
  showEditForm.value = false;
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

async function openPullRequestExternally(): Promise<void> {
  if (!canPreparePullRequest.value) return;

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
      draft: draft.value,
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

async function editPullRequest(): Promise<void> {
  if (!canEdit.value || !existingPullRequest.value) return;
  mutationBusy.value = true;
  mutationError.value = '';
  try {
    const input = {
      targetRemote: targetRemote.value,
      number: existingPullRequest.value.number,
      title: editTitle.value.trim(),
      description: editDescription.value,
    };
    const confirmation = await prepareProjectGitPullRequestAction(
      props.projectId,
      'pull-request-edit',
      input,
    );
    await runProjectGitPullRequestAction(
      props.projectId,
      'pull-request-edit',
      input,
      confirmation.token,
    );
    showEditConfirm.value = false;
    showEditForm.value = false;
    await checkExistingPullRequest();
  } catch (error) {
    mutationError.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível editar a Pull Request.';
  } finally {
    mutationBusy.value = false;
  }
}

async function closePullRequest(): Promise<void> {
  if (!canConfirmClose.value || !existingPullRequest.value) return;
  mutationBusy.value = true;
  mutationError.value = '';
  try {
    const input = {
      targetRemote: targetRemote.value,
      number: existingPullRequest.value.number,
    };
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
      targetRemote: targetRemote.value,
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

    <section class="git-pr-workspace">
      <div
        id="git-pr-overview-panel"
        v-show="activeView === 'overview'"
        class="git-pr-overview"
      >
        <header class="git-pr-overview-heading">
          <div class="git-pr-overview-meta">
            <div class="git-pr-current-branch">
              <ShareIcon aria-hidden="true" />
              <span>Branch atual</span>
              <strong>{{ overview.branch ?? 'HEAD' }}</strong>
              <small class="git-pr-state" :class="`is-${branchState.tone}`">
                {{ branchState.label }}
              </small>
            </div>
            <button
              type="button"
              class="git-pr-refresh"
              :disabled="checkingExisting || mutationBusy || !canLookup"
              aria-label="Atualizar status da Pull Request"
              title="Atualizar status"
              @click="checkExistingPullRequest"
            >
              <ArrowPathIcon aria-hidden="true" />
            </button>
          </div>
        </header>

        <ProjectGitPullRequestStatus
          :branch-published="branchPublished"
          :checking-existing="checkingExisting"
          :existing-pull-request="existingPullRequest"
          :lookup-unavailable="lookupUnavailable"
          :target-remote="targetRemote"
          :mutation-busy="mutationBusy"
          :merge-blockers="mergeBlockers"
          @edit="startEdit"
          @toggle-merge="showMergeConfirm = !showMergeConfirm"
          @toggle-close="showCloseConfirm = !showCloseConfirm"
        />

        <form
          v-if="showEditForm && existingPullRequest?.provider === 'github'"
          class="git-pr-edit-form"
          @submit.prevent="showEditConfirm = true"
        >
          <header>
            <strong>Editar PR #{{ existingPullRequest.number }}</strong>
            <small>{{ targetRepository }}</small>
          </header>
          <label>
            <span>Título</span>
            <input
              v-model="editTitle"
              maxlength="256"
              :disabled="mutationBusy"
            />
          </label>
          <label>
            <span>Descrição</span>
            <textarea
              v-model="editDescription"
              maxlength="20000"
              :disabled="mutationBusy"
            />
          </label>
          <div class="git-pr-edit-actions">
            <button type="button" :disabled="mutationBusy" @click="cancelEdit">
              Cancelar
            </button>
            <button type="submit" :disabled="!canEdit">Salvar alterações</button>
          </div>
        </form>

        <div
          v-if="
            branchPublished &&
            !checkingExisting &&
            !existingPullRequest &&
            !lookupUnavailable
          "
          class="git-pr-empty"
        >
          <div class="git-pr-empty-icon" aria-hidden="true">
            <ShareIcon />
          </div>
          <strong>Nenhuma Pull Request aberta</strong>
          <p>A branch está pronta para comparação.</p>

          <div class="git-pr-route" aria-label="Comparação das branches">
            <div>
              <strong>{{ overview.branch ?? 'HEAD' }}</strong>
              <small>{{ sourceReference }}</small>
            </div>
            <span aria-hidden="true">→</span>
            <div>
              <strong>{{ destinationLabel }}</strong>
              <small>Branch base</small>
            </div>
          </div>

          <button
            type="button"
            class="git-pr-primary-action"
            @click="activeView = 'create'"
          >
            Criar Pull Request
          </button>
        </div>

        <button
          v-if="lookupUnavailable && branchPublished"
          type="button"
          class="git-pr-continue-action"
          @click="activeView = 'create'"
        >
          Continuar para criação
        </button>
      </div>

      <div
        id="git-pr-create-panel"
        v-show="activeView === 'create'"
        class="git-pr-create-view"
      >
        <header class="git-pr-create-heading">
          <h2>Criar Pull Request</h2>
          <p>Revise o destino e as informações antes de publicar.</p>
        </header>

        <ProjectGitPullRequestForm
          :overview-branch="overview.branch ?? null"
          :source-reference="sourceReference"
          :available-targets="availableTargets"
          :base-branches="baseBranches"
          :target-remote="targetRemote"
          :base-branch="baseBranch"
          :title="title"
          :description="description"
          :draft="draft"
          :provider="targetProvider"
          :opening="opening"
          :busy="busy"
          :force-push-branch="forcePushBranch"
          :force-push-acknowledged="forcePushAcknowledged"
          :mutation-busy="mutationBusy"
          :can-force-push="canForcePush"
          :existing-number="existingPullRequest?.number"
          :existing-url="existingPullRequest?.url"
          :generated-url="generatedUrl"
          :checking-existing="checkingExisting"
          :can-open="canPreparePullRequest"
          :can-create-via-gh="canCreateViaGh"
          :existing-pull-request="Boolean(existingPullRequest)"
          @update:target-remote="targetRemote = $event"
          @update:base-branch="baseBranch = $event"
          @update:title="title = $event"
          @update:description="description = $event"
          @update:draft="draft = $event"
          @update:force-push-acknowledged="forcePushAcknowledged = $event"
          @force-push="emit('force-push')"
          @open-external="openPullRequestExternally"
          @cancel="activeView = 'overview'"
          @toggle-create="showCreateConfirm = !showCreateConfirm"
        />
      </div>
    </section>

    <ProjectGitPullRequestConfirmations
      :show-merge="showMergeConfirm"
      :show-close="showCloseConfirm"
      :show-create="showCreateConfirm"
      :show-edit="showEditConfirm"
      :existing-pull-request="existingPullRequest"
      :merge-command-preview="mergeCommandPreview"
      :close-command-preview="closeCommandPreview"
      :create-command-preview="createCommandPreview"
      :edit-command-preview="editCommandPreview"
      :merge-method="mergeMethod"
      :merge-confirm-text="mergeConfirmText"
      :close-confirm-text="closeConfirmText"
      :mutation-busy="mutationBusy"
      :can-confirm-merge="canConfirmMerge"
      :can-confirm-close="canConfirmClose"
      :can-create="canCreateViaGh"
      :can-edit="canEdit"
      :merge-blockers="mergeBlockers"
      @update:merge-method="mergeMethod = $event"
      @update:merge-confirm-text="mergeConfirmText = $event"
      @update:close-confirm-text="closeConfirmText = $event"
      @cancel-merge="cancelMergeConfirmation"
      @cancel-close="cancelCloseConfirmation"
      @cancel-create="cancelCreateConfirmation"
      @cancel-edit="cancelEditConfirmation"
      @merge="mergePullRequest"
      @close="closePullRequest"
      @create="createPullRequestViaGh"
      @edit="editPullRequest"
    />
  </section>
</template>

<style src="./ProjectGitPullRequestPage.css"></style>

<style scoped>
.git-pr-page {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: calc(100vh - var(--app-topbar-height, 72px));
  flex-direction: column;
  gap: 0;
  padding: 0;
  background: var(--surface-1);
}

.git-pr-page > .project-error {
  flex: 0 0 auto;
  margin: 0;
  border-radius: 0;
}

.git-pr-workspace {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
}

.git-pr-overview,
.git-pr-create-view {
  width: 100%;
  min-width: 0;
  padding: 14px;
}

.git-pr-overview {
  display: grid;
  align-content: start;
  gap: 12px;
}

.git-pr-create-view {
  display: grid;
  align-content: start;
  gap: 14px;
  overflow-y: auto;
}

.git-pr-overview-heading,
.git-pr-overview-meta,
.git-pr-current-branch {
  display: flex;
  align-items: center;
}

.git-pr-overview-heading {
  min-height: 34px;
  justify-content: space-between;
}

.git-pr-overview-meta {
  width: 100%;
  justify-content: space-between;
  gap: 12px;
}

.git-pr-current-branch {
  min-width: 0;
  gap: 8px;
}

.git-pr-current-branch > svg {
  width: 16px;
  height: 16px;
  flex: none;
  color: var(--text-dim);
}

.git-pr-current-branch > span {
  color: var(--text-muted);
  font-size: 10px;
}

.git-pr-current-branch > strong {
  overflow: hidden;
  color: var(--text);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-pr-state {
  flex: none;
  padding: 3px 7px;
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: 9px;
  font-weight: 700;
}

.git-pr-state.is-success {
  color: var(--success-text);
  background: var(--success-surface);
}

.git-pr-state.is-warning {
  color: var(--warning-text);
  background: var(--warning-surface);
}

.git-pr-state.is-accent {
  color: var(--accent);
  background: var(--accent-soft);
}

.git-pr-refresh {
  display: inline-grid;
  width: 30px;
  height: 30px;
  flex: none;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: transparent;
}

.git-pr-refresh svg {
  width: 14px;
  height: 14px;
}

.git-pr-empty {
  display: grid;
  min-height: 330px;
  place-items: center;
  align-content: center;
  gap: 8px;
  text-align: center;
}

.git-pr-empty-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  margin-bottom: 2px;
  border-radius: 50%;
  color: var(--accent);
  background: var(--accent-soft);
}

.git-pr-empty-icon svg {
  width: 18px;
  height: 18px;
}

.git-pr-empty > strong {
  color: var(--text);
  font-size: 13px;
}

.git-pr-empty > p,
.git-pr-empty-hint,
.git-pr-create-heading p {
  margin: 0;
  color: var(--text-muted);
  font-size: 10px;
}

.git-pr-route {
  display: grid;
  width: min(100%, 560px);
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  margin: 12px 0 4px;
  padding: 10px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  text-align: left;
}

.git-pr-route > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.git-pr-route strong,
.git-pr-route small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-pr-route strong {
  color: var(--text);
  font-size: 10px;
}

.git-pr-route small {
  color: var(--text-dim);
  font-size: 9px;
}

.git-pr-route > span {
  color: var(--accent);
}

.git-pr-primary-action,
.git-pr-continue-action {
  min-height: 34px;
  margin-top: 6px;
  padding: 0 12px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  color: #fff;
  background: var(--accent);
  font: inherit;
  font-size: 10px;
  font-weight: 800;
}

.git-pr-continue-action {
  justify-self: start;
}

.git-pr-create-heading {
  display: grid;
  gap: 3px;
}

.git-pr-create-heading h2 {
  margin: 0;
  color: var(--text);
  font-size: 13px;
}

.git-pr-edit-form {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  background: var(--surface-2);
}

.git-pr-edit-form header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.git-pr-edit-form header strong {
  color: var(--text);
  font-size: 11px;
}

.git-pr-edit-form header small {
  color: var(--text-dim);
  font-size: 9px;
}

.git-pr-edit-form label {
  display: grid;
  gap: 5px;
}

.git-pr-edit-form label > span {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
}

.git-pr-edit-form input,
.git-pr-edit-form textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border);
  background: var(--surface-1);
  color: var(--text);
  padding: 9px 10px;
  font: inherit;
}

.git-pr-edit-form textarea {
  min-height: 100px;
  resize: vertical;
}

.git-pr-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.git-pr-edit-actions button {
  min-height: 34px;
  padding: 0 11px;
  border: 1px solid var(--border);
  background: var(--surface-1);
  color: var(--text);
  font: inherit;
  font-size: 10px;
  font-weight: 700;
}

.git-pr-edit-actions button[type='submit'] {
  border-color: var(--accent);
  color: #fff;
  background: var(--accent);
}

.git-pr-edit-actions button:disabled {
  border-color: var(--border);
  color: var(--text-dim);
  background: var(--surface-2);
}

@media (max-width: 720px) {
  .git-pr-overview,
  .git-pr-create-view {
    padding: 10px;
  }

  .git-pr-current-branch {
    flex-wrap: wrap;
  }

  .git-pr-route {
    grid-template-columns: 1fr;
  }

  .git-pr-route > span {
    transform: rotate(90deg);
  }

  .git-pr-edit-actions {
    display: grid;
  }

  .git-pr-edit-actions button {
    width: 100%;
  }
}
</style>
