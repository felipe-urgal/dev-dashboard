<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import type {
  GitPullRequestCiStatus,
  TaskContext,
  TaskContextReadinessStatus,
  TaskContextSnapshot,
} from '@dev-dashboard/contracts';

import {
  ApiRequestError,
  fetchTaskContexts,
  fetchTaskContextSnapshot,
} from '../api';
import StatusBadge from './StatusBadge.vue';
import type { StatusBadgeTone } from './status-badge-types';

const props = defineProps<{
  projectId: string;
  currentBranch?: string | undefined;
  environmentInstanceId?: string | undefined;
}>();

const contexts = ref<TaskContext[]>([]);
const selectedId = ref('');
const snapshot = ref<TaskContextSnapshot | null>(null);
const loading = ref(false);
const errorMessage = ref('');
let controller: AbortController | undefined;
let generation = 0;

const selectedContext = computed(
  () => snapshot.value?.context ?? contexts.value.find((item) => item.id === selectedId.value),
);

const expectedEnvironmentId = computed(
  () =>
    props.environmentInstanceId ??
    `environment:primary:${props.projectId}`,
);

const branchMismatch = computed(() => {
  const context = selectedContext.value;
  if (!context || !props.currentBranch) return false;
  return context.branch !== props.currentBranch;
});

const readinessTone: Record<TaskContextReadinessStatus, StatusBadgeTone> = {
  pass: 'success',
  warning: 'warning',
  block: 'danger',
  unknown: 'neutral',
};

const readinessLabel: Record<TaskContextReadinessStatus, string> = {
  pass: 'Pronto',
  warning: 'Atenção',
  block: 'Bloqueado',
  unknown: 'Inconclusivo',
};

function ciTone(status: GitPullRequestCiStatus): StatusBadgeTone {
  if (status === 'success') return 'success';
  if (status === 'failure') return 'danger';
  if (status === 'pending') return 'info';
  return 'neutral';
}

function ciLabel(status: GitPullRequestCiStatus): string {
  if (status === 'success') return 'CI verde';
  if (status === 'failure') return 'CI falhou';
  if (status === 'pending') return 'CI rodando';
  return 'CI desconhecido';
}

function repositoryPath(value: string): string | undefined {
  const candidate = value.trim();
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(candidate)
    ? candidate
    : undefined;
}

function issueUrl(context: TaskContext): string | undefined {
  const issue = context.issue;
  const repository = issue ? repositoryPath(issue.repository) : undefined;
  return issue && repository
    ? `https://github.com/${repository}/issues/${issue.number}`
    : undefined;
}

function pullRequestUrl(context: TaskContext): string | undefined {
  const observed = snapshot.value?.evidence?.pullRequest?.url;
  if (observed) return observed;
  const pullRequest = context.pullRequest;
  const repository = pullRequest
    ? repositoryPath(pullRequest.repository)
    : undefined;
  return pullRequest && repository
    ? `https://github.com/${repository}/pull/${pullRequest.number}`
    : undefined;
}

function contextLabel(context: TaskContext): string {
  const issue = context.issue ? `#${context.issue.number}` : 'Sem issue';
  return `${issue} · ${context.branch}`;
}

function scoreContext(context: TaskContext): number {
  let score = 0;
  if (props.currentBranch && context.branch === props.currentBranch) score += 4;
  if (context.environmentInstanceId === expectedEnvironmentId.value) score += 2;
  if (!context.worktreeId && !props.environmentInstanceId) score += 1;
  return score;
}

function chooseDefaultContext(items: TaskContext[]): TaskContext | undefined {
  return [...items].sort((left, right) => {
    const score = scoreContext(right) - scoreContext(left);
    if (score !== 0) return score;
    return right.updatedAt.localeCompare(left.updatedAt);
  })[0];
}

async function loadSnapshot(taskContextId: string): Promise<void> {
  const requestGeneration = generation;
  snapshot.value = null;
  if (!taskContextId) return;

  try {
    const result = await fetchTaskContextSnapshot(
      props.projectId,
      taskContextId,
      controller?.signal,
    );
    if (requestGeneration === generation && selectedId.value === taskContextId) {
      snapshot.value = result;
    }
  } catch (error) {
    if (controller?.signal.aborted || requestGeneration !== generation) return;
    errorMessage.value =
      error instanceof ApiRequestError
        ? error.message
        : 'Não foi possível carregar o contexto selecionado.';
  }
}

async function loadContexts(): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  const activeGeneration = ++generation;
  loading.value = true;
  errorMessage.value = '';
  snapshot.value = null;

  try {
    const items = await fetchTaskContexts(props.projectId, controller.signal);
    if (activeGeneration !== generation) return;
    contexts.value = [...items].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
    const preferred = chooseDefaultContext(contexts.value);
    selectedId.value = preferred?.id ?? '';
    if (preferred) await loadSnapshot(preferred.id);
  } catch (error) {
    if (controller.signal.aborted || activeGeneration !== generation) return;
    contexts.value = [];
    selectedId.value = '';
    errorMessage.value =
      error instanceof ApiRequestError
        ? error.message
        : 'Não foi possível carregar os Task Contexts.';
  } finally {
    if (activeGeneration === generation) loading.value = false;
  }
}

watch(
  () => [props.projectId, props.currentBranch, props.environmentInstanceId],
  () => void loadContexts(),
  { immediate: true },
);

watch(selectedId, (value, previous) => {
  if (!value || value === previous) return;
  errorMessage.value = '';
  void loadSnapshot(value);
});

onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <div class="task-context-summary" aria-label="Task Context">
    <div class="task-context-summary-header">
      <span class="task-context-summary-label">Contexto</span>
      <select
        v-if="contexts.length > 1"
        v-model="selectedId"
        class="task-context-summary-select"
        aria-label="Trocar Task Context"
      >
        <option v-for="context in contexts" :key="context.id" :value="context.id">
          {{ contextLabel(context) }}
        </option>
      </select>
    </div>

    <span v-if="loading && !selectedContext" class="task-context-summary-muted">
      Carregando…
    </span>
    <span v-else-if="errorMessage" class="task-context-summary-error" role="status">
      {{ errorMessage }}
    </span>
    <span
      v-else-if="contexts.length === 0"
      class="task-context-summary-muted"
    >
      Nenhum contexto associado.
    </span>

    <template v-else-if="selectedContext">
      <div class="task-context-summary-row">
        <strong>{{ selectedContext.branch }}</strong>
        <StatusBadge v-if="branchMismatch" tone="warning">Branch diferente</StatusBadge>
        <StatusBadge
          v-if="snapshot?.evidence?.readiness"
          :tone="readinessTone[snapshot.evidence.readiness.status]"
        >
          {{ readinessLabel[snapshot.evidence.readiness.status] }}
        </StatusBadge>
        <StatusBadge
          v-if="snapshot?.evidence?.pullRequest?.ciStatus"
          :tone="ciTone(snapshot.evidence.pullRequest.ciStatus)"
        >
          {{ ciLabel(snapshot.evidence.pullRequest.ciStatus) }}
        </StatusBadge>
      </div>

      <div class="task-context-summary-links">
        <a
          v-if="selectedContext.issue && issueUrl(selectedContext)"
          :href="issueUrl(selectedContext)"
          target="_blank"
          rel="noreferrer"
        >
          Issue #{{ selectedContext.issue.number }}
        </a>
        <a
          v-if="selectedContext.pullRequest && pullRequestUrl(selectedContext)"
          :href="pullRequestUrl(selectedContext)"
          target="_blank"
          rel="noreferrer"
        >
          PR #{{ selectedContext.pullRequest.number }}
        </a>
        <span v-if="selectedContext.worktreeId">
          Worktree {{ selectedContext.worktreeId }}
        </span>
      </div>

      <small v-if="branchMismatch" class="task-context-summary-warning">
        Trocar o contexto aqui não altera branch, worktree ou runtime.
      </small>
    </template>
  </div>
</template>

<style scoped>
.task-context-summary {
  display: grid;
  gap: 5px;
  max-width: 520px;
  padding-top: 6px;
}

.task-context-summary-header,
.task-context-summary-row,
.task-context-summary-links {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.task-context-summary-header {
  justify-content: space-between;
}

.task-context-summary-label {
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.task-context-summary-select {
  max-width: 300px;
  min-height: 28px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-2);
  color: var(--text);
  padding: 0 7px;
  font-size: var(--font-xs);
}

.task-context-summary-row strong {
  font-size: var(--font-sm);
}

.task-context-summary-links {
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.task-context-summary-links a {
  color: var(--accent);
  text-decoration: none;
}

.task-context-summary-links a:hover,
.task-context-summary-links a:focus-visible {
  text-decoration: underline;
}

.task-context-summary-muted,
.task-context-summary-warning,
.task-context-summary-error {
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.task-context-summary-warning {
  color: var(--warning-text);
}

.task-context-summary-error {
  color: var(--danger-text);
}
</style>
