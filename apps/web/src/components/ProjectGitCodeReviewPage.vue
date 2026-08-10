<script setup lang="ts">
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  DocumentMagnifyingGlassIcon,
  ExclamationCircleIcon,
  SparklesIcon,
  StopIcon,
} from '@heroicons/vue/24/outline';
import { computed, onUnmounted, ref, watch } from 'vue';

import type {
  GitPullRequestAiReview,
  GitPullRequestAiReviewExecution,
  GitPullRequestAiReviewFileExecution,
  GitPullRequestReviewFiles,
  ProjectAiStatus,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import {
  cancelProjectGitPullRequestAiReview,
  fetchProjectAiStatus,
  getLatestProjectGitPullRequestAiReview,
  getProjectGitPullRequestReviewFiles,
  startProjectGitPullRequestAiReview,
  type GitPullRequestTargetRemote,
} from '../api';

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

const isRunning = computed(
  () => reviewing.value || execution.value?.status === 'running',
);
const selectedCount = computed(() => selectedFiles.value.length);
const canReview = computed(
  () =>
    !isRunning.value &&
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
  if (!startedAt) return '—';
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
    running: 'Em análise',
    completed: 'Concluído',
    failed: 'Falhou',
    cancelled: 'Cancelado',
  } as const;
  return labels[file.status];
}

async function loadAiStatus(): Promise<void> {
  try {
    const status = await fetchProjectAiStatus(props.projectId);
    aiStatus.value = status;
    if (!status.models.some((model) => model.name === reviewModel.value))
      reviewModel.value = status.models[0]?.name ?? '';
  } catch {
    aiStatus.value = {
      available: false,
      models: [],
      message: 'Não foi possível verificar o Ollama local para a revisão.',
    };
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
        : 'Não foi possível listar os arquivos da comparação.';
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
  if (candidate.status === 'failed') {
    errorMessage.value =
      candidate.errorMessage ??
      'Não foi possível concluir o code review com IA.';
    stopRefreshing();
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
    // A revisão continua no servidor; a próxima consulta tenta recuperar o estado.
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
        : 'Não foi possível iniciar o code review com IA.';
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
        : 'Não foi possível cancelar a revisão.';
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
  execution.value = null;
  selectedFiles.value = [];
  void loadReviewFiles();
  void refreshExecution();
});

watch(baseBranch, () => {
  if (isRunning.value) return;
  review.value = null;
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
        <h2>Revisão de código com IA</h2>
        <p>Escolha o escopo e acompanhe cada arquivo sem sair da revisão.</p>
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
        <span>Velocidade</span>
        <select v-model="concurrency" :disabled="isRunning">
          <option :value="1">Econômica · 1 por vez</option>
          <option :value="2">Rápida · 2 em paralelo</option>
        </select>
      </label>
      <p v-else class="git-code-review-model">
        {{ aiStatus?.message ?? 'Verificando Ollama local…' }}
      </p>
      <button
        class="git-code-review-start"
        type="button"
        :disabled="!canReview"
        @click="reviewChanges()"
      >
        <SparklesIcon aria-hidden="true" />
        Iniciar revisão
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
          <button type="button" @click="selectCodeFiles">Somente código</button>
          <button type="button" @click="clearFileSelection">Limpar</button>
        </div>
        <label v-for="file in reviewFiles.files" :key="file">
          <input v-model="selectedFiles" type="checkbox" :value="file" />
          <code>{{ file }}</code>
        </label>
      </div>
    </section>
    <p v-else-if="loadingFiles" class="git-code-review-model">
      Carregando arquivos alterados…
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
          {{ cancelling ? 'Cancelando…' : 'Cancelar revisão' }}
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
            {{ currentFiles.join(', ') || 'Preparando próxima análise…' }}
          </dd>
        </div>
        <div>
          <dt>Tempo decorrido</dt>
          <dd>{{ formatElapsed(execution.startedAt) }}</dd>
        </div>
        <div>
          <dt>Modo</dt>
          <dd>
            {{
              execution.concurrency === 2
                ? 'Rápida · 2 em paralelo'
                : 'Econômica · 1 por vez'
            }}
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
          Acompanhamento ·
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
      Revisão cancelada. {{ execution.completedFileCount }} arquivo(s)
      concluído(s) antes do cancelamento.
    </p>

    <div v-if="review" class="git-code-review-results" aria-live="polite">
      <div class="git-code-review-summary">
        <div>
          <strong>{{
            execution?.status === 'cancelled'
              ? 'Resultado parcial'
              : 'Revisão concluída'
          }}</strong>
          <span>{{ review.summary }}</span>
        </div>
        <small
          >{{ review.model }} ·
          {{
            formatElapsed(execution?.startedAt, execution?.finishedAt)
          }}</small
        >
      </div>

      <section class="git-code-review-findings" aria-label="Comentários da IA">
        <header>
          <strong>Comentários ponto a ponto</strong>
          <span>{{ review.findings.length }} encontrado(s)</span>
        </header>
        <p v-if="review.findings.length === 0">
          Nenhum ponto relevante foi encontrado. Ainda vale revisar o diff antes
          de abrir a PR.
        </p>
        <ol v-else>
          <li
            v-for="finding in review.findings"
            :key="`${finding.path}:${finding.line ?? 0}:${finding.title}`"
          >
            <span
              :class="['git-code-review-severity', `is-${finding.severity}`]"
              >{{ finding.severity }}</span
            >
            <div>
              <strong>{{ finding.title }}</strong>
              <code
                >{{ finding.path
                }}<template v-if="finding.line"
                  >:{{ finding.line }}</template
                ></code
              >
              <p>{{ finding.explanation }}</p>
              <small>Recomendação: {{ finding.recommendation }}</small>
            </div>
          </li>
        </ol>
        <p v-if="review.diffTruncated">
          Um arquivo muito extenso foi reduzido para a análise. O diff completo
          continua disponível na aba Diff.
        </p>
      </section>
    </div>

    <section
      v-if="execution?.failedFiles.length"
      class="git-code-review-failures"
    >
      <header>
        <div>
          <strong
            >{{ execution.failedFiles.length }} arquivo(s) não
            responderam</strong
          >
          <span>A revisão dos demais arquivos continua disponível.</span>
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
