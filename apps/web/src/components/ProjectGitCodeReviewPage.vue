<script setup lang="ts">
import {
  ArrowPathIcon,
  CheckIcon,
  CheckCircleIcon,
  CodeBracketIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  DocumentMagnifyingGlassIcon,
  ExclamationCircleIcon,
  FunnelIcon,
  SparklesIcon,
  StopIcon,
} from '@heroicons/vue/24/outline';
import { computed, onUnmounted, ref, watch } from 'vue';

import type {
  GitPullRequestAiReview,
  GitPullRequestAiReviewExecution,
  GitPullRequestAiReviewFileExecution,
  GitPullRequestReviewFileDiff,
  GitPullRequestReviewFinding,
  GitPullRequestReviewFiles,
  ProjectAiStatus,
  ProjectFileContent,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import {
  cancelProjectGitPullRequestAiReview,
  fetchProjectFileContent,
  getLatestProjectGitPullRequestAiReview,
  getProjectGitPullRequestAiStatus,
  getProjectGitPullRequestReviewFileDiff,
  getProjectGitPullRequestReviewFiles,
  startProjectGitPullRequestAiReview,
  type GitPullRequestTargetRemote,
} from '../api';
import { findingKey } from '../utils/git-review-findings';
import GitCodeReviewFindingCard from './GitCodeReviewFindingCard.vue';
import GitFileDiffView from './GitFileDiffView.vue';
import GitFileFullView from './GitFileFullView.vue';

const props = defineProps<{
  projectId: string;
  overview: ProjectGitOverview;
  workspace: ProjectGitWorkspace | null;
}>();

const targetRemote = ref<GitPullRequestTargetRemote>('origin');
const baseBranch = ref('main');
const aiStatus = ref<ProjectAiStatus | null>(null);
const reviewModel = ref('');
const concurrency = ref<1 | 2>(1);
const selectedFiles = ref<string[]>([]);
const scopeOpen = ref(false);
const activityOpen = ref(false);
const reviewing = ref(false);
const cancelling = ref(false);
const review = ref<GitPullRequestAiReview | null>(null);
const execution = ref<GitPullRequestAiReviewExecution | null>(null);
const reviewFiles = ref<GitPullRequestReviewFiles | null>(null);
const loadingFiles = ref(false);
const errorMessage = ref('');
const activeReviewFile = ref<string | null>(null);
const reviewFileDiff = ref<GitPullRequestReviewFileDiff | null>(null);
const loadingReviewFileDiff = ref(false);
const reviewFileDiffError = ref('');
const fileViewMode = ref<'diff' | 'full'>('diff');
const fullFileContent = ref<ProjectFileContent | null>(null);
const loadingFullFile = ref(false);
const fullFileError = ref('');
const selectedFindingKeys = ref<string[]>([]);
const resolvedFindingKeys = ref<string[]>([]);
const ignoredFindingKeys = ref<string[]>([]);
let reviewFileDiffGeneration = 0;
let fullFileGeneration = 0;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

const availableTargets = computed(() => {
  const configured = new Set(
    (props.workspace?.remotes ?? [])
      .filter(
        (remote) => remote.name === 'origin' || remote.name === 'upstream',
      )
      .map((remote) => remote.name as GitPullRequestTargetRemote),
  );
  return (['origin', 'upstream'] as const).filter((remote) =>
    configured.has(remote),
  );
});

const baseBranches = computed(() =>
  Array.from(
    new Set(
      (props.workspace?.branches ?? [])
        .filter(
          (branch) =>
            branch.kind === 'remote' &&
            branch.remote === targetRemote.value &&
            branch.shortName !== props.overview.branch,
        )
        .map((branch) => branch.shortName),
    ),
  ).sort((left, right) => {
    const rank = (branch: string): number =>
      branch === 'main'
        ? 0
        : branch === 'master'
          ? 1
          : branch === 'develop'
            ? 2
            : 3;
    return rank(left) - rank(right) || left.localeCompare(right);
  }),
);

const selectedProviderReady = computed(() =>
  Boolean(aiStatus.value?.available),
);
const providerStatusMessage = computed(() => {
  const status = aiStatus.value;
  if (!status) return 'Verificando o Ollama localâ¦';
  if (!status.available)
    return `Ollama local Â· ${status.message || 'indisponÃ­vel.'}`;
  return 'Ollama local';
});

const isRunning = computed(
  () => reviewing.value || execution.value?.status === 'running',
);
const selectedCount = computed(() => selectedFiles.value.length);
const canReview = computed(
  () =>
    !isRunning.value &&
    selectedProviderReady.value &&
    Boolean(props.overview.branch) &&
    Boolean(baseBranch.value.trim()) &&
    Boolean(reviewModel.value) &&
    selectedCount.value > 0,
);
const reviewProgress = computed(() => execution.value?.completedFileCount ?? 0);
const reviewTotal = computed(
  () => execution.value?.files.length ?? selectedCount.value,
);
const reviewPercent = computed(() =>
  reviewTotal.value === 0
    ? 0
    : Math.round((reviewProgress.value / reviewTotal.value) * 100),
);
const currentFiles = computed(() => execution.value?.currentFilePaths ?? []);
const failedFilePaths = computed(
  () => execution.value?.failedFiles.map((failure) => failure.path) ?? [],
);
const reviewFindings = computed(
  () =>
    review.value?.findings.filter(
      (finding) => !ignoredFindingKeys.value.includes(findingKey(finding)),
    ) ?? [],
);
const pendingFindingCount = computed(
  () =>
    reviewFindings.value.filter(
      (finding) => !resolvedFindingKeys.value.includes(findingKey(finding)),
    ).length,
);
const groupedReviewFindings = computed(() => {
  const groups = new Map<string, GitPullRequestReviewFinding[]>();
  for (const finding of reviewFindings.value) {
    const current = groups.get(finding.path) ?? [];
    current.push(finding);
    groups.set(finding.path, current);
  }
  return [...groups.entries()].map(([path, findings]) => ({ path, findings }));
});
const activeFindings = computed(() =>
  activeReviewFile.value
    ? (groupedReviewFindings.value.find(
        (group) => group.path === activeReviewFile.value,
      )?.findings ?? [])
    : [],
);
/**
 * Enquanto o diff do arquivo nÃ£o estiver disponÃ­vel (carregando ou com erro),
 * todos os apontamentos aparecem na lista geral â sÃ³ migram para o corpo do
 * diff, inline por linha, depois que ele carrega com sucesso.
 */
const positionedFindings = computed(() =>
  reviewFileDiff.value
    ? activeFindings.value.filter((finding) => finding.line != null)
    : [],
);
const generalFindings = computed(() =>
  reviewFileDiff.value
    ? activeFindings.value.filter((finding) => finding.line == null)
    : activeFindings.value,
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

function isCodeFile(path: string): boolean {
  return /\.(?:[cm]?[jt]sx?|vue|css|s[ac]ss|less|html|json)$/i.test(path);
}

function formatElapsed(startedAt?: string, finishedAt?: string): string {
  if (!startedAt) return 'â';
  const elapsed = Math.max(
    0,
    new Date(finishedAt ?? new Date()).getTime() -
      new Date(startedAt).getTime(),
  );
  const seconds = Math.floor(elapsed / 1_000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function fileStatusLabel(file: GitPullRequestAiReviewFileExecution): string {
  const labels = {
    queued: 'Na fila',
    running: 'Em anÃ¡lise',
    completed: 'ConcluÃ­do',
    failed: 'Falhou',
    cancelled: 'Cancelado',
  } as const;
  return labels[file.status];
}

function providerLabel(
  _provider: GitPullRequestAiReviewExecution['provider'],
): string {
  return 'Ollama local';
}

function executionModeLabel(
  mode: GitPullRequestAiReviewExecution['mode'],
): string {
  return mode === 'complete' ? 'Completo' : 'RÃ¡pido';
}

function isFindingResolved(finding: GitPullRequestReviewFinding): boolean {
  return resolvedFindingKeys.value.includes(findingKey(finding));
}

function isFindingSelected(finding: GitPullRequestReviewFinding): boolean {
  return selectedFindingKeys.value.includes(findingKey(finding));
}

function toggleFindingSelection(finding: GitPullRequestReviewFinding): void {
  const key = findingKey(finding);
  selectedFindingKeys.value = isFindingSelected(finding)
    ? selectedFindingKeys.value.filter((candidate) => candidate !== key)
    : [...selectedFindingKeys.value, key];
}

function markFindingResolved(finding: GitPullRequestReviewFinding): void {
  const key = findingKey(finding);
  if (!resolvedFindingKeys.value.includes(key))
    resolvedFindingKeys.value = [...resolvedFindingKeys.value, key];
  selectedFindingKeys.value = selectedFindingKeys.value.filter(
    (candidate) => candidate !== key,
  );
}

function ignoreFinding(finding: GitPullRequestReviewFinding): void {
  const key = findingKey(finding);
  ignoredFindingKeys.value = [...ignoredFindingKeys.value, key];
  selectedFindingKeys.value = selectedFindingKeys.value.filter(
    (candidate) => candidate !== key,
  );
}

function markSelectedFindingsResolved(): void {
  resolvedFindingKeys.value = Array.from(
    new Set([...resolvedFindingKeys.value, ...selectedFindingKeys.value]),
  );
  selectedFindingKeys.value = [];
}

async function openReviewFile(path: string): Promise<void> {
  if (!review.value) return;
  activeReviewFile.value = path;
  reviewFileDiff.value = null;
  reviewFileDiffError.value = '';
  fileViewMode.value = 'diff';
  fullFileContent.value = null;
  fullFileError.value = '';
  ++fullFileGeneration;
  const generation = ++reviewFileDiffGeneration;
  loadingReviewFileDiff.value = true;
  try {
    const fileDiff = await getProjectGitPullRequestReviewFileDiff(
      props.projectId,
      {
        targetRemote: review.value.targetRemote,
        baseBranch: review.value.baseBranch,
        path,
      },
    );
    if (generation === reviewFileDiffGeneration)
      reviewFileDiff.value = fileDiff;
  } catch (error) {
    if (generation !== reviewFileDiffGeneration) return;
    reviewFileDiffError.value =
      error instanceof Error
        ? error.message
        : 'NÃ£o foi possÃ­vel carregar o diff deste arquivo.';
  } finally {
    if (generation === reviewFileDiffGeneration)
      loadingReviewFileDiff.value = false;
  }
}

async function loadFullFile(path: string): Promise<void> {
  fullFileContent.value = null;
  fullFileError.value = '';
  const generation = ++fullFileGeneration;
  loadingFullFile.value = true;
  try {
    const content = await fetchProjectFileContent(props.projectId, path);
    if (generation === fullFileGeneration) fullFileContent.value = content;
  } catch (error) {
    if (generation !== fullFileGeneration) return;
    fullFileError.value =
      error instanceof Error
        ? error.message
        : 'NÃ£o foi possÃ­vel carregar o arquivo completo.';
  } finally {
    if (generation === fullFileGeneration) loadingFullFile.value = false;
  }
}

function setFileViewMode(mode: 'diff' | 'full'): void {
  if (fileViewMode.value === mode) return;
  fileViewMode.value = mode;
  if (mode === 'full' && !fullFileContent.value && !loadingFullFile.value) {
    const path = activeReviewFile.value;
    if (path) void loadFullFile(path);
  }
}

async function loadAiStatus(): Promise<void> {
  try {
    const status = await getProjectGitPullRequestAiStatus(props.projectId);
    aiStatus.value = status;
    if (!status.models.some((model) => model.name === reviewModel.value))
      reviewModel.value = status.models[0]?.name ?? '';
  } catch {
    aiStatus.value = null;
    reviewModel.value = '';
  }
}

async function loadReviewFiles(): Promise<void> {
  if (!baseBranch.value.trim()) {
    reviewFiles.value = null;
    selectedFiles.value = [];
    return;
  }
  loadingFiles.value = true;
  try {
    const files = await getProjectGitPullRequestReviewFiles(props.projectId, {
      targetRemote: targetRemote.value,
      baseBranch: baseBranch.value.trim(),
    });
    reviewFiles.value = files;
    selectedFiles.value = selectedFiles.value.length
      ? selectedFiles.value.filter((path) => files.files.includes(path))
      : [...files.files];
  } catch (error) {
    reviewFiles.value = null;
    selectedFiles.value = [];
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'NÃ£o foi possÃ­vel listar os arquivos da comparaÃ§Ã£o.';
  } finally {
    loadingFiles.value = false;
  }
}

function stopRefreshing(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = undefined;
}

function isCurrentExecution(
  candidate: GitPullRequestAiReviewExecution,
): boolean {
  return (
    candidate.targetRemote === targetRemote.value &&
    candidate.baseBranch === baseBranch.value.trim()
  );
}

function applyExecution(candidate: GitPullRequestAiReviewExecution): void {
  if (!isCurrentExecution(candidate)) return;
  execution.value = candidate;
  review.value = candidate.review ?? null;
  const firstPath = candidate.review?.findings[0]?.path ?? null;
  if (firstPath && firstPath !== activeReviewFile.value)
    void openReviewFile(firstPath);
  if (candidate.status === 'failed') {
    errorMessage.value =
      candidate.errorMessage ??
      'NÃ£o foi possÃ­vel concluir o code review com IA.';
    stopRefreshing();
    void loadAiStatus();
  } else if (candidate.status === 'cancelled') {
    errorMessage.value = '';
    stopRefreshing();
  } else if (candidate.status === 'completed') {
    errorMessage.value = '';
    stopRefreshing();
  }
}

function refreshWhileRunning(): void {
  if (refreshTimer || execution.value?.status !== 'running') return;
  refreshTimer = setTimeout(async () => {
    refreshTimer = undefined;
    await refreshExecution();
    if (execution.value?.status === 'running') refreshWhileRunning();
  }, 2_500);
}

async function refreshExecution(): Promise<void> {
  try {
    const candidate = await getLatestProjectGitPullRequestAiReview(
      props.projectId,
      {
        targetRemote: targetRemote.value,
        baseBranch: baseBranch.value.trim(),
      },
    );
    if (candidate) {
      applyExecution(candidate);
      if (candidate.status === 'running') refreshWhileRunning();
    }
  } catch {
    // A revisÃ£o continua no servidor; a prÃ³xima consulta tenta recuperar o estado.
  }
}

function selectAllFiles(): void {
  selectedFiles.value = [...(reviewFiles.value?.files ?? [])];
}

function selectCodeFiles(): void {
  selectedFiles.value = (reviewFiles.value?.files ?? []).filter(isCodeFile);
}

function clearFileSelection(): void {
  selectedFiles.value = [];
}

async function reviewChanges(paths = selectedFiles.value): Promise<void> {
  if (!canReview.value || paths.length === 0) return;
  reviewing.value = true;
  errorMessage.value = '';
  review.value = null;
  activityOpen.value = true;
  try {
    const started = await startProjectGitPullRequestAiReview(props.projectId, {
      targetRemote: targetRemote.value,
      baseBranch: baseBranch.value.trim(),
      model: reviewModel.value,
      paths,
      concurrency: concurrency.value,
    });
    applyExecution(started);
    if (started.status === 'running') refreshWhileRunning();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'NÃ£o foi possÃ­vel iniciar o code review com IA.';
    void loadAiStatus();
  } finally {
    reviewing.value = false;
  }
}

async function cancelReview(): Promise<void> {
  if (!execution.value || execution.value.status !== 'running') return;
  cancelling.value = true;
  try {
    const cancelled = await cancelProjectGitPullRequestAiReview(
      props.projectId,
      execution.value.id,
    );
    applyExecution(cancelled);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'NÃ£o foi possÃ­vel cancelar a revisÃ£o.';
  } finally {
    cancelling.value = false;
  }
}

async function retryFailedFiles(): Promise<void> {
  if (failedFilePaths.value.length === 0) return;
  selectedFiles.value = [...failedFilePaths.value];
  scopeOpen.value = false;
  await reviewChanges([...failedFilePaths.value]);
}

watch(
  () => [props.projectId, props.workspace, props.overview.branch] as const,
  () => {
    stopRefreshing();
    targetRemote.value = availableTargets.value.includes('origin')
      ? 'origin'
      : (availableTargets.value[0] ?? 'origin');
    baseBranch.value = defaultBase();
    review.value = null;
    activeReviewFile.value = null;
    reviewFileDiff.value = null;
    fileViewMode.value = 'diff';
    fullFileContent.value = null;
    fullFileError.value = '';
    selectedFindingKeys.value = [];
    resolvedFindingKeys.value = [];
    ignoredFindingKeys.value = [];
    execution.value = null;
    reviewFiles.value = null;
    selectedFiles.value = [];
    errorMessage.value = '';
    void loadAiStatus();
    void loadReviewFiles();
    void refreshExecution();
  },
  { immediate: true },
);

watch(targetRemote, () => {
  if (isRunning.value) return;
  baseBranch.value = defaultBase();
  review.value = null;
  activeReviewFile.value = null;
  reviewFileDiff.value = null;
  fileViewMode.value = 'diff';
  fullFileContent.value = null;
  fullFileError.value = '';
  execution.value = null;
  selectedFiles.value = [];
  void loadReviewFiles();
  void refreshExecution();
});

watch(baseBranch, () => {
  if (isRunning.value) return;
  review.value = null;
  activeReviewFile.value = null;
  reviewFileDiff.value = null;
  fileViewMode.value = 'diff';
  fullFileContent.value = null;
  fullFileError.value = '';
  execution.value = null;
  selectedFiles.value = [];
  void loadReviewFiles();
  void refreshExecution();
});

onUnmounted(stopRefreshing);
</script>

<template>
  <section class="git-code-review">
    <header class="git-code-review-heading">
      <div>
        <span>Code review</span>
        <h2>RevisÃ£o de cÃ³digo com IA</h2>
        <p>Escolha o escopo e acompanhe cada arquivo sem sair da revisÃ£o.</p>
      </div>
      <DocumentMagnifyingGlassIcon aria-hidden="true" />
    </header>

    <div class="git-code-review-controls">
      <label>
        <span>Comparar com</span>
        <select v-model="targetRemote" :disabled="isRunning">
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
        <select v-model="baseBranch" :disabled="isRunning">
          <option v-for="branch in baseBranches" :key="branch" :value="branch">
            {{ branch }}
          </option>
          <option v-if="baseBranches.length === 0" value="main">main</option>
        </select>
      </label>
      <label v-if="aiStatus?.models.length">
        <span>Modelo</span>
        <select v-model="reviewModel" :disabled="isRunning">
          <option
            v-for="model in aiStatus.models"
            :key="model.name"
            :value="model.name"
          >
            {{ model.name }}
          </option>
        </select>
      </label>
      <label v-if="aiStatus?.models.length">
        <span>Paralelismo</span>
        <select v-model="concurrency" :disabled="isRunning">
          <option :value="1">EconÃ´mico Â· 1 por vez</option>
          <option :value="2">RÃ¡pido Â· 2 em paralelo</option>
        </select>
      </label>
      <p class="git-code-review-model">
        {{ providerStatusMessage }}
      </p>
      <button
        class="git-code-review-start"
        type="button"
        :disabled="!canReview"
        @click="reviewChanges()"
      >
        <SparklesIcon aria-hidden="true" />
        Iniciar revisÃ£o
      </button>
    </div>

    <p v-if="errorMessage" class="project-error" role="alert">
      {{ errorMessage }}
    </p>

    <section v-if="reviewFiles" class="git-code-review-scope">
      <header>
        <div>
          <strong>{{ selectedCount }} arquivo(s) selecionado(s)</strong>
          <span
            >do diff entre {{ props.overview.branch }} e {{ baseBranch }}</span
          >
        </div>
        <button
          type="button"
          :disabled="isRunning"
          :aria-expanded="scopeOpen"
          @click="scopeOpen = !scopeOpen"
        >
          {{ scopeOpen ? 'Fechar' : 'Alterar' }}
          <ChevronUpIcon v-if="scopeOpen" aria-hidden="true" />
          <ChevronDownIcon v-else aria-hidden="true" />
        </button>
      </header>

      <div v-if="scopeOpen" class="git-code-review-scope-list">
        <div class="git-code-review-scope-actions">
          <button type="button" @click="selectAllFiles">
            Selecionar todos
          </button>
          <button type="button" @click="selectCodeFiles">Somente cÃ³digo</button>
          <button type="button" @click="clearFileSelection">Limpar</button>
        </div>
        <label v-for="file in reviewFiles.files" :key="file">
          <input v-model="selectedFiles" type="checkbox" :value="file" />
          <code>{{ file }}</code>
        </label>
      </div>
    </section>
    <p v-else-if="loadingFiles" class="git-code-review-model">
      Carregando arquivos alteradosâ¦
    </p>

    <section
      v-if="execution?.status === 'running'"
      class="git-code-review-progress"
    >
      <header>
        <div>
          <span>Em andamento</span>
          <strong>Revisando {{ reviewProgress }} de {{ reviewTotal }}</strong>
        </div>
        <button
          class="git-code-review-cancel"
          type="button"
          :disabled="cancelling"
          @click="cancelReview"
        >
          <StopIcon aria-hidden="true" />
          {{ cancelling ? 'Cancelandoâ¦' : 'Cancelar revisÃ£o' }}
        </button>
      </header>
      <div
        class="git-code-review-progress-bar"
        role="progressbar"
        :aria-valuenow="reviewProgress"
        :aria-valuemax="reviewTotal"
      >
        <span :style="{ width: `${reviewPercent}%` }"></span>
      </div>
      <dl>
        <div>
          <dt>Arquivo atual</dt>
          <dd>
            {{ currentFiles.join(', ') || 'Preparando prÃ³xima anÃ¡liseâ¦' }}
          </dd>
        </div>
        <div>
          <dt>Tempo decorrido</dt>
          <dd>{{ formatElapsed(execution.startedAt) }}</dd>
        </div>
        <div>
          <dt>Provider</dt>
          <dd>{{ providerLabel(execution.provider) }}</dd>
        </div>
        <div>
          <dt>Modo IA</dt>
          <dd>{{ executionModeLabel(execution.mode) }}</dd>
        </div>
        <div>
          <dt>Paralelismo</dt>
          <dd>
            {{ execution.concurrency === 2 ? '2 em paralelo' : '1 por vez' }}
          </dd>
        </div>
      </dl>
    </section>

    <section
      v-if="execution"
      class="git-code-review-activity"
      :class="{ 'is-open': activityOpen }"
    >
      <button
        type="button"
        :aria-expanded="activityOpen"
        @click="activityOpen = !activityOpen"
      >
        <span>
          <ClockIcon aria-hidden="true" />
          Acompanhamento Â·
          {{ execution.fileExecutions?.length ?? 0 }} arquivo(s)
        </span>
        <ChevronUpIcon v-if="activityOpen" aria-hidden="true" />
        <ChevronDownIcon v-else aria-hidden="true" />
      </button>
      <ol v-if="activityOpen">
        <li
          v-for="file in execution.fileExecutions ?? []"
          :key="file.path"
          :class="`is-${file.status}`"
        >
          <CheckCircleIcon
            v-if="file.status === 'completed'"
            aria-hidden="true"
          />
          <ExclamationCircleIcon
            v-else-if="file.status === 'failed'"
            aria-hidden="true"
          />
          <ArrowPathIcon
            v-else-if="file.status === 'running'"
            class="spinning"
            aria-hidden="true"
          />
          <ClockIcon v-else aria-hidden="true" />
          <code>{{ file.path }}</code>
          <span>{{ fileStatusLabel(file) }}</span>
          <small v-if="file.errorMessage">{{ file.errorMessage }}</small>
        </li>
      </ol>
    </section>

    <p v-if="execution?.status === 'cancelled'" class="git-code-review-notice">
      RevisÃ£o cancelada. {{ execution.completedFileCount }} arquivo(s)
      concluÃ­do(s) antes do cancelamento.
    </p>

    <div v-if="review" class="git-code-review-results" aria-live="polite">
      <div class="git-code-review-summary">
        <div>
          <span
            >Resultado
            {{
              execution?.status === 'cancelled' ? 'parcial' : 'da revisÃ£o'
            }}</span
          >
          <strong>{{ pendingFindingCount }} apontamento(s) pendente(s)</strong>
          <p>{{ review.summary }}</p>
        </div>
        <small
          >{{ execution ? providerLabel(execution.provider) : '' }} Â·
          {{ execution ? executionModeLabel(execution.mode) : '' }} Â·
          {{ review.model }} Â·
          {{
            formatElapsed(execution?.startedAt, execution?.finishedAt)
          }}</small
        >
      </div>

      <p
        v-if="review.findings.length === 0"
        class="git-code-review-empty-results"
      >
        Nenhum ponto relevante foi encontrado. Ainda vale revisar o diff antes
        de abrir a PR.
      </p>

      <div v-else class="git-code-review-workspace">
        <aside class="git-code-review-files" aria-label="Arquivos revisados">
          <header>
            <div>
              <span>ComentÃ¡rios por arquivo</span>
              <strong>{{ groupedReviewFindings.length }} arquivo(s)</strong>
            </div>
            <FunnelIcon aria-hidden="true" />
          </header>

          <div class="git-code-review-file-list">
            <button
              v-for="group in groupedReviewFindings"
              :key="group.path"
              type="button"
              :class="{ active: activeReviewFile === group.path }"
              @click="openReviewFile(group.path)"
            >
              <CodeBracketIcon aria-hidden="true" />
              <span>
                <strong>{{ group.path }}</strong>
                <small>{{ group.findings.length }} apontamento(s)</small>
              </span>
              <b>{{
                group.findings.filter((finding) => !isFindingResolved(finding))
                  .length
              }}</b>
            </button>
          </div>

          <p v-if="review.diffTruncated" class="git-code-review-file-notice">
            Um diff extenso foi resumido para a anÃ¡lise da IA; a visualizaÃ§Ã£o
            abaixo continua completa.
          </p>
        </aside>

        <section
          class="git-code-review-file-review"
          aria-label="Arquivo e diff selecionados"
        >
          <header>
            <div>
              <span>Arquivo selecionado</span>
              <strong :title="activeReviewFile ?? undefined">{{
                activeReviewFile ?? 'Selecione um arquivo'
              }}</strong>
            </div>
            <div
              v-if="activeReviewFile"
              class="git-code-review-file-mode-toggle"
              aria-label="Modo de exibiÃ§Ã£o do arquivo"
            >
              <button
                type="button"
                :class="{ active: fileViewMode === 'diff' }"
                :aria-pressed="fileViewMode === 'diff'"
                @click="setFileViewMode('diff')"
              >
                Diff
              </button>
              <button
                type="button"
                :class="{ active: fileViewMode === 'full' }"
                :aria-pressed="fileViewMode === 'full'"
                @click="setFileViewMode('full')"
              >
                Arquivo completo
              </button>
            </div>
          </header>

          <div class="git-code-review-file-body">
            <div
              v-if="generalFindings.length"
              class="git-code-review-finding-list"
            >
              <GitCodeReviewFindingCard
                v-for="finding in generalFindings"
                :key="findingKey(finding)"
                :finding="finding"
                :resolved="isFindingResolved(finding)"
                :selected="isFindingSelected(finding)"
                @toggle-selection="toggleFindingSelection(finding)"
                @resolve="markFindingResolved(finding)"
                @ignore="ignoreFinding(finding)"
              />
            </div>

            <div class="git-code-review-diff-panel">
              <template v-if="fileViewMode === 'full'">
                <div v-if="loadingFullFile" class="git-code-review-diff-empty">
                  <ArrowPathIcon class="spinning" aria-hidden="true" />
                  Carregando arquivo completoâ¦
                </div>
                <div
                  v-else-if="fullFileError"
                  class="git-code-review-diff-empty"
                >
                  <p class="project-error" role="alert">{{ fullFileError }}</p>
                  <button type="button" @click="setFileViewMode('diff')">
                    Ver diff
                  </button>
                </div>
                <GitFileFullView
                  v-else-if="fullFileContent && activeReviewFile"
                  :content="fullFileContent.content"
                  :diff="reviewFileDiff?.diff ?? ''"
                  :path="activeReviewFile"
                  :findings="positionedFindings"
                  :resolved-keys="resolvedFindingKeys"
                  :selected-keys="selectedFindingKeys"
                  @toggle-finding-selection="toggleFindingSelection"
                  @resolve-finding="markFindingResolved"
                  @ignore-finding="ignoreFinding"
                />
                <div v-else class="git-code-review-diff-empty">
                  Escolha um arquivo para abrir o arquivo completo.
                </div>
              </template>
              <template v-else>
                <div
                  v-if="loadingReviewFileDiff"
                  class="git-code-review-diff-empty"
                >
                  <ArrowPathIcon class="spinning" aria-hidden="true" />
                  Carregando diff da comparaÃ§Ã£oâ¦
                </div>
                <p
                  v-else-if="reviewFileDiffError"
                  class="project-error"
                  role="alert"
                >
                  {{ reviewFileDiffError }}
                </p>
                <GitFileDiffView
                  v-else-if="reviewFileDiff && activeReviewFile"
                  :content="reviewFileDiff.diff"
                  :path="activeReviewFile"
                  view-mode="split"
                  :findings="positionedFindings"
                  :resolved-keys="resolvedFindingKeys"
                  :selected-keys="selectedFindingKeys"
                  @toggle-finding-selection="toggleFindingSelection"
                  @resolve-finding="markFindingResolved"
                  @ignore-finding="ignoreFinding"
                />
                <div v-else class="git-code-review-diff-empty">
                  Escolha um arquivo para abrir o diff correspondente Ã  revisÃ£o.
                </div>
              </template>
            </div>
          </div>
        </section>
      </div>

      <footer
        v-if="selectedFindingKeys.length"
        class="git-code-review-selection-bar"
      >
        <span>{{ selectedFindingKeys.length }} selecionado(s)</span>
        <button type="button" @click="selectedFindingKeys = []">
          Limpar seleÃ§Ã£o
        </button>
        <button type="button" @click="markSelectedFindingsResolved">
          <CheckIcon aria-hidden="true" />
          Resolver selecionados
        </button>
      </footer>
    </div>

    <section
      v-if="execution?.failedFiles.length"
      class="git-code-review-failures"
    >
      <header>
        <div>
          <strong
            >{{ execution.failedFiles.length }} arquivo(s) nÃ£o
            responderam</strong
          >
          <span>A revisÃ£o dos demais arquivos continua disponÃ­vel.</span>
        </div>
        <button type="button" :disabled="isRunning" @click="retryFailedFiles">
          Tentar falhos
        </button>
      </header>
      <ul>
        <li v-for="failure in execution.failedFiles" :key="failure.path">
          <code>{{ failure.path }}</code>
          <span>{{ failure.message }}</span>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped src="./ProjectGitCodeReviewPage.css"></style>
