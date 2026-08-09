<script setup lang="ts">
import {
  ArrowTopRightOnSquareIcon,
  CodeBracketIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  ShieldExclamationIcon,
} from '@heroicons/vue/24/outline';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import type {
  AiRecommendedModelName,
  GitPullRequestAiReview,
  GitOpenPullRequest,
  GitPullRequestMergeMethod,
  ProjectAiStatus,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';
import { AI_RECOMMENDED_MODELS } from '@dev-dashboard/contracts';

import {
  composeProjectGitPullRequest,
  fetchProjectAiStatus,
  getProjectGitPullRequestStatus,
  prepareProjectGitPullRequestAction,
  runProjectGitPullRequestAction,
  reviewProjectGitPullRequest,
  streamProjectAiModelPull,
  type GitPullRequestTargetRemote,
} from '../api';

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
const aiStatus = ref<ProjectAiStatus | null>(null);
const loadingAiStatus = ref(false);
const reviewModel = ref('');
const reviewing = ref(false);
const aiReview = ref<GitPullRequestAiReview | null>(null);
const aiReviewError = ref('');
const installingModel = ref<AiRecommendedModelName | null>(null);
const installationStatus = ref('');
const installationCompleted = ref<number | null>(null);
const installationTotal = ref<number | null>(null);
const installationError = ref('');
const modelInstallerVisible = ref(false);
let lookupGeneration = 0;
let lookupScheduled = false;
let modelPullClose: (() => void) | undefined;

const showCreateConfirm = ref(false);
const showCloseConfirm = ref(false);
const showMergeConfirm = ref(false);
const closeConfirmText = ref('');
const mergeConfirmText = ref('');
const mergeMethod = ref<GitPullRequestMergeMethod>('squash');
const mutationBusy = ref(false);
const mutationError = ref('');
const showForcePush = ref(false);

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
const availableReviewModels = computed(() => aiStatus.value?.models ?? []);
const installableRecommendedModels = computed(() =>
  AI_RECOMMENDED_MODELS.filter(
    (recommendedModel) =>
      !availableReviewModels.value.some(
        (availableModel) => availableModel.name === recommendedModel.name,
      ),
  ),
);
const canShowModelInstaller = computed(
  () =>
    !loadingAiStatus.value &&
    Boolean(aiStatus.value?.available) &&
    installableRecommendedModels.value.length > 0,
);
const showRecommendedReviewModels = computed(
  () => modelInstallerVisible.value && canShowModelInstaller.value,
);
const canInstallRecommendedModel = computed(
  () => Boolean(aiStatus.value?.available) && !installingModel.value,
);
const canReview = computed(
  () =>
    canLookup.value &&
    !props.busy &&
    !opening.value &&
    !reviewing.value &&
    !loadingAiStatus.value &&
    Boolean(reviewModel.value),
);
const canForcePush = computed(
  () => Boolean(props.forcePushBranch) && !props.busy && !mutationBusy.value,
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

function clearAiReview(): void {
  aiReview.value = null;
  aiReviewError.value = '';
}

function reviewStorageKey(): string {
  return [
    'dev-dashboard:pr-ai-review',
    props.projectId,
    props.overview.branch ?? '',
    props.overview.latestCommit?.hash ?? '',
    targetRemote.value,
    baseBranch.value.trim(),
    reviewModel.value,
  ].join(':');
}

function restoreAiReview(): void {
  if (typeof sessionStorage === 'undefined' || !reviewModel.value) return;
  try {
    const saved = sessionStorage.getItem(reviewStorageKey());
    aiReview.value = saved
      ? (JSON.parse(saved) as GitPullRequestAiReview)
      : null;
  } catch {
    aiReview.value = null;
  }
}

function installationLabel(model: AiRecommendedModelName): string {
  if (installingModel.value !== model) return 'Instalar';
  if (
    installationCompleted.value !== null &&
    installationTotal.value !== null &&
    installationTotal.value > 0
  ) {
    const progress = Math.min(
      100,
      Math.round((installationCompleted.value / installationTotal.value) * 100),
    );
    return `${installationStatus.value} · ${progress}%`;
  }
  return installationStatus.value || 'Iniciando instalação…';
}

async function loadAiStatus(): Promise<void> {
  loadingAiStatus.value = true;
  try {
    const status = await fetchProjectAiStatus(props.projectId);
    aiStatus.value = status;
    if (!status.models.some((model) => model.name === reviewModel.value))
      reviewModel.value = status.models[0]?.name ?? '';
    restoreAiReview();
  } catch {
    aiStatus.value = {
      available: false,
      models: [],
      message: 'Não foi possível verificar o Ollama local para a revisão.',
    };
    reviewModel.value = '';
  } finally {
    loadingAiStatus.value = false;
  }
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
    clearAiReview();
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
  clearAiReview();
  restoreAiReview();
  scheduleExistingLookup();
});

watch(baseBranch, () => {
  generatedUrl.value = '';
  existingPullRequest.value = null;
  lookupUnavailable.value = false;
  showCreateConfirm.value = false;
  clearAiReview();
  restoreAiReview();
  scheduleExistingLookup();
});

watch(reviewModel, () => {
  clearAiReview();
  restoreAiReview();
});

watch(
  () => props.projectId,
  () => {
    clearAiReview();
    void loadAiStatus();
  },
  { immediate: true },
);

watch(
  () => props.forcePushBranch,
  (branch) => {
    showForcePush.value = Boolean(branch);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  lookupGeneration += 1;
  modelPullClose?.();
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

async function reviewChangesWithAi(): Promise<void> {
  if (!canReview.value) return;
  reviewing.value = true;
  aiReviewError.value = '';
  try {
    aiReview.value = await reviewProjectGitPullRequest(props.projectId, {
      targetRemote: targetRemote.value,
      baseBranch: baseBranch.value.trim(),
      model: reviewModel.value,
    });
    if (typeof sessionStorage !== 'undefined')
      sessionStorage.setItem(
        reviewStorageKey(),
        JSON.stringify(aiReview.value),
      );
  } catch (error) {
    aiReviewError.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível revisar as mudanças com a IA.';
  } finally {
    reviewing.value = false;
  }
}

async function installRecommendedModel(
  model: AiRecommendedModelName,
): Promise<void> {
  if (!canInstallRecommendedModel.value) return;
  installingModel.value = model;
  installationStatus.value = 'Iniciando instalação…';
  installationCompleted.value = null;
  installationTotal.value = null;
  installationError.value = '';
  let installed = false;
  const stream = streamProjectAiModelPull(props.projectId, model, (event) => {
    if (event.type === 'progress') {
      installationStatus.value = event.status;
      installationCompleted.value = event.completed ?? null;
      installationTotal.value = event.total ?? null;
    }
    if (event.type === 'done') installed = true;
    if (event.type === 'error') installationError.value = event.message;
  });
  modelPullClose = stream.close;

  try {
    await stream.done;
    if (installed) {
      await loadAiStatus();
      reviewModel.value = model;
    }
  } catch (error) {
    installationError.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível instalar o modelo pelo Ollama local.';
  } finally {
    if (installingModel.value === model) installingModel.value = null;
    modelPullClose = undefined;
  }
}

function cancelModelInstallation(): void {
  modelPullClose?.();
  modelPullClose = undefined;
  installingModel.value = null;
  installationStatus.value = '';
  installationCompleted.value = null;
  installationTotal.value = null;
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
  <section class="git-pr-card">
    <header class="git-pr-heading">
      <div>
        <span>Pull Request</span>
        <h3>Preparar Pull Request</h3>
        <p>
          Envie a sua branch para o origin e escolha se a Pull Request será
          aberta no origin ou no upstream.
        </p>
      </div>
      <CodeBracketIcon aria-hidden="true" />
    </header>

    <p v-if="errorMessage" class="project-error" role="alert">
      {{ errorMessage }}
    </p>
    <p v-if="mutationError" class="project-error" role="alert">
      {{ mutationError }}
    </p>

    <div v-if="!branchPublished" class="git-pr-warning">
      A branch atual ainda não possui upstream. Publique a branch antes de abrir
      a Pull Request.
    </div>

    <div
      v-else-if="checkingExisting"
      class="git-pr-checking"
      aria-live="polite"
    >
      Verificando se já existe uma Pull Request aberta para este destino…
    </div>

    <div
      v-else-if="existingPullRequest"
      class="git-pr-existing"
      aria-live="polite"
    >
      <div>
        <span>PR #{{ existingPullRequest.number }} já está aberta</span>
        <strong>{{ existingPullRequest.title }}</strong>
        <small>
          {{ existingPullRequest.sourceBranch }} → {{ targetRemote }}/{{
            existingPullRequest.baseBranch
          }}
        </small>
      </div>

      <div class="git-pr-gh-actions">
        <button
          type="button"
          :disabled="mutationBusy"
          @click="showMergeConfirm = !showMergeConfirm"
        >
          Mesclar com gh
        </button>
        <button
          type="button"
          class="danger-button"
          :disabled="mutationBusy"
          @click="showCloseConfirm = !showCloseConfirm"
        >
          Fechar com gh
        </button>
      </div>
    </div>

    <div v-else-if="lookupUnavailable" class="git-pr-lookup-note">
      Não foi possível verificar automaticamente se já existe uma Pull Request
      aberta. Você ainda pode continuar, mas vale conferir o repositório antes
      de criar outra.
    </div>

    <div v-if="showMergeConfirm && existingPullRequest" class="git-pr-confirm">
      <p>
        Isto executará <code>{{ mergeCommandPreview }}</code> — mescla a PR #{{
          existingPullRequest.number
        }}
        na branch base. Ação irreversível pelo dashboard.
      </p>
      <label>
        <span>Estratégia de merge</span>
        <select v-model="mergeMethod" :disabled="mutationBusy">
          <option value="squash">Squash</option>
          <option value="merge">Merge</option>
          <option value="rebase">Rebase</option>
        </select>
      </label>
      <label>
        <span>
          Digite o número da PR ({{ existingPullRequest.number }}) para
          confirmar
        </span>
        <input
          v-model="mergeConfirmText"
          type="text"
          :disabled="mutationBusy"
        />
      </label>
      <div class="git-pr-confirm-actions">
        <button
          type="button"
          @click="
            showMergeConfirm = false;
            mergeConfirmText = '';
          "
        >
          Cancelar
        </button>
        <button
          type="button"
          class="danger-button"
          :disabled="!canConfirmMerge"
          @click="mergePullRequest"
        >
          {{ mutationBusy ? 'Mesclando…' : 'Confirmar merge' }}
        </button>
      </div>
    </div>

    <div v-if="showCloseConfirm && existingPullRequest" class="git-pr-confirm">
      <p>
        Isto executará <code>{{ closeCommandPreview }}</code> — fecha a PR #{{
          existingPullRequest.number
        }}
        sem fazer merge.
      </p>
      <label>
        <span>
          Digite o número da PR ({{ existingPullRequest.number }}) para
          confirmar
        </span>
        <input
          v-model="closeConfirmText"
          type="text"
          :disabled="mutationBusy"
        />
      </label>
      <div class="git-pr-confirm-actions">
        <button
          type="button"
          @click="
            showCloseConfirm = false;
            closeConfirmText = '';
          "
        >
          Cancelar
        </button>
        <button
          type="button"
          class="danger-button"
          :disabled="!canConfirmClose"
          @click="closePullRequest"
        >
          {{ mutationBusy ? 'Fechando…' : 'Confirmar fechamento' }}
        </button>
      </div>
    </div>

    <form class="git-pr-form" @submit.prevent="openPullRequest">
      <div class="git-pr-grid">
        <label>
          <span>Branch de origem</span>
          <input
            :value="`origin/${overview.branch ?? 'HEAD'}`"
            type="text"
            readonly
          />
        </label>

        <label>
          <span>Destino do PR</span>
          <select v-model="targetRemote" :disabled="opening || busy">
            <option
              v-for="remote in availableTargets"
              :key="remote"
              :value="remote"
            >
              {{ remote }}
            </option>
          </select>
        </label>

        <label>
          <span>Branch base</span>
          <select v-model="baseBranch" :disabled="opening || busy">
            <option
              v-for="branch in baseBranches"
              :key="branch"
              :value="branch"
            >
              {{ branch }}
            </option>
            <option v-if="baseBranches.length === 0" value="main">main</option>
          </select>
        </label>
      </div>

      <label>
        <span>Título</span>
        <input
          v-model="title"
          maxlength="256"
          type="text"
          placeholder="Título da Pull Request"
          :disabled="opening || busy"
        />
      </label>

      <label>
        <span>Descrição</span>
        <textarea
          v-model="description"
          maxlength="20000"
          placeholder="Descreva o que muda nesta Pull Request"
          :disabled="opening || busy"
        />
      </label>

      <section class="git-pr-ai-review" aria-label="Revisão de código com IA">
        <div class="git-pr-ai-review-heading">
          <div>
            <span>Revisão com IA</span>
            <p>
              Revise o diff desta branch contra {{ targetRemote }}/{{
                baseBranch || 'main'
              }}
              antes de abrir a PR.
            </p>
          </div>
          <SparklesIcon aria-hidden="true" />
        </div>

        <div class="git-pr-ai-review-actions">
          <label v-if="availableReviewModels.length > 1">
            <span>Modelo</span>
            <select v-model="reviewModel" :disabled="reviewing">
              <option
                v-for="model in availableReviewModels"
                :key="model.name"
                :value="model.name"
              >
                {{ model.name }}
              </option>
            </select>
          </label>
          <p v-else class="git-pr-ai-review-model">
            {{
              loadingAiStatus
                ? 'Verificando Ollama local…'
                : (aiStatus?.message ?? 'Verificando Ollama local…')
            }}
          </p>
          <button
            type="button"
            :disabled="!canReview"
            @click="reviewChangesWithAi"
          >
            <SparklesIcon aria-hidden="true" />
            {{ reviewing ? 'Revisando mudanças…' : 'Revisar mudanças com IA' }}
          </button>
        </div>

        <button
          v-if="canShowModelInstaller"
          type="button"
          class="git-pr-ai-add-model"
          :aria-expanded="modelInstallerVisible"
          @click="modelInstallerVisible = !modelInstallerVisible"
        >
          {{
            modelInstallerVisible
              ? 'Ocultar modelos locais'
              : 'Adicionar modelo local'
          }}
        </button>

        <div
          v-if="showRecommendedReviewModels"
          class="git-pr-ai-recommendations"
        >
          <div>
            <strong>Modelos locais recomendados</strong>
            <p>Instale um deles e ele aparecerá aqui automaticamente.</p>
          </div>
          <ul>
            <li v-for="model in installableRecommendedModels" :key="model.name">
              <span>{{ model.label }}</span>
              <div>
                <strong>{{ model.name }}</strong>
                <small>{{ model.description }}</small>
              </div>
              <code>ollama pull {{ model.name }}</code>
              <button
                type="button"
                :disabled="
                  !canInstallRecommendedModel && installingModel !== model.name
                "
                @click="installRecommendedModel(model.name)"
              >
                {{ installationLabel(model.name) }}
              </button>
            </li>
          </ul>
          <button
            v-if="installingModel"
            type="button"
            class="git-pr-ai-install-cancel"
            @click="cancelModelInstallation"
          >
            Cancelar instalação
          </button>
        </div>

        <p v-if="installationError" class="project-error" role="alert">
          {{ installationError }}
        </p>

        <p v-if="aiReviewError" class="project-error" role="alert">
          {{ aiReviewError }}
        </p>

        <div v-if="aiReview" class="git-pr-ai-review-result" aria-live="polite">
          <div class="git-pr-ai-review-summary">
            <strong>Resultado da revisão</strong>
            <span>{{ aiReview.summary }}</span>
          </div>
          <p
            v-if="aiReview.findings.length === 0"
            class="git-pr-ai-review-empty"
          >
            Nenhum ponto relevante foi encontrado. Ainda revise a PR
            normalmente.
          </p>
          <ol v-else class="git-pr-ai-review-findings">
            <li
              v-for="finding in aiReview.findings"
              :key="`${finding.path}:${finding.line ?? 0}:${finding.title}`"
            >
              <span
                :class="['git-pr-ai-review-severity', `is-${finding.severity}`]"
              >
                {{ finding.severity }}
              </span>
              <strong>{{ finding.title }}</strong>
              <code
                >{{ finding.path
                }}<template v-if="finding.line"
                  >:{{ finding.line }}</template
                ></code
              >
              <p>{{ finding.explanation }}</p>
              <small>Recomendação: {{ finding.recommendation }}</small>
            </li>
          </ol>
          <small class="git-pr-ai-review-note">
            {{ aiReview.model }} ·
            {{ aiReview.diffTruncated ? 'diff parcial' : 'diff completo' }} ·
            revisão apenas consultiva
          </small>
        </div>
      </section>

      <section
        v-if="forcePushBranch"
        class="git-pr-advanced"
        aria-label="Ações avançadas da branch"
      >
        <button
          type="button"
          class="git-pr-advanced-toggle"
          :aria-expanded="showForcePush"
          :disabled="busy || mutationBusy"
          @click="showForcePush = !showForcePush"
        >
          <ShieldExclamationIcon aria-hidden="true" />
          Ações avançadas
        </button>

        <div v-if="showForcePush" class="git-pr-force-push">
          <ExclamationTriangleIcon aria-hidden="true" />
          <div>
            <strong>Substituir branch remota</strong>
            <p>
              Atualiza <code>origin/{{ forcePushBranch }}</code> com lease. Use
              apenas após reescrever o histórico (amend, rebase ou squash).
            </p>
          </div>
          <button
            type="button"
            :disabled="!canForcePush"
            @click="emit('force-push')"
          >
            Forçar atualização no origin
          </button>
        </div>
      </section>

      <div class="git-pr-footer">
        <p>
          O dashboard não armazena credenciais do GitHub/GitLab; ele abre a tela
          oficial de criação já preenchida.
        </p>
        <a
          v-if="existingPullRequest"
          class="git-pr-existing-action"
          :href="existingPullRequest.url"
          target="_blank"
          rel="noopener noreferrer"
        >
          Ver PR #{{ existingPullRequest.number }}
          <ArrowTopRightOnSquareIcon aria-hidden="true" />
        </a>
        <a
          v-else-if="generatedUrl"
          class="git-pr-fallback-link"
          :href="generatedUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir página da Pull Request
          <ArrowTopRightOnSquareIcon aria-hidden="true" />
        </a>
        <button v-else type="submit" :disabled="!canOpen">
          <ArrowTopRightOnSquareIcon aria-hidden="true" />
          {{
            checkingExisting
              ? 'Verificando PR…'
              : opening
                ? 'Preparando…'
                : 'Abrir Pull Request'
          }}
        </button>
        <button
          v-if="!existingPullRequest && !generatedUrl"
          type="button"
          :disabled="!canOpen || mutationBusy"
          @click="showCreateConfirm = !showCreateConfirm"
        >
          Criar direto com gh
        </button>
      </div>

      <div v-if="showCreateConfirm" class="git-pr-confirm">
        <p>
          Isto executará <code>{{ createCommandPreview }}</code> — cria a Pull
          Request diretamente no GitHub, sem abrir o navegador.
        </p>
        <div class="git-pr-confirm-actions">
          <button type="button" @click="showCreateConfirm = false">
            Cancelar
          </button>
          <button
            type="button"
            :disabled="!canCreateViaGh"
            @click="createPullRequestViaGh"
          >
            {{ mutationBusy ? 'Criando…' : 'Confirmar criação' }}
          </button>
        </div>
      </div>
    </form>
  </section>
</template>

<style scoped src="./ProjectGitPullRequestPage.css"></style>
