<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import {
  ArrowPathIcon,
  BoltIcon,
  CheckCircleIcon,
  NoSymbolIcon,
  PauseCircleIcon,
  PlayIcon,
  PlusIcon,
  SparklesIcon,
  StopIcon,
} from '@heroicons/vue/24/outline';

import type { Project, TaskContext } from '@dev-dashboard/contracts';

import { fetchTaskContexts } from '../api/task-contexts';
import { useAgentNotifications } from '../composables/useAgentNotifications';
import { useAgentProviderStatus } from '../composables/useAgentProviderStatus';
import { useAgentTaskRealtime } from '../composables/useAgentTaskRealtime';
import { useAgentTaskSnapshots } from '../composables/useAgentTaskSnapshots';
import { useAgentTaskUsage } from '../composables/useAgentTaskUsage';
import { useAgentTaskBudget } from '../composables/useAgentTaskBudget';
import { useAgentTaskSupplementalData } from '../composables/useAgentTaskSupplementalData';
import { useAgentTaskHistory } from '../composables/useAgentTaskHistory';
import { useAgentTaskCreation } from '../composables/useAgentTaskCreation';
import { useAgentTaskDeepLink } from '../composables/useAgentTaskDeepLink';
import { useAgentTaskArchive } from '../composables/useAgentTaskArchive';
import { useAgentTaskAttachments } from '../composables/useAgentTaskAttachments';
import { useAgentTaskConversation } from '../composables/useAgentTaskConversation';
import { useAgentTaskDetailReads } from '../composables/useAgentTaskDetailReads';
import { useAgentTaskLifecycle } from '../composables/useAgentTaskLifecycle';
import {
  useAgentTaskApprovals,
  authorizationScopeLabel,
} from '../composables/useAgentTaskApprovals';
import {
  providerDiagnosticAction,
  providerDiagnosticSummary,
} from '../agent-provider-doctor';
import {
  fetchAgentActivity,
  completeAgentTask,
  fetchAgentProviders,
  fetchAgentTaskStatus,
  type AgentActivity,
  type AgentCapability,
  type AgentExecutionResult,
  type AgentLiveEvent,
  type AgentProviderId,
  type AgentProviderStatus,
  type AgentTaskRecord,
  type AgentTaskStatus,
} from '../api/agent-runtime';
import EmptyState from './EmptyState.vue';
import ProjectAgentLiveFeed from './ProjectAgentLiveFeed.vue';
import ProjectAgentTaskHistoryCard from './ProjectAgentTaskHistoryCard.vue';
import ProjectTaskContextSummary from './ProjectTaskContextSummary.vue';
import StatusBadge from './StatusBadge.vue';
import type { StatusBadgeTone } from './status-badge-types';

const props = defineProps<{
  project: Project;
  environmentInstanceId?: string;
  currentBranch?: string;
  initialTaskId?: string;
}>();

const capabilities: Array<{
  id: AgentCapability;
  label: string;
  description: string;
}> = [
  {
    id: 'workspace:write',
    label: 'Alterar arquivos',
    description: 'Permite escrever no workspace do projeto.',
  },
  {
    id: 'git:commit',
    label: 'Criar commit',
    description: 'Permite registrar mudanças no Git.',
  },
  {
    id: 'git:push',
    label: 'Enviar branch',
    description: 'Permite publicar commits no remoto.',
  },
  {
    id: 'github:pull-request',
    label: 'Pull request',
    description: 'Permite criar ou atualizar um PR.',
  },
  {
    id: 'github:merge',
    label: 'Merge',
    description: 'Permite concluir um merge autorizado.',
  },
  {
    id: 'deployment:run',
    label: 'Deployment',
    description: 'Permite iniciar uma execução de deployment.',
  },
  {
    id: 'release:run',
    label: 'Release',
    description: 'Permite iniciar uma release.',
  },
];

const taskContexts = ref<TaskContext[]>([]);
const selectedTaskContextId = ref('');
const selectedTaskId = ref('');
const selectedProviderId = ref<AgentProviderId>('automatic');
const requestedCapabilities = ref<AgentCapability[]>(['workspace:write']);
const status = ref<AgentTaskStatus | null>(null);
const activity = ref<AgentActivity | null>(null);
const latestExecution = ref<AgentExecutionResult | null>(null);
const loading = ref(false);
const mutating = ref(false);
const errorMessage = ref('');
const {
  instruction,
  backlogCandidates,
  backlogSelectionSource,
  backlogAdoptionNotice,
  invalidateCreation,
  resetCreation,
  chooseBacklogIssue,
  createTask,
} = useAgentTaskCreation(
  () => ({
    projectId: props.project.id,
    environmentInstanceId:
      selectedCreateTaskContext.value?.environmentInstanceId ??
      props.environmentInstanceId,
    ...(selectedTaskContextId.value
      ? { taskContextId: selectedTaskContextId.value }
      : {}),
    requestedCapabilities: requestedCapabilities.value,
  }),
  mutating,
  ({ record, contexts }) => {
    replaceTask(record);
    selectedTaskId.value = record.task.id;
    composing.value = false;
    if (contexts) {
      taskContexts.value = contexts;
      selectedTaskContextId.value = record.task.taskContextId ?? '';
    }
    resetAttachments();
    resetConversation();
    resetApprovals();
    resetLifecycle();
    latestExecution.value = null;
  },
  (taskId) => loadTask(taskId),
  (message) => {
    errorMessage.value = message;
  },
  () => {
    errorMessage.value = '';
  },
);
const { archiveCurrent, invalidateArchive } = useAgentTaskArchive(
  () => {
    const record = currentTask.value;
    if (
      !record ||
      record.task.id !== selectedTaskId.value ||
      record.task.projectId !== props.project.id ||
      (status.value && status.value.task.task.id !== record.task.id)
    )
      return null;
    return {
      projectId: props.project.id,
      taskId: record.task.id,
      state: record.task.state,
      archived: Boolean(record.task.archivedAt),
      activeExecution: Boolean(status.value?.activeExecution),
    };
  },
  mutating,
  (archived) => {
    replaceTask(archived);
    if (status.value?.task.task.id === archived.task.id) {
      status.value = { ...status.value, task: archived };
    }
    closeSocket();
  },
  () => refreshHistory(),
  (taskId) => loadTask(taskId),
  (message) => {
    errorMessage.value = message;
  },
  () => {
    errorMessage.value = '';
  },
);
const {
  executing,
  resetLifecycle,
  executeCurrent: submitExecution,
  cancelCurrent,
  retryCurrent,
  recoverCurrent,
} = useAgentTaskLifecycle(
  () => {
    const record = currentTask.value;
    if (
      !record ||
      record.task.id !== selectedTaskId.value ||
      record.task.projectId !== props.project.id ||
      status.value?.task.task.id !== record.task.id
    )
      return null;
    return {
      projectId: props.project.id,
      taskId: record.task.id,
      state: record.task.state,
      runtimeState: status.value.runtime.state,
      activeExecution: Boolean(status.value.activeExecution),
    };
  },
  () => canExecute.value,
  mutating,
  (result) => {
    latestExecution.value = result;
  },
  replaceTask,
  ({ taskId }) => loadTask(taskId),
  (message) => {
    errorMessage.value = message;
  },
  () => {
    errorMessage.value = '';
  },
);
const {
  checkpointInstruction,
  pendingCheckpoint,
  authorizationByCapability,
  authorizationGranted,
  resetApprovals,
  toggleAuthorization,
  resolveCheckpoint,
} = useAgentTaskApprovals(
  () => {
    const record = currentTask.value;
    if (
      !record ||
      record.task.id !== selectedTaskId.value ||
      status.value?.task.task.id !== selectedTaskId.value
    )
      return null;
    return {
      projectId: props.project.id,
      taskId: record.task.id,
      requestedCapabilities: [...record.task.requestedCapabilities],
    };
  },
  activity,
  mutating,
  replaceTask,
  ({ taskId }) => loadTask(taskId),
  (message) => {
    errorMessage.value = message;
  },
  () => {
    errorMessage.value = '';
  },
);
const {
  conversationInstruction,
  conversationTurns,
  conversationSending,
  conversationRevision,
  resetConversation,
  applyLoadedConversation,
  continueCurrentConversation: submitConversation,
} = useAgentTaskConversation(
  () =>
    selectedTaskId.value
      ? { projectId: props.project.id, taskId: selectedTaskId.value }
      : null,
  () => canContinue.value,
  (result) => {
    latestExecution.value = result;
    replaceTask(result.task);
  },
  ({ taskId }) => loadTask(taskId),
  (message) => {
    errorMessage.value = message;
  },
  () => {
    errorMessage.value = '';
  },
);
const {
  attachments,
  selectedAttachmentIds,
  uploadingAttachment,
  resetAttachments,
  attachmentsRevision,
  applyLoadedAttachments,
  attachmentFor,
  addAttachments,
} = useAgentTaskAttachments(
  () =>
    selectedTaskId.value
      ? { projectId: props.project.id, taskId: selectedTaskId.value }
      : null,
  (message) => {
    errorMessage.value = message;
  },
  () => {
    errorMessage.value = '';
  },
);
const { detailWarning, resetTaskDetails, loadTaskDetails } =
  useAgentTaskDetailReads(
    () =>
      selectedTaskId.value
        ? { projectId: props.project.id, taskId: selectedTaskId.value }
        : null,
    conversationRevision,
    attachmentsRevision,
    (nextConversation, target, revision) =>
      applyLoadedConversation(nextConversation, target, revision),
    (nextAttachments, target) =>
      applyLoadedAttachments(nextAttachments, target.projectId, target.taskId),
  );
const {
  providerRefreshing,
  providerOptions,
  currentProvider,
  resetProviders,
  applyLoadedProviders,
  refreshProviders,
} = useAgentProviderStatus(
  () => props.project.id,
  selectedProviderId,
  (message) => {
    errorMessage.value = message;
  },
  () => {
    errorMessage.value = '';
  },
);
const showAllHistory = ref(false);
const composing = ref(false);
const confirmingComplete = ref(false);
const completionNotice = ref('');
type DetailTab =
  'context' | 'attachments' | 'permissions' | 'usage' | 'activity' | 'alerts';
const detailTab = ref<DetailTab>('context');
const detailTabs: Array<{ id: DetailTab; label: string }> = [
  { id: 'context', label: 'Contexto' },
  { id: 'attachments', label: 'Anexos' },
  { id: 'permissions', label: 'Permissões' },
  { id: 'usage', label: 'Consumo' },
  { id: 'activity', label: 'Atividade' },
  { id: 'alerts', label: 'Avisos' },
];
const {
  agentNotificationPreferences,
  publishAgentNotifications,
  toggleAgentNotificationGroup,
} = useAgentNotifications(() => props.project);
const live = ref<{ taskId: string; events: AgentLiveEvent[] } | null>(null);
const liveEvents = computed(() =>
  live.value && live.value.taskId === selectedTaskId.value
    ? live.value.events
    : [],
);
const { applySnapshot } = useAgentTaskSnapshots(
  () =>
    selectedTaskId.value
      ? { projectId: props.project.id, taskId: selectedTaskId.value }
      : null,
  status,
  activity,
  (snapshot) => {
    replaceTask(snapshot.status.task);
    publishAgentNotifications(snapshot);
    live.value = {
      taskId: snapshot.status.task.task.id,
      events: Array.isArray(snapshot.live) ? snapshot.live : [],
    };
  },
);
const {
  socketState,
  connect: connectTaskSocket,
  closeSocket,
} = useAgentTaskRealtime(
  () => ({ projectId: props.project.id, taskId: selectedTaskId.value }),
  applySnapshot,
  (message) => {
    errorMessage.value = message;
  },
);
const { usage, usagePeriod, usageHasMetrics, clearUsage, reloadUsage } =
  useAgentTaskUsage(() =>
    selectedTaskId.value
      ? { projectId: props.project.id, taskId: selectedTaskId.value }
      : null,
  );
const {
  budget,
  budgetTokens,
  budgetCost,
  budgetMode,
  budgetAlertMessage,
  resetBudget,
  reloadBudget,
  saveBudgetChanges,
  clearBudgetChanges,
} = useAgentTaskBudget(
  () =>
    selectedTaskId.value
      ? { projectId: props.project.id, taskId: selectedTaskId.value }
      : null,
  formatTokens,
  formatCost,
);
const {
  supplementalWarning,
  failedSources,
  resetSupplementalData,
  loadSupplementalData,
} = useAgentTaskSupplementalData(
  () =>
    selectedTaskId.value
      ? { projectId: props.project.id, taskId: selectedTaskId.value }
      : null,
  reloadBudget,
  reloadUsage,
);
const {
  tasks,
  historyLoading,
  historyLoaded,
  historyError,
  historyHasMore,
  showArchived,
  setShowArchived,
  resetHistory,
  upsertTask,
  loadFirstPage,
  loadNextPage,
} = useAgentTaskHistory(() => props.project.id);
let generation = 0;
let taskLoadVersion = 0;

function compareTaskPriority(
  left: AgentTaskRecord,
  right: AgentTaskRecord,
): number {
  const actionable = (record: AgentTaskRecord) =>
    record.task.state !== 'completed' && record.task.state !== 'cancelled';
  const priority = Number(actionable(right)) - Number(actionable(left));
  if (priority !== 0) return priority;
  const recent =
    Date.parse(right.task.updatedAt) - Date.parse(left.task.updatedAt);
  return recent || left.task.id.localeCompare(right.task.id);
}

const sortedTasks = computed(() => [...tasks.value].sort(compareTaskPriority));

const selectedTask = computed(
  () =>
    tasks.value.find((record) => record.task.id === selectedTaskId.value) ??
    null,
);

const selectedCreateTaskContext = computed(
  () =>
    taskContexts.value.find(
      (context) => context.id === selectedTaskContextId.value,
    ) ?? null,
);

const boundTaskContext = computed(
  () =>
    taskContexts.value.find(
      (context) => context.id === currentTask.value?.task.taskContextId,
    ) ?? null,
);

const currentTask = computed(() => status.value?.task ?? selectedTask.value);

const showComposer = computed(() => composing.value || !currentTask.value);
const claudeStatus = computed(
  () =>
    providerOptions.value.find((item) => item.providerId === 'claude-code') ??
    null,
);
const claudeReady = computed(
  () => claudeStatus.value?.availability === 'available',
);

const taskStateLabel = computed(() => {
  switch (currentTask.value?.task.state) {
    case 'queued':
      return 'Pronta';
    case 'running':
      return 'Em execução';
    case 'checkpoint':
      return 'Aguardando decisão';
    case 'review':
      return 'Em revisão';
    case 'blocked':
      return 'Bloqueada';
    case 'failed':
      return 'Falhou';
    case 'completed':
      return 'Concluída';
    case 'cancelled':
      return 'Cancelada';
    default:
      return 'Sem task';
  }
});

const taskTone = computed<StatusBadgeTone>(() => {
  switch (currentTask.value?.task.state) {
    case 'running':
    case 'checkpoint':
      return 'warning';
    case 'review':
    case 'completed':
      return 'success';
    case 'blocked':
    case 'failed':
      return 'danger';
    case 'queued':
      return 'info';
    default:
      return 'neutral';
  }
});

const providerTone = (provider: AgentProviderStatus): StatusBadgeTone => {
  if (provider.availability === 'available') return 'success';
  if (provider.availability === 'degraded') return 'warning';
  return 'danger';
};

const providerAvailabilityLabel = (provider: AgentProviderStatus): string => {
  if (provider.availability === 'available') return 'Disponível';
  if (provider.availability === 'degraded') return 'Limitado';
  return 'Indisponível';
};

const canExecute = computed(
  () =>
    currentTask.value?.task.state === 'queued' &&
    status.value?.task.task.id === selectedTaskId.value &&
    !status.value?.activeExecution &&
    !executing.value &&
    !conversationSending.value &&
    !mutating.value &&
    currentProvider.value !== null &&
    currentProvider.value.availability === 'available' &&
    !budget.value?.blocking,
);

const canCreate = computed(
  () => instruction.value.trim().length > 0 && !mutating.value,
);

const canContinue = computed(
  () =>
    currentTask.value?.task.state === 'review' &&
    conversationInstruction.value.trim().length > 0 &&
    !executing.value &&
    !conversationSending.value &&
    !mutating.value &&
    status.value?.task.task.id === selectedTaskId.value &&
    !status.value?.activeExecution &&
    currentProvider.value !== null &&
    currentProvider.value.availability === 'available' &&
    !budget.value?.blocking,
);

const backlogSelectionMessage = computed(() => {
  if (!backlogSelectionSource.value) return '';
  if (backlogSelectionSource.value === 'no-eligible-issues') {
    return 'Nenhuma issue aberta elegível foi encontrada no backlog.';
  }
  if (backlogSelectionSource.value === 'priority-tie') {
    return 'Mais de uma issue possui a mesma prioridade explícita. Escolha uma delas.';
  }
  return 'Não existe prioridade explícita suficiente para escolher uma única issue. Escolha uma candidata.';
});

const backlogAdoptionSourceLabel = computed(() => {
  const source = backlogAdoptionNotice.value?.source;
  if (!source) return '';
  if (source === 'specific-issue') return 'issue informada explicitamente';
  if (source.startsWith('label:')) {
    return 'prioridade explícita ' + source.slice('label:'.length);
  }
  return source;
});

const recentEvents = computed(() =>
  [...(activity.value?.events ?? [])].reverse().slice(0, 12),
);

const recentEvidence = computed(() =>
  [...(activity.value?.evidence ?? [])].reverse().slice(0, 8),
);

function formatTokens(value: number | undefined): string {
  if (value === undefined) return '—';
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
  if (value >= 1_000) return (value / 1_000).toFixed(1) + 'k';
  return String(value);
}

function formatDuration(value: number | undefined): string {
  if (value === undefined) return '—';
  if (value < 1_000) return value + ' ms';
  return (value / 1_000).toFixed(value >= 10_000 ? 0 : 1) + ' s';
}

function formatCost(value: number | undefined): string {
  if (value === undefined) return 'Indisponível';
  return 'US$ ' + value.toFixed(value < 0.01 ? 4 : 2);
}

function replaceTask(record: AgentTaskRecord): void {
  upsertTask(record);
}

async function loadTask(
  taskId: string,
  requestGeneration = generation,
): Promise<void> {
  const loadVersion = ++taskLoadVersion;
  resetTaskDetails();
  if (!taskId) {
    status.value = null;
    activity.value = null;
    resetConversation();
    resetAttachments();
    resetApprovals();
    resetLifecycle();
    resetBudget();
    closeSocket();
    clearUsage();
    resetSupplementalData();
    return;
  }

  loadSupplementalData();
  try {
    const [nextStatus, nextActivity] = await Promise.all([
      fetchAgentTaskStatus(props.project.id, taskId),
      fetchAgentActivity(props.project.id, taskId),
    ]);
    if (
      requestGeneration !== generation ||
      loadVersion !== taskLoadVersion ||
      selectedTaskId.value !== taskId
    ) {
      return;
    }
    const snapshotResult = applySnapshot({
      status: nextStatus,
      activity: nextActivity,
    });
    if (snapshotResult === 'invalid') {
      throw new Error(
        'Resposta de status inconsistente para a task selecionada.',
      );
    }
    if (snapshotResult === 'stale') return;
    connectTaskSocket(props.project.id, taskId);
    loadTaskDetails();
  } catch (error) {
    if (
      requestGeneration !== generation ||
      loadVersion !== taskLoadVersion ||
      selectedTaskId.value !== taskId
    )
      return;
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar a task do Agente.';
  }
}

async function load(): Promise<void> {
  const requestGeneration = ++generation;
  loading.value = true;
  errorMessage.value = '';
  closeSocket();
  clearUsage();
  resetBudget();
  resetSupplementalData();
  resetTaskDetails();
  resetHistory();
  resetCreation();
  invalidateArchive();
  resetProviders();
  resetAttachments();
  resetConversation();
  resetApprovals();
  resetLifecycle();
  showAllHistory.value = false;
  composing.value = false;
  confirmingComplete.value = false;
  completionNotice.value = '';
  taskLoadVersion += 1;
  selectedTaskId.value = '';
  status.value = null;
  activity.value = null;

  try {
    const [nextProviders, nextTasks, nextTaskContexts] = await Promise.all([
      fetchAgentProviders(),
      loadFirstPage(),
      fetchTaskContexts(props.project.id),
    ]);
    if (requestGeneration !== generation) return;
    applyLoadedProviders(nextProviders, props.project.id);
    taskContexts.value = nextTaskContexts;

    const matchingContext =
      nextTaskContexts.find(
        (context) =>
          context.environmentInstanceId === props.environmentInstanceId &&
          (!props.currentBranch || context.branch === props.currentBranch),
      ) ??
      nextTaskContexts.find(
        (context) =>
          !props.currentBranch || context.branch === props.currentBranch,
      ) ??
      nextTaskContexts[0];
    selectedTaskContextId.value = matchingContext?.id ?? '';

    const provider = nextProviders.find(
      (item) =>
        item.providerId === selectedProviderId.value &&
        item.availability !== 'unavailable',
    );
    if (!provider) {
      selectedProviderId.value =
        nextProviders.find((item) => item.availability === 'available')
          ?.providerId ?? 'automatic';
    }

    const sorted = [...nextTasks].sort(compareTaskPriority);
    const active =
      sorted.find((record) =>
        [
          'queued',
          'running',
          'checkpoint',
          'review',
          'blocked',
          'failed',
        ].includes(record.task.state),
      ) ?? sorted[0];

    // A route-driven selection may already be loading while the first page
    // resolves. Do not replace it with the default task or start a second GET.
    if (!selectedTaskId.value) {
      const taskId = props.initialTaskId || active?.task.id || '';
      selectedTaskId.value = taskId;
      if (taskId) await loadTask(taskId, requestGeneration);
    }
  } catch (error) {
    if (requestGeneration !== generation) return;
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar o Agent Runtime.';
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}

async function refreshHistory(): Promise<void> {
  const pinned = currentTask.value;
  try {
    await loadFirstPage();
    if (pinned) replaceTask(pinned);
  } catch {
    // The history composable presents a retryable error independently.
  }
}

async function retryHistory(): Promise<void> {
  // A failed next-page query keeps the cursor and cached tasks intact.
  // Only an initial-load failure needs to restart from the first page.
  if (historyLoaded.value && historyHasMore.value) {
    await loadNextPage();
  } else {
    await refreshHistory();
  }
}

async function toggleArchivedHistory(): Promise<void> {
  const pinned = currentTask.value;
  const requestProject = props.project.id;
  try {
    await setShowArchived(!showArchived.value);
    if (requestProject === props.project.id && pinned) replaceTask(pinned);
  } catch {
    // The paginated history exposes its own error and retry control.
  }
}

function expandHistory(): void {
  showAllHistory.value = true;
  if (sortedTasks.value.length <= 5 && historyHasMore.value) {
    void loadNextPage();
  }
}

function reconnectTaskRealtime(): void {
  // Restore observation only for the canonical task currently displayed.
  // No execution or conversation request is replayed on reconnect.
  const taskId = selectedTaskId.value;
  const task = status.value?.task.task;
  if (
    socketState.value !== 'disconnected' ||
    !taskId ||
    task?.id !== taskId ||
    task.projectId !== props.project.id
  ) {
    return;
  }
  connectTaskSocket(props.project.id, taskId);
}

async function selectTask(taskId: string): Promise<void> {
  composing.value = false;
  confirmingComplete.value = false;
  completionNotice.value = '';
  invalidateCreation();
  invalidateArchive();
  selectedTaskId.value = taskId;
  closeSocket();
  clearUsage();
  resetBudget();
  resetSupplementalData();
  resetTaskDetails();
  status.value = null;
  activity.value = null;
  resetConversation();
  resetAttachments();
  resetApprovals();
  resetLifecycle();
  latestExecution.value = null;
  errorMessage.value = '';
  await loadTask(taskId);
}

async function executeCurrent(): Promise<void> {
  await submitExecution({
    providerId: selectedProviderId.value,
    attachmentIds: [...selectedAttachmentIds.value],
  });
}

function startNewTask(): void {
  composing.value = true;
  errorMessage.value = '';
}

/** Cria a task e já executa; se a criação não gerar uma task (ex.: backlog ambíguo), para aí. */
async function createAndRun(): Promise<void> {
  const before = selectedTaskId.value;
  await createTask();
  if (selectedTaskId.value === before || !canExecute.value) return;
  await executeCurrent();
}

async function completeCurrent(): Promise<void> {
  const record = currentTask.value;
  if (!record || mutating.value) return;
  mutating.value = true;
  errorMessage.value = '';
  try {
    const result = await completeAgentTask(props.project.id, record.task.id);
    replaceTask(result.task);
    confirmingComplete.value = false;
    completionNotice.value = result.cleanup.diagnostic
      ? 'Task concluída. ' + result.cleanup.diagnostic
      : 'Task concluída.';
    await loadTask(record.task.id);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível concluir a task.';
  } finally {
    mutating.value = false;
  }
}

async function continueCurrentConversation(): Promise<void> {
  await submitConversation({
    providerId: selectedProviderId.value,
    attachmentIds: [...selectedAttachmentIds.value],
  });
}

async function changeUsagePeriod(): Promise<void> {
  const taskId = currentTask.value?.task.id;
  if (!taskId) return;
  try {
    await reloadUsage();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar o período de usage.';
  }
}

async function saveBudget(): Promise<void> {
  if (!currentTask.value || mutating.value) return;
  mutating.value = true;
  errorMessage.value = '';
  try {
    await saveBudgetChanges();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível salvar o budget.';
  } finally {
    mutating.value = false;
  }
}

async function clearBudget(): Promise<void> {
  if (!currentTask.value || mutating.value) return;
  mutating.value = true;
  errorMessage.value = '';
  try {
    await clearBudgetChanges();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível remover o budget.';
  } finally {
    mutating.value = false;
  }
}

function handleComposerKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    void (claudeReady.value ? createAndRun() : createTask());
  }
}

function handleConversationKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    void continueCurrentConversation();
  }
}

useAgentTaskDeepLink(
  () => props.initialTaskId,
  () => selectedTaskId.value,
  selectTask,
);

watch(
  () => props.project.id,
  () => {
    void load();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  generation += 1;
  closeSocket();
  clearUsage();
  resetBudget();
  resetSupplementalData();
  resetTaskDetails();
  resetHistory();
  resetCreation();
  invalidateArchive();
  resetProviders();
  resetAttachments();
  resetConversation();
  resetApprovals();
  resetLifecycle();
});
</script>

<template>
  <section class="ag-panel" aria-label="Agente do projeto">
    <header class="ag-header">
      <div class="ag-title">
        <span class="ag-title-icon" aria-hidden="true"><SparklesIcon /></span>
        <div>
          <h2>Agente</h2>
          <p>Claude Code trabalhando no seu projeto, com você no controle.</p>
        </div>
      </div>
      <div class="ag-status">
        <span
          class="ag-chip"
          :class="
            'ag-chip-' + (claudeStatus ? providerTone(claudeStatus) : 'danger')
          "
          :title="claudeStatus?.diagnostic?.evidence ?? claudeStatus?.reason"
        >
          <span class="ag-dot" aria-hidden="true" />
          Claude Code
          <small v-if="claudeStatus?.version">{{ claudeStatus.version }}</small>
          <strong>{{
            claudeStatus
              ? providerAvailabilityLabel(claudeStatus)
              : 'Indisponível'
          }}</strong>
        </span>
        <span
          v-if="selectedTaskId"
          class="ag-chip"
          :class="
            socketState === 'connected' ? 'ag-chip-success' : 'ag-chip-neutral'
          "
        >
          <span class="ag-dot" aria-hidden="true" />
          {{ socketState === 'connected' ? 'Ao vivo' : 'Sem tempo real' }}
          <button
            v-if="socketState === 'disconnected' && currentTask"
            type="button"
            class="ag-link"
            @click="reconnectTaskRealtime"
          >
            Reconectar
          </button>
        </span>
        <button
          class="ag-icon-button"
          type="button"
          title="Revalidar o Claude Code"
          aria-label="Revalidar o Claude Code"
          :disabled="providerRefreshing || executing"
          @click="refreshProviders"
        >
          <ArrowPathIcon
            :class="{ 'ag-spin': providerRefreshing }"
            aria-hidden="true"
          />
        </button>
      </div>
    </header>

    <p
      v-if="claudeStatus && claudeStatus.availability !== 'available'"
      class="ag-banner"
      role="alert"
    >
      <strong>{{
        providerDiagnosticSummary(claudeStatus.diagnostic?.code)
      }}</strong>
      {{ providerDiagnosticAction(claudeStatus.diagnostic?.code) }}
    </p>

    <EmptyState
      v-if="loading"
      class="agent-empty"
      icon="•••"
      title="Carregando o Agente"
      description="Recuperando tasks e o estado do Claude Code."
    />

    <div v-else class="ag-layout" :class="{ 'ag-layout-wide': showComposer }">
      <aside class="ag-sidebar">
        <button
          class="primary-button ag-new"
          type="button"
          @click="startNewTask"
        >
          <PlusIcon aria-hidden="true" />
          Nova task
        </button>
        <ProjectAgentTaskHistoryCard
          class="ag-history"
          :tasks="sortedTasks"
          :selected-task-id="showComposer ? '' : selectedTaskId"
          :show-archived="showArchived"
          :show-all-history="showAllHistory"
          :history-has-more="historyHasMore"
          :history-loading="historyLoading"
          :history-loaded="historyLoaded"
          :history-error="historyError"
          @toggle-archived="toggleArchivedHistory"
          @expand="expandHistory"
          @load-more="loadNextPage"
          @collapse="showAllHistory = false"
          @retry="retryHistory"
          @select="selectTask"
        />
      </aside>

      <main class="ag-main">
        <div v-if="errorMessage" class="ag-error" role="alert">
          <span>{{ errorMessage }}</span>
          <button type="button" @click="errorMessage = ''">Fechar</button>
        </div>

        <section v-if="showComposer" class="ag-card ag-composer">
          <h3>O que o Claude deve fazer?</h3>
          <p class="ag-muted">
            Descreva a tarefa. Quanto mais contexto, melhor o resultado — cite
            arquivos, comportamento esperado e o que não deve mudar.
          </p>
          <textarea
            v-model="instruction"
            rows="5"
            maxlength="4000"
            placeholder="Ex.: Adicionar um player de música com controle de volume e playlists…"
            aria-label="Instrução para nova task do Agente"
            @keydown="handleComposerKeydown"
          />
          <div class="ag-composer-meta">
            <span>{{ instruction.length }}/4000</span>
            <kbd>Ctrl + Enter</kbd>
          </div>

          <div v-if="backlogSelectionSource" class="ag-backlog" role="status">
            <strong>{{ backlogSelectionMessage }}</strong>
            <button
              v-for="candidate in backlogCandidates"
              :key="candidate.repository + '#' + candidate.number"
              type="button"
              @click="chooseBacklogIssue(candidate)"
            >
              <span>#{{ candidate.number }}</span>
              {{ candidate.title }}
            </button>
          </div>
          <div v-if="backlogAdoptionNotice" class="ag-backlog" role="status">
            <strong>
              #{{ backlogAdoptionNotice.issue.number }} ·
              {{ backlogAdoptionNotice.issue.title }}
            </strong>
            <span>Seleção: {{ backlogAdoptionSourceLabel }}</span>
          </div>

          <div class="ag-options">
            <label class="ag-field">
              <span>Vincular a</span>
              <select
                v-model="selectedTaskContextId"
                aria-label="Task Context da nova task"
              >
                <option value="">Projeto (sem vínculo)</option>
                <option
                  v-for="context in taskContexts"
                  :key="context.id"
                  :value="context.id"
                >
                  {{ context.branch }}
                  · {{ context.worktreeId ? 'worktree' : 'primary' }}
                  <template v-if="context.issue">
                    · issue #{{ context.issue.number }}
                  </template>
                </option>
              </select>
            </label>

            <fieldset class="ag-permissions">
              <legend>Permissões</legend>
              <label class="ag-check">
                <input
                  v-model="requestedCapabilities"
                  type="checkbox"
                  value="workspace:write"
                />
                <span>
                  <strong>Alterar arquivos</strong>
                  <small>
                    Desmarcado, o Claude só lê e analisa — não edita nada.
                  </small>
                </span>
              </label>
              <details>
                <summary>Mais permissões (Git, PR, deploy…)</summary>
                <label
                  v-for="capability in capabilities.slice(1)"
                  :key="capability.id"
                  class="ag-check"
                >
                  <input
                    v-model="requestedCapabilities"
                    type="checkbox"
                    :value="capability.id"
                  />
                  <span>
                    <strong>{{ capability.label }}</strong>
                    <small>{{ capability.description }}</small>
                  </span>
                </label>
              </details>
            </fieldset>
          </div>

          <div class="ag-composer-actions">
            <button
              class="secondary-button"
              type="button"
              :disabled="!canCreate"
              @click="createTask"
            >
              Só criar
            </button>
            <button
              class="primary-button"
              type="button"
              :disabled="!canCreate || !claudeReady"
              :title="
                claudeReady ? undefined : 'O Claude Code não está disponível.'
              "
              @click="createAndRun"
            >
              <BoltIcon aria-hidden="true" />
              Executar
            </button>
          </div>
        </section>

        <template v-else-if="currentTask">
          <header class="ag-card ag-task-head">
            <div class="ag-task-title">
              <StatusBadge :tone="taskTone">{{ taskStateLabel }}</StatusBadge>
              <h3>{{ currentTask.task.summary }}</h3>
              <p v-if="currentTask.task.archivedAt" class="ag-muted">
                Arquivada · conversa e auditoria preservadas.
              </p>
            </div>
            <div class="ag-task-actions">
              <button
                v-if="currentTask.task.state === 'queued'"
                class="primary-button"
                type="button"
                :disabled="!canExecute"
                @click="executeCurrent"
              >
                <PlayIcon aria-hidden="true" />
                {{ executing ? 'Executando…' : 'Executar' }}
              </button>
              <button
                v-if="status?.activeExecution"
                class="secondary-button ag-danger"
                type="button"
                :disabled="mutating"
                @click="cancelCurrent"
              >
                <StopIcon aria-hidden="true" />
                Parar
              </button>
              <button
                v-if="currentTask.task.state === 'failed'"
                class="secondary-button"
                type="button"
                :disabled="mutating"
                @click="retryCurrent"
              >
                <ArrowPathIcon aria-hidden="true" />
                Tentar de novo
              </button>
              <button
                v-if="
                  status?.runtime.state === 'interrupted' ||
                  currentTask.task.state === 'blocked'
                "
                class="secondary-button"
                type="button"
                :disabled="mutating"
                @click="recoverCurrent"
              >
                <ArrowPathIcon aria-hidden="true" />
                Recuperar
              </button>
              <RouterLink
                class="secondary-button link-button"
                :to="{ name: 'project-git', params: { projectId: project.id } }"
              >
                Ver diff
              </RouterLink>
              <RouterLink
                class="secondary-button link-button"
                :to="{
                  name: 'project-tests',
                  params: { projectId: project.id },
                  ...(environmentInstanceId
                    ? { query: { environmentInstanceId } }
                    : {}),
                }"
              >
                Ver testes
              </RouterLink>
              <template v-if="currentTask.task.state === 'review'">
                <button
                  v-if="!confirmingComplete"
                  class="secondary-button"
                  type="button"
                  :disabled="mutating || !!status?.activeExecution"
                  @click="confirmingComplete = true"
                >
                  <CheckCircleIcon aria-hidden="true" />
                  Concluir
                </button>
                <template v-else>
                  <button
                    class="primary-button"
                    type="button"
                    :disabled="mutating"
                    @click="completeCurrent"
                  >
                    Confirmar conclusão
                  </button>
                  <button
                    class="secondary-button"
                    type="button"
                    @click="confirmingComplete = false"
                  >
                    Cancelar
                  </button>
                </template>
              </template>
              <button
                v-if="
                  ['completed', 'cancelled'].includes(currentTask.task.state) &&
                  !currentTask.task.archivedAt &&
                  !status?.activeExecution
                "
                class="secondary-button"
                type="button"
                :disabled="mutating"
                @click="archiveCurrent"
              >
                Arquivar
              </button>
            </div>
          </header>

          <p
            v-if="completionNotice"
            class="ag-banner ag-banner-info"
            role="status"
          >
            {{ completionNotice }}
          </p>
          <p
            v-if="budgetAlertMessage && budget?.blocking"
            class="ag-banner"
            role="alert"
          >
            {{ budgetAlertMessage }} · Nova execução bloqueada até ajustar ou
            remover o limite (aba Consumo).
          </p>

          <ProjectAgentLiveFeed
            v-if="liveEvents.length > 0 || status?.runtime.state === 'running'"
            :events="liveEvents"
            :running="status?.runtime.state === 'running'"
          />

          <section
            v-if="pendingCheckpoint"
            class="ag-card ag-checkpoint"
            aria-label="Checkpoint pendente"
          >
            <div class="ag-checkpoint-head">
              <PauseCircleIcon aria-hidden="true" />
              <div>
                <strong>O Claude precisa de uma decisão</strong>
                <p>{{ pendingCheckpoint.summary }}</p>
              </div>
              <StatusBadge tone="warning">Ação necessária</StatusBadge>
            </div>
            <p
              v-if="pendingCheckpoint.requiredCapabilities.length"
              class="ag-muted"
            >
              Requer:
              <code
                v-for="capability in pendingCheckpoint.requiredCapabilities"
                :key="capability"
              >
                {{ capability }}
              </code>
            </p>
            <textarea
              v-model="checkpointInstruction"
              :disabled="mutating"
              rows="2"
              maxlength="4000"
              placeholder="Instrução opcional para continuar…"
              aria-label="Instrução de continuação do checkpoint"
            />
            <div class="ag-composer-actions">
              <button
                class="secondary-button"
                type="button"
                :disabled="mutating"
                @click="resolveCheckpoint('rejected')"
              >
                <NoSymbolIcon aria-hidden="true" />
                Rejeitar
              </button>
              <button
                class="primary-button"
                type="button"
                :disabled="mutating"
                @click="resolveCheckpoint('approved')"
              >
                <CheckCircleIcon aria-hidden="true" />
                Aprovar e continuar
              </button>
            </div>
          </section>

          <section
            class="ag-card ag-conversation"
            aria-label="Conversa da task"
          >
            <div
              v-if="detailWarning"
              class="ag-banner ag-banner-info"
              role="status"
            >
              {{ detailWarning }}
              <button type="button" class="ag-link" @click="loadTaskDetails">
                Recarregar
              </button>
            </div>
            <p
              v-if="!conversationTurns.length && !detailWarning"
              class="ag-muted"
            >
              Ainda não há mensagens nesta task. Clique em Executar para o
              Claude começar.
            </p>
            <ol v-else class="ag-turns">
              <li
                v-for="turn in conversationTurns"
                :key="turn.id"
                class="ag-turn"
                :class="{ 'ag-turn-user': turn.role === 'user' }"
              >
                <div class="ag-turn-meta">
                  <strong>{{
                    turn.role === 'user' ? 'Você' : 'Claude'
                  }}</strong>
                  <small>{{ new Date(turn.createdAt).toLocaleString() }}</small>
                </div>
                <p>{{ turn.content }}</p>
                <small v-if="turn.attachmentIds?.length" class="ag-muted">
                  Anexos:
                  {{
                    turn.attachmentIds
                      .map((id) => attachmentFor(id)?.filename ?? id)
                      .join(', ')
                  }}
                </small>
              </li>
            </ol>

            <div v-if="currentTask.task.state === 'review'" class="ag-reply">
              <textarea
                v-model="conversationInstruction"
                rows="3"
                maxlength="16000"
                placeholder="Peça um ajuste ou continue a conversa…"
                aria-label="Instrução para continuar a task do Agente"
                :disabled="executing || conversationSending || mutating"
                @keydown="handleConversationKeydown"
              />
              <div class="ag-composer-actions">
                <span class="ag-muted">
                  Usa a mesma sessão do Claude e as mesmas permissões da task.
                </span>
                <button
                  class="primary-button"
                  type="button"
                  :disabled="!canContinue"
                  @click="continueCurrentConversation"
                >
                  <BoltIcon aria-hidden="true" />
                  {{ conversationSending ? 'Executando…' : 'Enviar' }}
                </button>
              </div>
            </div>
            <p v-else-if="conversationTurns.length" class="ag-muted">
              Você poderá responder quando a task chegar em revisão.
            </p>
          </section>
        </template>
      </main>

      <aside v-if="currentTask && !showComposer" class="ag-details">
        <nav class="ag-tabs" role="tablist" aria-label="Detalhes da task">
          <button
            v-for="tab in detailTabs"
            :key="tab.id"
            type="button"
            role="tab"
            :aria-selected="detailTab === tab.id"
            :class="{ 'is-active': detailTab === tab.id }"
            @click="detailTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </nav>

        <div v-if="detailTab === 'context'" class="ag-tab">
          <ProjectTaskContextSummary
            :project-id="project.id"
            :current-branch="boundTaskContext?.branch ?? currentBranch"
            :environment-instance-id="
              currentTask.task.environmentInstanceId ?? environmentInstanceId
            "
            :task-context-id="currentTask.task.taskContextId"
          />
        </div>

        <div v-else-if="detailTab === 'attachments'" class="ag-tab">
          <label class="ag-field">
            <span>Adicionar arquivo</span>
            <input
              type="file"
              multiple
              accept=".txt,.log,.md,.json,image/png,image/jpeg,image/webp"
              :disabled="uploadingAttachment || attachments.length >= 8"
              @change="addAttachments"
            />
          </label>
          <p class="ag-muted">
            Até 8 arquivos, 1 MB cada (texto, Markdown, JSON, PNG, JPEG, WebP).
            O conteúdo é tratado como dado não confiável. Marque os que o Claude
            deve receber na próxima execução.
          </p>
          <p v-if="!attachments.length" class="ag-muted">
            Nenhum anexo nesta task.
          </p>
          <label
            v-for="attachment in attachments"
            :key="attachment.id"
            class="ag-check ag-row"
          >
            <input
              v-model="selectedAttachmentIds"
              type="checkbox"
              :value="attachment.id"
            />
            <span>
              <strong>{{ attachment.filename }}</strong>
              <small>
                {{ attachment.mediaType }} ·
                {{ Math.ceil(attachment.byteSize / 1024) }} KB
              </small>
            </span>
          </label>
        </div>

        <div v-else-if="detailTab === 'permissions'" class="ag-tab">
          <p
            v-if="!currentTask.task.requestedCapabilities.length"
            class="ag-muted"
          >
            Esta task não pediu permissões protegidas: o Claude só lê e analisa.
          </p>
          <div
            v-for="capability in currentTask.task.requestedCapabilities"
            :key="capability"
            class="ag-row"
          >
            <span>
              <strong>{{ capability }}</strong>
              <small>
                {{
                  authorizationGranted(capability)
                    ? 'Concedida'
                    : 'Não concedida'
                }}
                <template
                  v-if="authorizationByCapability.get(capability)?.scope"
                >
                  ·
                  {{
                    authorizationScopeLabel(
                      authorizationByCapability.get(capability)?.scope,
                    )
                  }}
                </template>
              </small>
            </span>
            <button
              class="secondary-button"
              type="button"
              :disabled="mutating"
              @click="
                toggleAuthorization(
                  capability,
                  !authorizationGranted(capability),
                )
              "
            >
              {{ authorizationGranted(capability) ? 'Revogar' : 'Autorizar' }}
            </button>
          </div>
        </div>

        <div v-else-if="detailTab === 'usage'" class="ag-tab">
          <label class="ag-field">
            <span>Período</span>
            <select v-model="usagePeriod" @change="changeUsagePeriod">
              <option value="all">Todo período</option>
              <option value="24h">Últimas 24h</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
            </select>
          </label>
          <p v-if="supplementalWarning" class="ag-muted" role="status">
            {{ supplementalWarning }}
            <button type="button" class="ag-link" @click="loadSupplementalData">
              Recarregar
            </button>
          </p>
          <dl class="ag-stats">
            <div>
              <dt>Execuções</dt>
              <dd>{{ usage?.total.executionCount ?? 0 }}</dd>
            </div>
            <div>
              <dt>Entrada</dt>
              <dd>{{ formatTokens(usage?.total.inputTokens) }}</dd>
            </div>
            <div>
              <dt>Cache</dt>
              <dd>{{ formatTokens(usage?.total.cachedInputTokens) }}</dd>
            </div>
            <div>
              <dt>Saída</dt>
              <dd>{{ formatTokens(usage?.total.outputTokens) }}</dd>
            </div>
            <div>
              <dt>Duração</dt>
              <dd>{{ formatDuration(usage?.total.durationMs) }}</dd>
            </div>
            <div>
              <dt>Custo</dt>
              <dd>
                {{
                  formatCost(
                    usage?.total.reportedCostUsd ??
                      usage?.total.estimatedCostUsd,
                  )
                }}
              </dd>
            </div>
          </dl>
          <p v-if="usage && !usageHasMetrics" class="ag-muted">
            O Claude não reportou telemetria confiável para esta task.
          </p>

          <h4>Limite da task</h4>
          <label class="ag-field">
            <span>Modo</span>
            <select v-model="budgetMode">
              <option value="soft">Soft · só avisa</option>
              <option value="hard">Hard · bloqueia nova execução</option>
            </select>
          </label>
          <label class="ag-field">
            <span>Total de tokens</span>
            <input
              v-model="budgetTokens"
              type="number"
              min="1"
              step="1"
              placeholder="Sem limite"
            />
          </label>
          <label class="ag-field">
            <span>Custo estimado (US$)</span>
            <input
              v-model="budgetCost"
              type="number"
              min="0"
              step="0.01"
              placeholder="Sem limite"
            />
          </label>
          <div class="ag-composer-actions">
            <button
              v-if="budget?.budget"
              class="secondary-button"
              type="button"
              :disabled="mutating || failedSources.includes('budget')"
              @click="clearBudget"
            >
              Remover
            </button>
            <button
              class="secondary-button"
              type="button"
              :disabled="mutating || failedSources.includes('budget')"
              @click="saveBudget"
            >
              Salvar limite
            </button>
          </div>
          <p v-if="budgetAlertMessage" class="ag-muted">
            {{ budgetAlertMessage }}
          </p>
        </div>

        <div v-else-if="detailTab === 'activity'" class="ag-tab">
          <h4>Eventos</h4>
          <p v-if="!recentEvents.length" class="ag-muted">
            Ainda não há eventos registrados.
          </p>
          <ol v-else class="ag-timeline">
            <li v-for="event in recentEvents" :key="event.id">
              <span>{{ event.type }}</span>
              <strong>{{ event.summary }}</strong>
              <small>{{ new Date(event.occurredAt).toLocaleString() }}</small>
            </li>
          </ol>
          <h4>Evidências</h4>
          <p v-if="!recentEvidence.length" class="ag-muted">
            Nenhuma evidência registrada nesta task.
          </p>
          <ol v-else class="ag-timeline">
            <li v-for="evidence in recentEvidence" :key="evidence.id">
              <span>{{ evidence.kind }}</span>
              <strong>{{ evidence.summary }}</strong>
              <small v-if="evidence.reference">{{ evidence.reference }}</small>
            </li>
          </ol>
          <p class="ag-muted">
            Tentativas: {{ status?.runtime.attempts ?? 0 }} · Runtime:
            {{ status?.runtime.state ?? 'idle' }}
          </p>
        </div>

        <div v-else class="ag-tab">
          <p class="ag-muted">
            Avisos do navegador quando a task precisar de você.
          </p>
          <label class="ag-check ag-row">
            <input
              type="checkbox"
              :checked="
                agentNotificationPreferences.checkpoint &&
                agentNotificationPreferences.authorization
              "
              @change="
                toggleAgentNotificationGroup(
                  ['checkpoint', 'authorization'],
                  $event,
                )
              "
            />
            <span>
              <strong>Decisão necessária</strong>
              <small>Checkpoint ou autorização pendente.</small>
            </span>
          </label>
          <label class="ag-check ag-row">
            <input
              type="checkbox"
              :checked="
                agentNotificationPreferences.failed &&
                agentNotificationPreferences.recovery
              "
              @change="
                toggleAgentNotificationGroup(['failed', 'recovery'], $event)
              "
            />
            <span>
              <strong>Falha ou recuperação</strong>
              <small>A task bloqueou, falhou ou precisa de recuperação.</small>
            </span>
          </label>
          <label class="ag-check ag-row">
            <input
              type="checkbox"
              :checked="agentNotificationPreferences.completed"
              @change="toggleAgentNotificationGroup(['completed'], $event)"
            />
            <span>
              <strong>Conclusão</strong>
              <small>A task foi concluída.</small>
            </span>
          </label>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.ag-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  padding: var(--page-gutter, 16px);
}

.ag-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ag-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ag-title h2 {
  margin: 0;
  font-size: 20px;
}

.ag-title p {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}

.ag-title-icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 12px;
  color: var(--accent);
  background: var(--accent-soft);
}

.ag-title-icon svg {
  width: 22px;
  height: 22px;
}

.ag-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.ag-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-1);
  font-size: 12.5px;
}

.ag-chip small {
  color: var(--text-dim);
}

.ag-chip strong {
  color: var(--text);
  font-weight: 600;
}

.ag-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-dim);
}

.ag-chip-success .ag-dot {
  background: var(--success-text);
}

.ag-chip-warning .ag-dot {
  background: var(--warning-text);
}

.ag-chip-danger .ag-dot {
  background: var(--danger-text);
}

.ag-icon-button {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 50%;
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
}

.ag-icon-button:hover:not(:disabled) {
  color: var(--text);
  background: var(--surface-2);
}

.ag-icon-button svg {
  width: 16px;
  height: 16px;
}

.ag-spin {
  animation: ag-rotate 0.9s linear infinite;
}

@keyframes ag-rotate {
  to {
    transform: rotate(360deg);
  }
}

.ag-link {
  padding: 0;
  border: 0;
  color: var(--accent);
  background: transparent;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.ag-banner {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 10px 14px;
  border: 1px solid var(--warning-text);
  border-radius: 10px;
  color: var(--warning-text);
  background: color-mix(in srgb, var(--warning-text) 10%, transparent);
  font-size: 13px;
}

.ag-banner-info {
  border-color: var(--border);
  color: var(--text-muted);
  background: var(--surface-1);
}

.ag-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 340px;
  gap: 16px;
  align-items: start;
}

.ag-layout-wide {
  grid-template-columns: 260px minmax(0, 1fr);
}

.ag-sidebar,
.ag-details {
  position: sticky;
  top: var(--project-sticky-offset, 72px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: calc(100vh - 96px);
  overflow-y: auto;
}

.ag-new {
  justify-content: center;
}

.ag-new svg {
  width: 16px;
  height: 16px;
}

.ag-history {
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-1);
}

.ag-main {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.ag-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.ag-card h3 {
  margin: 0;
  font-size: 16px;
}

.ag-muted {
  margin: 0;
  color: var(--text-muted);
  font-size: 12.5px;
  line-height: 1.5;
}

.ag-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--danger-text);
  border-radius: 10px;
  color: var(--danger-text);
  background: var(--danger-surface);
  font-size: 13px;
}

.ag-error button {
  border: 0;
  color: inherit;
  background: transparent;
  text-decoration: underline;
  cursor: pointer;
}

textarea,
.ag-field select,
.ag-field input[type='number'] {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  color: var(--text);
  background: var(--surface-0);
  font: inherit;
  font-size: 14px;
}

textarea {
  min-height: 90px;
  resize: vertical;
  line-height: 1.5;
}

textarea:focus,
.ag-field select:focus,
.ag-field input:focus {
  border-color: var(--accent);
  outline: none;
}

.ag-composer-meta {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  color: var(--text-dim);
  font-size: 12px;
}

.ag-composer-meta kbd {
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  font-size: 11px;
}

.ag-options {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 16px;
}

.ag-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ag-field > span {
  color: var(--text-muted);
  font-size: 12.5px;
  font-weight: 600;
}

.ag-permissions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.ag-permissions legend {
  margin-bottom: 6px;
  padding: 0;
  color: var(--text-muted);
  font-size: 12.5px;
  font-weight: 600;
}

.ag-permissions summary {
  color: var(--text-muted);
  font-size: 12.5px;
  cursor: pointer;
}

.ag-check {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 6px 0;
  font-size: 13px;
  cursor: pointer;
}

.ag-check input {
  margin-top: 3px;
}

.ag-check span {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ag-check small,
.ag-row small {
  color: var(--text-dim);
  font-size: 11.5px;
}

.ag-backlog {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
  font-size: 12.5px;
}

.ag-backlog button {
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text);
  background: var(--surface-2);
  font-size: 12px;
  cursor: pointer;
}

.ag-composer-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.ag-composer-actions .ag-muted {
  margin-right: auto;
}

.ag-task-head {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
}

.ag-task-title {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
  flex: 1 1 320px;
}

.ag-task-title h3 {
  overflow-wrap: anywhere;
  font-size: 17px;
  line-height: 1.4;
}

.ag-task-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ag-task-actions svg {
  width: 16px;
  height: 16px;
}

.ag-danger {
  color: var(--danger-text);
}

.ag-checkpoint {
  border-color: var(--warning-text);
}

.ag-checkpoint-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.ag-checkpoint-head > svg {
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  color: var(--warning-text);
}

.ag-checkpoint-head > div {
  flex: 1;
}

.ag-checkpoint-head p {
  margin: 4px 0 0;
  font-size: 13.5px;
}

.ag-turns {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ag-turn {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 88%;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-0);
}

.ag-turn-user {
  align-self: flex-end;
  border-color: var(--accent);
  background: var(--accent-soft);
}

.ag-turn-meta {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
}

.ag-turn-meta small {
  color: var(--text-dim);
}

.ag-turn p {
  margin: 0;
  overflow-wrap: anywhere;
  font-size: 13.5px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.ag-reply {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
}

.ag-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-1);
}

.ag-tabs button {
  flex: 1 1 auto;
  padding: 6px 10px;
  border: 0;
  border-radius: 8px;
  color: var(--text-muted);
  background: transparent;
  font-size: 12.5px;
  cursor: pointer;
}

.ag-tabs button:hover {
  color: var(--text);
}

.ag-tabs button.is-active {
  color: var(--accent);
  background: var(--accent-soft);
  font-weight: 600;
}

.ag-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.ag-tab h4 {
  margin: 4px 0 0;
  font-size: 13px;
}

.ag-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ag-row > span {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: 13px;
}

.ag-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.ag-stats div {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-0);
}

.ag-stats dt {
  color: var(--text-dim);
  font-size: 11px;
}

.ag-stats dd {
  margin: 2px 0 0;
  font-size: 14px;
  font-weight: 600;
}

.ag-timeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ag-timeline li {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: 12.5px;
}

.ag-timeline li span {
  color: var(--accent);
  font-family: var(--font-family-mono);
  font-size: 11px;
}

.ag-timeline li small {
  color: var(--text-dim);
}

code {
  margin-right: 4px;
  font-family: var(--font-family-mono);
  font-size: 12px;
}

@media (max-width: 1280px) {
  .ag-layout {
    grid-template-columns: 240px minmax(0, 1fr);
  }

  .ag-details {
    position: static;
    grid-column: 1 / -1;
    max-height: none;
  }
}

@media (max-width: 860px) {
  .ag-layout,
  .ag-layout-wide {
    grid-template-columns: minmax(0, 1fr);
  }

  .ag-sidebar {
    position: static;
    max-height: none;
  }

  .ag-options {
    grid-template-columns: minmax(0, 1fr);
  }

  .ag-turn {
    max-width: 100%;
  }
}
</style>
