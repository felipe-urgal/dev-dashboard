<script setup lang="ts">
import {
  ArrowPathIcon,
  DocumentMagnifyingGlassIcon,
  SparklesIcon,
} from '@heroicons/vue/24/outline';
import { computed, ref, watch } from 'vue';

import type {
  GitPullRequestAiReview,
  GitPullRequestReviewFiles,
  ProjectAiStatus,
  ProjectGitOverview,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import {
  fetchProjectAiStatus,
  getProjectGitPullRequestReviewFiles,
  reviewProjectGitPullRequest,
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
const reviewFiles = ref<GitPullRequestReviewFiles | null>(null);
const loadingFiles = ref(false);
const reviewedFileCount = ref(0);
const errorMessage = ref('');

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
    Boolean(props.overview.branch) &&
    Boolean(baseBranch.value.trim()) &&
    Boolean(reviewModel.value) &&
    Boolean(reviewFiles.value?.files.length),
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

async function reviewChanges(): Promise<void> {
  if (!canReview.value || !reviewFiles.value) return;
  reviewing.value = true;
  reviewedFileCount.value = 0;
  errorMessage.value = '';
  review.value = null;
  try {
    const reviews: GitPullRequestAiReview[] = [];
    const failures: Array<{ path: string; message: string }> = [];
    for (const path of reviewFiles.value.files) {
      try {
        reviews.push(
          await reviewProjectGitPullRequest(props.projectId, {
            targetRemote: targetRemote.value,
            baseBranch: baseBranch.value.trim(),
            model: reviewModel.value,
            path,
          }),
        );
      } catch (error) {
        failures.push({
          path,
          message:
            error instanceof Error
              ? error.message
              : 'A IA não respondeu para este arquivo.',
        });
      } finally {
        reviewedFileCount.value += 1;
      }
    }
    const firstReview = reviews[0];
    if (!firstReview) {
      const firstFailure = failures[0];
      throw new Error(
        firstFailure
          ? `Não foi possível concluir a revisão: ${firstFailure.message}`
          : 'A IA não conseguiu revisar os arquivos selecionados.',
      );
    }
    review.value = {
      ...firstReview,
      files: reviewFiles.value.files,
      summary:
        failures.length === 0
          ? `A IA revisou ${reviews.length} arquivo(s) separadamente.`
          : `A IA revisou ${reviews.length} de ${reviewFiles.value.files.length} arquivo(s).`,
      findings: reviews.flatMap((item) => item.findings),
      diffTruncated: reviews.some((item) => item.diffTruncated),
      masked: reviews.some((item) => item.masked),
      redactionCount: reviews.reduce(
        (total, item) => total + item.redactionCount,
        0,
      ),
    };
    if (failures.length > 0)
      errorMessage.value = `${failures.length} arquivo(s) não puderam ser revisados: ${failures
        .map((failure) => failure.path)
        .join(', ')}.`;
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível concluir o code review com IA.';
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
    reviewFiles.value = null;
    errorMessage.value = '';
    void loadAiStatus();
    void loadReviewFiles();
  },
  { immediate: true },
);

watch(targetRemote, () => {
  baseBranch.value = defaultBase();
  review.value = null;
  void loadReviewFiles();
});

watch(baseBranch, () => {
  review.value = null;
  void loadReviewFiles();
});
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
          <ArrowPathIcon v-if="reviewing" class="spinning" aria-hidden="true" />
          <SparklesIcon v-else aria-hidden="true" />
          {{
            reviewing
              ? `Revisando ${reviewedFileCount} de ${reviewFiles?.files.length ?? 0}…`
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
