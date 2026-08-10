<script setup lang="ts">
import {
  ArrowPathIcon,
  DocumentMagnifyingGlassIcon,
  SparklesIcon,
} from '@heroicons/vue/24/outline';
import { computed, onUnmounted, ref, watch } from 'vue';

import type {
  GitPullRequestAiReview,
  GitPullRequestAiReviewExecution,
  GitPullRequestReviewFiles,
  ProjectAiStatus,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import {
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
const reviewing = ref(false);
const review = ref<GitPullRequestAiReview | null>(null);
const execution = ref<GitPullRequestAiReviewExecution | null>(null);
const reviewFiles = ref<GitPullRequestReviewFiles | null>(null);
const loadingFiles = ref(false);
const reviewedFileCount = ref(0);
const errorMessage = ref('');
let refreshTimer: ReturnType<typeof setInterval> | undefined;

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

const canReview = computed(
  () =>
    !reviewing.value &&
    execution.value?.status !== 'running' &&
    Boolean(props.overview.branch) &&
    Boolean(baseBranch.value.trim()) &&
    Boolean(reviewModel.value) &&
    Boolean(reviewFiles.value?.files.length),
);

const reviewProgress = computed(
  () => execution.value?.completedFileCount ?? reviewedFileCount.value,
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
    return;
  }
  loadingFiles.value = true;
  try {
    reviewFiles.value = await getProjectGitPullRequestReviewFiles(
      props.projectId,
      {
        targetRemote: targetRemote.value,
        baseBranch: baseBranch.value.trim(),
      },
    );
  } catch (error) {
    reviewFiles.value = null;
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível listar os arquivos da comparação.';
  } finally {
    loadingFiles.value = false;
  }
}

function stopRefreshing(): void {
  if (refreshTimer) clearInterval(refreshTimer);
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
  reviewedFileCount.value = candidate.completedFileCount;
  review.value = candidate.review ?? null;
  if (candidate.status === 'failed') {
    errorMessage.value =
      candidate.errorMessage ??
      'Não foi possível concluir o code review com IA.';
    stopRefreshing();
  } else if (candidate.status === 'completed') {
    if (candidate.failedFiles.length > 0)
      errorMessage.value = `${candidate.failedFiles.length} arquivo(s) não puderam ser revisados: ${candidate.failedFiles
        .map((failure) => failure.path)
        .join(', ')}.`;
    stopRefreshing();
  }
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
      if (candidate.status === 'running' && !refreshTimer)
        refreshWhileRunning();
    }
  } catch {
    // Uma falha momentânea de consulta não encerra a execução no servidor.
  }
}

function refreshWhileRunning(): void {
  stopRefreshing();
  refreshTimer = setInterval(() => void refreshExecution(), 1_500);
}

async function reviewChanges(): Promise<void> {
  if (!canReview.value || !reviewFiles.value) return;
  reviewing.value = true;
  reviewedFileCount.value = 0;
  errorMessage.value = '';
  review.value = null;
  try {
    const started = await startProjectGitPullRequestAiReview(props.projectId, {
      targetRemote: targetRemote.value,
      baseBranch: baseBranch.value.trim(),
      model: reviewModel.value,
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

watch(
  () => [props.projectId, props.workspace, props.overview.branch] as const,
  () => {
    targetRemote.value = availableTargets.value.includes('origin')
      ? 'origin'
      : (availableTargets.value[0] ?? 'origin');
    baseBranch.value = defaultBase();
    review.value = null;
    execution.value = null;
    reviewFiles.value = null;
    errorMessage.value = '';
    void loadAiStatus();
    void loadReviewFiles();
    void refreshExecution();
  },
  { immediate: true },
);

watch(targetRemote, () => {
  baseBranch.value = defaultBase();
  review.value = null;
  execution.value = null;
  void loadReviewFiles();
  void refreshExecution();
});

watch(baseBranch, () => {
  review.value = null;
  execution.value = null;
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
        <p>
          A IA analisa a comparação da branch atual e apresenta cada ponto com
          arquivo, linha e recomendação.
        </p>
      </div>
      <DocumentMagnifyingGlassIcon aria-hidden="true" />
    </header>

    <template>
      <div class="git-code-review-controls">
        <label>
          <span>Comparar com</span>
          <select v-model="targetRemote" :disabled="reviewing">
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
          <select v-model="baseBranch" :disabled="reviewing">
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
        <label v-if="aiStatus?.models.length">
          <span>Modelo</span>
          <select v-model="reviewModel" :disabled="reviewing">
            <option
              v-for="model in aiStatus.models"
              :key="model.name"
              :value="model.name"
            >
              {{ model.name }}
            </option>
          </select>
        </label>
        <p v-else class="git-code-review-model">
          {{ aiStatus?.message ?? 'Verificando Ollama local…' }}
        </p>
        <button type="button" :disabled="!canReview" @click="reviewChanges">
          <ArrowPathIcon
            v-if="reviewing || execution?.status === 'running'"
            class="spinning"
            aria-hidden="true"
          />
          <SparklesIcon v-else aria-hidden="true" />
          {{
            reviewing || execution?.status === 'running'
              ? `Revisando ${reviewProgress} de ${execution?.files.length ?? reviewFiles?.files.length ?? 0}…`
              : 'Iniciar revisão'
          }}
        </button>
      </div>

      <p v-if="errorMessage" class="project-error" role="alert">
        {{ errorMessage }}
      </p>

      <section
        v-if="reviewFiles"
        class="git-code-review-files"
        aria-label="Arquivos alterados"
      >
        <header>
          <strong>Alterações analisadas</strong>
          <span>{{ reviewFiles.files.length }} arquivo(s)</span>
        </header>
        <ul>
          <li v-for="file in reviewFiles.files" :key="file">
            <code>{{ file }}</code>
          </li>
        </ul>
      </section>
      <p v-else-if="loadingFiles" class="git-code-review-model">
        Carregando arquivos alterados…
      </p>

      <div v-if="review" class="git-code-review-results" aria-live="polite">
        <div class="git-code-review-summary">
          <div>
            <strong>Resumo</strong>
            <span>{{ review.summary }}</span>
          </div>
          <small>{{ review.model }} · revisão consultiva</small>
        </div>

        <section
          class="git-code-review-findings"
          aria-label="Comentários da IA"
        >
          <header>
            <strong>Comentários ponto a ponto</strong>
            <span>{{ review.findings.length }} encontrado(s)</span>
          </header>
          <p v-if="review.findings.length === 0">
            Nenhum ponto relevante foi encontrado. Ainda vale revisar o diff
            antes de abrir a PR.
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
            Um arquivo muito extenso foi reduzido para a análise. O diff
            completo continua disponível na aba Diff.
          </p>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped src="./ProjectGitCodeReviewPage.css"></style>
