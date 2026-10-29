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
import GitPrCreateForm from './git-pull-request/GitPrCreateForm.vue';
import GitPrForcePush from './git-pull-request/GitPrForcePush.vue';
import GitPrDialogs, {
  type PrDialog,
} from './git-pull-request/GitPrDialogs.vue';
import GitPrSummaryCard from './git-pull-request/GitPrSummaryCard.vue';
import UiButton from './ui/UiButton.vue';
import UiTag from './ui/UiTag.vue';

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

const dialog = ref<PrDialog | null>(null);
const editTitle = ref('');
const editDescription = ref('');
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
  () => canPreparePullRequest.value && supportsGh.value && !mutationBusy.value,
);

const canForcePush = computed(
  () =>
    Boolean(props.forcePushBranch) &&
    forcePushAcknowledged.value &&
    !props.busy &&
    !mutationBusy.value,
);

const branchState = computed<{
  label: string;
  tone: 'neutral' | 'accent' | 'warning' | 'success';
}>(() => {
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
    blockers.push(`O estado de merge no GitHub é "${cockpit.mergeableState}".`);
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

const canClose = computed(
  () => !mutationBusy.value && existingPullRequest.value?.provider === 'github',
);

const dialogCommandPreview = computed(() =>
  dialog.value === 'merge'
    ? mergeCommandPreview.value
    : dialog.value === 'close'
      ? closeCommandPreview.value
      : dialog.value === 'edit'
        ? editCommandPreview.value
        : '',
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

function startEdit(): void {
  if (
    !existingPullRequest.value ||
    existingPullRequest.value.provider !== 'github'
  )
    return;
  editTitle.value = existingPullRequest.value.title;
  editDescription.value = existingPullRequest.value.description ?? '';
  dialog.value = 'edit';
}

function closeDialog(): void {
  if (mutationBusy.value) return;
  dialog.value = null;
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
    if (lookup.existing && dialog.value !== 'edit') {
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
    dialog.value = null;
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
  dialog.value = null;
  scheduleExistingLookup();
});

watch(baseBranch, () => {
  generatedUrl.value = '';
  existingPullRequest.value = null;
  lookupUnavailable.value = false;
  dialog.value = null;
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
    dialog.value = null;
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
  if (!canClose.value || !existingPullRequest.value) return;
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
    dialog.value = null;
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
  if (!canMerge.value || !existingPullRequest.value) return;
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
    dialog.value = null;
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
  <section class="git-pr-page">
    <p v-if="errorMessage" class="project-error" role="alert">
      {{ errorMessage }}
    </p>
    <p v-if="mutationError" class="project-error" role="alert">
      {{ mutationError }}
    </p>

    <GitPrForcePush
      v-if="forcePushBranch"
      v-model:acknowledged="forcePushAcknowledged"
      :branch="forcePushBranch"
      :busy="busy || mutationBusy"
      :can-force-push="canForcePush"
      @force-push="emit('force-push')"
    />

    <template v-if="activeView === 'overview'">
      <header class="git-pr-bar">
        <div class="git-pr-bar-route" aria-label="Comparação das branches">
          <ShareIcon aria-hidden="true" />
          <code>{{ overview.branch ?? 'HEAD' }}</code>
          <span aria-hidden="true">→</span>
          <code>{{ destinationLabel }}</code>
          <UiTag :tone="branchState.tone">{{ branchState.label }}</UiTag>
        </div>
        <UiButton
          icon
          variant="ghost"
          aria-label="Atualizar status da Pull Request"
          title="Atualizar status"
          :disabled="checkingExisting || mutationBusy || !canLookup"
          @click="checkExistingPullRequest"
        >
          <ArrowPathIcon aria-hidden="true" />
        </UiButton>
      </header>

      <div v-if="!branchPublished" class="git-pr-note git-pr-note-warning">
        A branch atual ainda não possui upstream. Publique a branch antes de
        abrir a Pull Request.
      </div>

      <div v-else-if="checkingExisting" class="git-pr-note" aria-live="polite">
        Verificando se já existe uma Pull Request aberta para este destino…
      </div>

      <GitPrSummaryCard
        v-else-if="existingPullRequest"
        :pull-request="existingPullRequest"
        :target-remote="targetRemote"
        :mutation-busy="mutationBusy"
        :merge-blockers="mergeBlockers"
        @edit="startEdit"
        @merge="dialog = 'merge'"
        @close="dialog = 'close'"
      />

      <div
        v-else-if="lookupUnavailable"
        class="git-pr-note git-pr-note-warning"
      >
        <p>
          Não foi possível verificar automaticamente se já existe uma Pull
          Request aberta. Vale conferir o repositório antes de criar outra.
        </p>
        <UiButton variant="primary" @click="activeView = 'create'">
          Continuar para criação
        </UiButton>
      </div>

      <div v-else class="git-pr-note git-pr-empty">
        <strong>Nenhuma Pull Request aberta</strong>
        <p>
          A branch <code>{{ overview.branch ?? 'HEAD' }}</code> está pronta para
          comparação com <code>{{ destinationLabel }}</code
          >.
        </p>
        <UiButton
          variant="primary"
          class="git-pr-primary-action"
          @click="activeView = 'create'"
        >
          Criar Pull Request
        </UiButton>
      </div>
    </template>

    <template v-else>
      <header class="git-pr-create-head">
        <h2>Criar Pull Request</h2>
        <p>Revise o destino e as informações antes de publicar.</p>
      </header>

      <GitPrCreateForm
        v-model:target-remote="targetRemote"
        v-model:base-branch="baseBranch"
        v-model:title="title"
        v-model:description="description"
        v-model:draft="draft"
        :overview-branch="overview.branch ?? null"
        :source-reference="sourceReference"
        :available-targets="availableTargets"
        :base-branches="baseBranches"
        :provider="targetProvider"
        :opening="opening"
        :busy="busy"
        :mutation-busy="mutationBusy"
        :generated-url="generatedUrl"
        :checking-existing="checkingExisting"
        :existing-number="existingPullRequest?.number"
        :existing-url="existingPullRequest?.url"
        :can-open="canPreparePullRequest"
        :can-create-via-gh="canCreateViaGh"
        :command-preview="createCommandPreview"
        @open-external="openPullRequestExternally"
        @create="createPullRequestViaGh"
        @cancel="activeView = 'overview'"
      />
    </template>

    <GitPrDialogs
      v-model:title="editTitle"
      v-model:description="editDescription"
      v-model:merge-method="mergeMethod"
      :dialog="dialog"
      :pull-request="existingPullRequest"
      :busy="mutationBusy"
      :can-edit="canEdit"
      :can-merge="canMerge"
      :can-close="canClose"
      :merge-blockers="mergeBlockers"
      :command-preview="dialogCommandPreview"
      @cancel="closeDialog"
      @edit="editPullRequest"
      @merge="mergePullRequest"
      @close="closePullRequest"
    />
  </section>
</template>

<style scoped>
.git-pr-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.git-pr-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.git-pr-bar-route {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: var(--text-dim);
}

.git-pr-bar-route svg {
  width: 16px;
  height: 16px;
}

.git-pr-bar-route code {
  color: var(--text);
  font-family: var(--font-family-mono);
  font-size: 13px;
  font-weight: 600;
}

.git-pr-note {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 24px;
  border: 1px solid var(--border);
  border-radius: 14px;
  color: var(--text-muted);
  background: var(--surface-1);
  text-align: center;
}

.git-pr-note p {
  margin: 0;
}

.git-pr-note code {
  font-family: var(--font-family-mono);
}

.git-pr-note-warning {
  color: var(--warning-text);
  background: color-mix(in srgb, var(--warning-text) 8%, var(--surface-1));
}

.git-pr-empty strong {
  color: var(--text);
  font-size: 15px;
}

.git-pr-create-head h2 {
  margin: 0;
  font-size: 16px;
}

.git-pr-create-head p {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
