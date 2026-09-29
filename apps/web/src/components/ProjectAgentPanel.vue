<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import {
  ArrowPathIcon,
  ArrowRightIcon,
  AtSymbolIcon,
  BoltIcon,
  CheckCircleIcon,
  ClockIcon,
  ComputerDesktopIcon,
  CubeIcon,
  DocumentIcon,
  LinkIcon,
  NoSymbolIcon,
  PaperClipIcon,
  PauseCircleIcon,
  PencilSquareIcon,
  PlayIcon,
  PowerIcon,
  PuzzlePieceIcon,
  StopIcon,
} from '@heroicons/vue/24/outline';

import type { Project, TaskContext } from '@dev-dashboard/contracts';

import { fetchTaskContexts } from '../api/task-contexts';
import {
  providerDiagnosticAction,
  providerDiagnosticSummary,
  providerFallbackDiagnostic,
  providerObservedAtLabel,
} from '../agent-provider-doctor';
import {
  agentNotificationCandidates,
  hasSeenAgentNotification,
  markAgentNotificationSeen,
  readAgentNotificationPreferences,
  writeAgentNotificationPreferences,
  type AgentNotificationKind,
} from '../stores/agent-notifications';
import { noticeCenterStore } from '../stores/notice-center';
import {
  adoptAgentBacklog,
  agentRuntimeWebSocketUrl,
  cancelAgentTask,
  clearAgentBudget,
  createAgentAttachment,
  createAgentTask,
  executeAgentConversationTurn,
  executeAgentTask,
  fetchAgentActivity,
  fetchAgentAttachments,
  fetchAgentBudget,
  fetchAgentConversation,
  fetchAgentExecutionProfiles,
  fetchAgentProviders,
  fetchAgentTasks,
  fetchAgentTaskStatus,
  fetchAgentUsage,
  recoverAgentTask,
  resolveAgentCheckpoint,
  retryAgentTask,
  setAgentBudget,
  setAgentAuthorization,
  setAgentExecutionProfiles,
  type AgentActivity,
  type AgentAttachment,
  type AgentAuthorization,
  type AgentAuthorizationScope,
  type AgentBacklogIssue,
  type AgentBudgetOverview,
  type AgentCapability,
  type AgentConversationTurn,
  type AgentExecutionProfile,
  type AgentExecutionProfileConfiguration,
  type AgentExecutionResult,
  type AgentProviderId,
  type AgentProviderStatus,
  type AgentRealtimeSnapshot,
  type AgentTaskRecord,
  type AgentTaskStatus,
  type AgentUsageOverview,
} from '../api/agent-runtime';
import EmptyState from './EmptyState.vue';
import ProjectAgentIntegrationsCard from './ProjectAgentIntegrationsCard.vue';
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

const providers = ref<AgentProviderStatus[]>([]);
const providerIds: AgentProviderId[] = [
  'automatic',
  'codex',
  'claude-code',
  'chatgpt-browser',
];
const tasks = ref<AgentTaskRecord[]>([]);
const taskContexts = ref<TaskContext[]>([]);
const selectedTaskContextId = ref('');
const selectedTaskId = ref('');
const selectedProviderId = ref<AgentProviderId>('automatic');
const requestedCapabilities = ref<AgentCapability[]>(['workspace:write']);
const executionProfiles = ref<AgentExecutionProfileConfiguration | null>(null);
const selectedProfileId = ref('');
const profileIdDraft = ref('');
const profileLabelDraft = ref('');
const profileTimeoutSeconds = ref('');
const profileMaxTokens = ref('');
const profileMaxCost = ref('');
const profileBudgetMode = ref<'soft' | 'hard'>('soft');
const instruction = ref('');
const conversationInstruction = ref('');
const conversationTurns = ref<AgentConversationTurn[]>([]);
const attachments = ref<AgentAttachment[]>([]);
const selectedAttachmentIds = ref<string[]>([]);
const uploadingAttachment = ref(false);
const backlogCandidates = ref<AgentBacklogIssue[]>([]);
const backlogSelectionSource = ref('');
const backlogAdoptionNotice = ref<{
  source: string;
  issue: AgentBacklogIssue;
  reused: boolean;
  taskContextId?: string;
} | null>(null);
const checkpointInstruction = ref('');
const status = ref<AgentTaskStatus | null>(null);
const activity = ref<AgentActivity | null>(null);
const latestExecution = ref<AgentExecutionResult | null>(null);
const usage = ref<AgentUsageOverview | null>(null);
const usagePeriod = ref<'all' | '24h' | '7d' | '30d'>('all');
const budget = ref<AgentBudgetOverview | null>(null);
const budgetTokens = ref('');
const budgetCost = ref('');
const budgetMode = ref<'soft' | 'hard'>('soft');
const loading = ref(false);
const providerRefreshing = ref(false);
const mutating = ref(false);
const executing = ref(false);
const errorMessage = ref('');
const showAllHistory = ref(false);
const providerConfig = ref<HTMLDetailsElement | null>(null);
const integrationsSummary = ref<HTMLDetailsElement | null>(null);
const agentNotificationPreferences = ref(readAgentNotificationPreferences());
const socketState = ref<'idle' | 'connecting' | 'connected' | 'disconnected'>(
  'idle',
);
let generation = 0;
let socket: WebSocket | undefined;

const sortedTasks = computed(() =>
  [...tasks.value].sort((left, right) =>
    right.task.updatedAt.localeCompare(left.task.updatedAt),
  ),
);

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

const providerOptions = computed<AgentProviderStatus[]>(() =>
  providerIds.map(
    (providerId) =>
      providers.value.find(
        (provider) => provider.providerId === providerId,
      ) ?? {
        providerId,
        availability: 'unavailable',
        observedAt: '',
        reason: 'Provider não configurado neste runtime.',
        diagnostic: providerFallbackDiagnostic(providerId),
      },
  ),
);

const lastConcreteProviderId = computed(() => {
  const events = [...(activity.value?.events ?? [])].reverse();
  return events.find(
    (event) => event.type === 'execution-state' && event.providerId,
  )?.providerId;
});

const currentProvider = computed(
  () =>
    providerOptions.value.find(
      (provider) => provider.providerId === selectedProviderId.value,
    ) ?? null,
);

const availableProviderCount = computed(
  () =>
    providerOptions.value.filter(
      (provider) => provider.availability === 'available',
    ).length,
);

const currentTaskStage = computed(() => {
  switch (currentTask.value?.task.state) {
    case 'queued':
      return 1;
    case 'running':
      return 2;
    case 'checkpoint':
    case 'blocked':
      return 3;
    case 'review':
    case 'completed':
      return 4;
    default:
      return 0;
  }
});

const taskStateSummary = (state: string): string => {
  switch (state) {
    case 'queued':
      return 'Criada';
    case 'running':
      return 'Executando';
    case 'checkpoint':
      return 'Checkpoint';
    case 'review':
      return 'Em review';
    case 'blocked':
      return 'Bloqueada';
    case 'failed':
      return 'Falhou';
    case 'completed':
      return 'Concluída';
    case 'cancelled':
      return 'Cancelada';
    default:
      return state;
  }
};

const openProviderDiagnostics = (): void => {
  if (providerConfig.value) providerConfig.value.open = true;
};

const openIntegrations = (): void => {
  if (!integrationsSummary.value) return;
  integrationsSummary.value.open = true;
  integrationsSummary.value.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
};

const selectedExecutionProfile = computed(() =>
  executionProfiles.value?.profiles.find(
    (profile) => profile.id === selectedProfileId.value,
  ),
);

const effectiveProfileSummary = computed(() => {
  const profile = selectedExecutionProfile.value;
  if (!profile) return 'Sem perfil · configuração manual';
  return [
    profile.label,
    providerLabel(profile.providerId),
    profile.timeoutMs
      ? Math.round(profile.timeoutMs / 1000) + 's'
      : 'sem timeout',
    profile.budget?.mode ? 'budget ' + profile.budget.mode : 'sem budget',
  ].join(' · ');
});

const pendingCheckpoint = computed(() => {
  const values = activity.value?.checkpoints ?? [];
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index]?.status === 'pending') return values[index] ?? null;
  }
  return null;
});

const authorizationByCapability = computed(() => {
  const values = new Map<AgentCapability, AgentAuthorization>();
  for (const authorization of activity.value?.authorizations ?? []) {
    values.set(authorization.capability, authorization);
  }
  return values;
});

const authorizationGranted = (capability: AgentCapability): boolean =>
  authorizationByCapability.value.get(capability)?.granted === true;

const authorizationScopeLabel = (
  scope: AgentAuthorizationScope | undefined,
): string => {
  if (!scope) return 'Sem escopo estruturado (legado)';
  switch (scope.kind) {
    case 'environment':
      return 'Ambiente · ' + scope.environmentInstanceId;
    case 'branch':
      return 'Branch · ' + scope.branch;
    case 'repository-branch':
      return scope.repository + ' · ' + scope.branch;
    case 'pull-request':
      return scope.repository + ' · PR #' + scope.number;
    case 'release-target':
      return 'Target · ' + scope.target;
  }
};

const providerLabel = (providerId: AgentProviderId): string => {
  switch (providerId) {
    case 'automatic':
      return 'Automatic';
    case 'codex':
      return 'Codex';
    case 'claude-code':
      return 'Claude Code';
    case 'chatgpt-browser':
      return 'ChatGPT Browser';
  }
};

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
    !executing.value &&
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
    !mutating.value &&
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

const budgetAlertMessage = computed(() => {
  const alerts = budget.value?.alerts ?? [];
  if (!alerts.length) return '';
  return alerts
    .map((alert) =>
      alert.kind === 'total-tokens'
        ? `Limite de tokens atingido: ${formatTokens(alert.observed)} / ${formatTokens(alert.threshold)}`
        : `Limite de custo estimado atingido: ${formatCost(alert.observed)} / ${formatCost(alert.threshold)}`,
    )
    .join(' · ');
});

function syncBudgetInputs(next: AgentBudgetOverview): void {
  budget.value = next;
  budgetTokens.value =
    next.budget?.maxTotalTokens !== undefined
      ? String(next.budget.maxTotalTokens)
      : '';
  budgetCost.value =
    next.budget?.maxEstimatedCostUsd !== undefined
      ? String(next.budget.maxEstimatedCostUsd)
      : '';
  budgetMode.value = next.budget?.mode ?? 'soft';
}

const usageHasMetrics = computed(() => {
  const summary = usage.value?.total;
  if (!summary) return false;
  return (
    summary.inputTokens !== undefined ||
    summary.cachedInputTokens !== undefined ||
    summary.cacheWriteInputTokens !== undefined ||
    summary.outputTokens !== undefined ||
    summary.reasoningTokens !== undefined ||
    summary.totalTokens !== undefined ||
    summary.reportedCostUsd !== undefined ||
    summary.estimatedCostUsd !== undefined ||
    summary.durationMs !== undefined
  );
});

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

function usagePeriodRange(): { observedFrom?: string } {
  if (usagePeriod.value === 'all') return {};
  const hours =
    usagePeriod.value === '24h' ? 24 : usagePeriod.value === '7d' ? 168 : 720;
  return {
    observedFrom: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
  };
}

async function reloadUsage(taskId: string): Promise<void> {
  usage.value = await fetchAgentUsage(
    props.project.id,
    taskId,
    usagePeriodRange(),
  );
}

function closeSocket(): void {
  const current = socket;
  socket = undefined;
  if (
    current &&
    current.readyState !== WebSocket.CLOSING &&
    current.readyState !== WebSocket.CLOSED
  ) {
    current.close();
  }
  socketState.value = 'idle';
}

function replaceTask(record: AgentTaskRecord): void {
  const index = tasks.value.findIndex(
    (item) => item.task.id === record.task.id,
  );
  if (index >= 0) {
    tasks.value = tasks.value.map((item, itemIndex) =>
      itemIndex === index ? record : item,
    );
  } else {
    tasks.value = [record, ...tasks.value];
  }
}

function publishAgentNotifications(snapshot: AgentRealtimeSnapshot): void {
  for (const candidate of agentNotificationCandidates(snapshot)) {
    if (
      !agentNotificationPreferences.value[candidate.kind] ||
      hasSeenAgentNotification(candidate.key)
    ) {
      continue;
    }

    noticeCenterStore.publishTerminalNotice({
      dedupeKey: candidate.key,
      origin: 'agent',
      outcome: candidate.outcome,
      projectId: props.project.id,
      projectName: props.project.name,
      label: candidate.label,
      routeTo: {
        name: 'project-agent',
        params: { projectId: props.project.id },
        query: { taskId: snapshot.status.task.task.id },
      },
    });
    markAgentNotificationSeen(candidate.key);
  }
}

function applySnapshot(snapshot: AgentRealtimeSnapshot): void {
  status.value = snapshot.status;
  activity.value = snapshot.activity;
  replaceTask(snapshot.status.task);
  publishAgentNotifications(snapshot);
}

function toggleAgentNotificationPreference(
  kind: AgentNotificationKind,
  enabled: boolean,
): void {
  agentNotificationPreferences.value = {
    ...agentNotificationPreferences.value,
    [kind]: enabled,
  };
  writeAgentNotificationPreferences(agentNotificationPreferences.value);
}

function toggleAgentNotificationGroup(
  kinds: AgentNotificationKind[],
  event: Event,
): void {
  const checked = (event.target as HTMLInputElement).checked;
  agentNotificationPreferences.value = {
    ...agentNotificationPreferences.value,
    ...Object.fromEntries(kinds.map((kind) => [kind, checked])),
  };
  writeAgentNotificationPreferences(agentNotificationPreferences.value);
}

function parseSocketMessage(
  data: unknown,
):
  | { type: 'ready' | 'update'; snapshot: AgentRealtimeSnapshot }
  | { type: 'error'; message: string }
  | null {
  if (typeof data !== 'string') return null;
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    if (
      (parsed.type === 'ready' || parsed.type === 'update') &&
      parsed.snapshot &&
      typeof parsed.snapshot === 'object'
    ) {
      return {
        type: parsed.type,
        snapshot: parsed.snapshot as AgentRealtimeSnapshot,
      };
    }
    if (parsed.type === 'error' && typeof parsed.message === 'string') {
      return { type: 'error', message: parsed.message };
    }
  } catch {
    return null;
  }
  return null;
}

function connect(taskId: string): void {
  closeSocket();
  if (!taskId) return;

  socketState.value = 'connecting';
  const next = new WebSocket(
    agentRuntimeWebSocketUrl(props.project.id, taskId),
  );
  socket = next;

  next.onopen = () => {
    if (socket === next) socketState.value = 'connected';
  };
  next.onmessage = (event) => {
    if (socket !== next) return;
    const message = parseSocketMessage(
      typeof event.data === 'string' ? event.data : null,
    );
    if (!message) return;
    if (message.type === 'error') {
      errorMessage.value = message.message;
      return;
    }
    applySnapshot(message.snapshot);
  };
  next.onerror = () => {
    if (socket !== next) return;
    socketState.value = 'disconnected';
  };
  next.onclose = () => {
    if (socket !== next) return;
    socket = undefined;
    socketState.value = 'disconnected';
  };
}

async function loadTask(
  taskId: string,
  requestGeneration = generation,
): Promise<void> {
  if (!taskId) {
    status.value = null;
    activity.value = null;
    conversationTurns.value = [];
    attachments.value = [];
    selectedAttachmentIds.value = [];
    conversationInstruction.value = '';
    usage.value = null;
    budget.value = null;
    budgetTokens.value = '';
    budgetCost.value = '';
    budgetMode.value = 'soft';
    closeSocket();
    return;
  }

  try {
    const [
      nextStatus,
      nextActivity,
      nextConversation,
      nextAttachments,
      nextUsage,
      nextBudget,
    ] = await Promise.all([
      fetchAgentTaskStatus(props.project.id, taskId),
      fetchAgentActivity(props.project.id, taskId),
      fetchAgentConversation(props.project.id, taskId),
      fetchAgentAttachments(props.project.id, taskId),
      fetchAgentUsage(props.project.id, taskId, usagePeriodRange()),
      fetchAgentBudget(props.project.id, taskId),
    ]);
    if (requestGeneration !== generation || selectedTaskId.value !== taskId) {
      return;
    }
    applySnapshot({ status: nextStatus, activity: nextActivity });
    conversationTurns.value = nextConversation;
    attachments.value = nextAttachments;
    selectedAttachmentIds.value = selectedAttachmentIds.value.filter((id) =>
      nextAttachments.some((attachment) => attachment.id === id),
    );
    usage.value = nextUsage;
    syncBudgetInputs(nextBudget);
    connect(taskId);
  } catch (error) {
    if (requestGeneration !== generation) return;
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar a task do Agente.';
  }
}

async function refreshProviders(): Promise<void> {
  if (providerRefreshing.value) return;
  providerRefreshing.value = true;
  errorMessage.value = '';

  try {
    providers.value = await fetchAgentProviders();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível revalidar os providers.';
  } finally {
    providerRefreshing.value = false;
  }
}

async function load(): Promise<void> {
  const requestGeneration = ++generation;
  loading.value = true;
  errorMessage.value = '';
  closeSocket();

  try {
    const [nextProviders, nextTasks, nextTaskContexts, nextExecutionProfiles] =
      await Promise.all([
        fetchAgentProviders(),
        fetchAgentTasks(props.project.id),
        fetchTaskContexts(props.project.id),
        fetchAgentExecutionProfiles(props.project.id),
      ]);
    if (requestGeneration !== generation) return;
    providers.value = nextProviders;
    tasks.value = nextTasks;
    taskContexts.value = nextTaskContexts;
    executionProfiles.value = nextExecutionProfiles;
    if (!selectedProfileId.value) {
      selectedProfileId.value = nextExecutionProfiles?.defaultProfileId ?? '';
    }
    applySelectedProfile();

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

    const sorted = [...nextTasks].sort((left, right) =>
      right.task.updatedAt.localeCompare(left.task.updatedAt),
    );
    const requested = props.initialTaskId
      ? sorted.find((record) => record.task.id === props.initialTaskId)
      : undefined;
    const active =
      requested ??
      sorted.find((record) =>
        [
          'queued',
          'running',
          'checkpoint',
          'review',
          'blocked',
          'failed',
        ].includes(record.task.state),
      ) ??
      sorted[0];

    selectedTaskId.value = active?.task.id ?? '';
    if (active) await loadTask(active.task.id, requestGeneration);
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

async function selectTask(taskId: string): Promise<void> {
  selectedTaskId.value = taskId;
  status.value = null;
  activity.value = null;
  conversationTurns.value = [];
  conversationInstruction.value = '';
  usage.value = null;
  budget.value = null;
  budgetTokens.value = '';
  budgetCost.value = '';
  budgetMode.value = 'soft';
  latestExecution.value = null;
  errorMessage.value = '';
  await loadTask(taskId);
}

function parseBacklogInstruction(
  value: string,
): { issueNumber?: number } | null {
  const normalized = value
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');
  if (
    normalized === 'pegue a próxima atividade' ||
    normalized === 'pegue a proxima atividade' ||
    normalized === 'pegue a próxima issue' ||
    normalized === 'pegue a proxima issue'
  ) {
    return {};
  }

  const specific = /^pegue a #(\d+)$/.exec(normalized);
  if (!specific) return null;
  const issueNumber = Number(specific[1]);
  return Number.isSafeInteger(issueNumber) && issueNumber > 0
    ? { issueNumber }
    : null;
}

function chooseBacklogIssue(issue: AgentBacklogIssue): void {
  instruction.value = 'pegue a #' + issue.number;
}

function applySelectedProfile(): void {
  const profile = executionProfiles.value?.profiles.find(
    (candidate) => candidate.id === selectedProfileId.value,
  );
  if (!profile) return;
  selectedProviderId.value = profile.providerId;
  requestedCapabilities.value = [...profile.requestedCapabilities];
}

async function saveCurrentExecutionProfile(): Promise<void> {
  const id = profileIdDraft.value.trim().toLowerCase();
  const label = profileLabelDraft.value.trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || !label) {
    errorMessage.value = 'Informe id simples e nome do perfil.';
    return;
  }
  const timeoutSeconds = profileTimeoutSeconds.value.trim()
    ? Number(profileTimeoutSeconds.value)
    : undefined;
  const maxTotalTokens = profileMaxTokens.value.trim()
    ? Number(profileMaxTokens.value)
    : undefined;
  const maxEstimatedCostUsd = profileMaxCost.value.trim()
    ? Number(profileMaxCost.value)
    : undefined;
  const profile: AgentExecutionProfile = {
    id,
    label,
    providerId: selectedProviderId.value,
    ...(selectedProviderId.value === 'automatic'
      ? { fallbackOrder: ['codex', 'claude-code'] }
      : {}),
    ...(timeoutSeconds !== undefined
      ? { timeoutMs: Math.round(timeoutSeconds * 1000) }
      : {}),
    ...(maxTotalTokens !== undefined || maxEstimatedCostUsd !== undefined
      ? {
          budget: {
            ...(maxTotalTokens !== undefined ? { maxTotalTokens } : {}),
            ...(maxEstimatedCostUsd !== undefined
              ? { maxEstimatedCostUsd }
              : {}),
            mode: profileBudgetMode.value,
          },
        }
      : {}),
    requestedCapabilities: [...requestedCapabilities.value],
  };
  const current = executionProfiles.value?.profiles ?? [];
  const profiles = [
    ...current.filter((candidate) => candidate.id !== id),
    profile,
  ];
  executionProfiles.value = await setAgentExecutionProfiles(props.project.id, {
    defaultProfileId: executionProfiles.value?.defaultProfileId ?? id,
    profiles,
  });
  selectedProfileId.value = id;
}

async function removeSelectedExecutionProfile(): Promise<void> {
  if (!selectedProfileId.value || !executionProfiles.value) return;
  const profiles = executionProfiles.value.profiles.filter(
    (profile) => profile.id !== selectedProfileId.value,
  );
  const defaultProfileId =
    executionProfiles.value.defaultProfileId === selectedProfileId.value
      ? profiles[0]?.id
      : executionProfiles.value.defaultProfileId;
  executionProfiles.value = await setAgentExecutionProfiles(props.project.id, {
    ...(defaultProfileId ? { defaultProfileId } : {}),
    profiles,
  });
  selectedProfileId.value = defaultProfileId ?? '';
  applySelectedProfile();
}

async function createTask(): Promise<void> {
  if (!canCreate.value) return;
  mutating.value = true;
  errorMessage.value = '';

  try {
    const backlogIntent = parseBacklogInstruction(instruction.value);
    if (backlogIntent) {
      const environmentInstanceId =
        selectedCreateTaskContext.value?.environmentInstanceId ??
        props.environmentInstanceId;
      const result = await adoptAgentBacklog(props.project.id, {
        ...backlogIntent,
        ...(environmentInstanceId ? { environmentInstanceId } : {}),
        requestedCapabilities: [...requestedCapabilities.value],
      });

      if (result.status === 'ambiguous') {
        backlogCandidates.value = result.candidates;
        backlogSelectionSource.value = result.source;
        backlogAdoptionNotice.value = null;
        return;
      }

      backlogCandidates.value = [];
      backlogSelectionSource.value = '';
      backlogAdoptionNotice.value = {
        source: result.source,
        issue: result.issue,
        reused: result.reused,
        ...(result.task.task.taskContextId
          ? { taskContextId: result.task.task.taskContextId }
          : {}),
      };
      replaceTask(result.task);
      selectedTaskId.value = result.task.task.id;
      instruction.value = '';
      latestExecution.value = null;
      taskContexts.value = await fetchTaskContexts(props.project.id);
      selectedTaskContextId.value = result.task.task.taskContextId ?? '';
      await loadTask(result.task.task.id);
      return;
    }

    backlogCandidates.value = [];
    backlogSelectionSource.value = '';
    backlogAdoptionNotice.value = null;
    const record = await createAgentTask(props.project.id, {
      summary: instruction.value.trim(),
      ...(selectedTaskContextId.value
        ? { taskContextId: selectedTaskContextId.value }
        : props.environmentInstanceId
          ? { environmentInstanceId: props.environmentInstanceId }
          : {}),
      requestedCapabilities: [...requestedCapabilities.value],
    });
    replaceTask(record);
    selectedTaskId.value = record.task.id;
    instruction.value = '';
    latestExecution.value = null;
    await loadTask(record.task.id);
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Não foi possível criar a task.';
  } finally {
    mutating.value = false;
  }
}

async function executeCurrent(): Promise<void> {
  const record = currentTask.value;
  if (!record || !canExecute.value) return;
  executing.value = true;
  errorMessage.value = '';

  try {
    const result = await executeAgentTask(
      props.project.id,
      record.task.id,
      selectedProviderId.value,
      [...selectedAttachmentIds.value],
      selectedProfileId.value || undefined,
    );
    latestExecution.value = result;
    replaceTask(result.task);
    await loadTask(record.task.id);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'A execução do Agente não foi concluída.';
    await loadTask(record.task.id);
  } finally {
    executing.value = false;
  }
}

async function continueCurrentConversation(): Promise<void> {
  const record = currentTask.value;
  const content = conversationInstruction.value.trim();
  if (!record || !content || !canContinue.value) return;

  executing.value = true;
  errorMessage.value = '';

  try {
    const result = await executeAgentConversationTurn(
      props.project.id,
      record.task.id,
      {
        id: globalThis.crypto.randomUUID(),
        content,
        providerId: selectedProviderId.value,
        ...(selectedAttachmentIds.value.length
          ? { attachmentIds: [...selectedAttachmentIds.value] }
          : {}),
        ...(selectedProfileId.value
          ? { profileId: selectedProfileId.value }
          : {}),
      },
    );
    latestExecution.value = result;
    replaceTask(result.task);
    conversationInstruction.value = '';
    conversationTurns.value = [
      ...conversationTurns.value,
      result.userTurn,
      result.agentTurn,
    ];
    await loadTask(record.task.id);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível continuar a conversa da task.';
    await loadTask(record.task.id);
  } finally {
    executing.value = false;
  }
}

function attachmentMediaType(file: File): AgentAttachment['mediaType'] | null {
  const type = file.type || (file.name.endsWith('.md') ? 'text/markdown' : '');
  if (
    type === 'text/plain' ||
    type === 'text/markdown' ||
    type === 'application/json' ||
    type === 'image/png' ||
    type === 'image/jpeg' ||
    type === 'image/webp'
  ) {
    return type;
  }
  return null;
}

async function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o anexo.'));
    reader.onload = () => {
      const value = String(reader.result ?? '');
      const separator = value.indexOf(',');
      if (separator < 0) {
        reject(new Error('Conteúdo do anexo inválido.'));
        return;
      }
      resolve(value.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

async function addAttachments(event: Event): Promise<void> {
  const task = currentTask.value?.task;
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  if (!task || files.length === 0 || uploadingAttachment.value) return;

  uploadingAttachment.value = true;
  errorMessage.value = '';
  try {
    for (const file of files) {
      if (attachments.value.length >= 8) {
        throw new Error('A task aceita no máximo 8 anexos.');
      }
      if (file.size > 1024 * 1024) {
        throw new Error('Cada anexo pode ter no máximo 1 MB.');
      }
      const mediaType = attachmentMediaType(file);
      if (!mediaType) {
        throw new Error('Tipo de anexo não suportado.');
      }
      const attachment = await createAgentAttachment(
        props.project.id,
        task.id,
        {
          filename: file.name,
          mediaType,
          contentBase64: await fileBase64(file),
        },
      );
      attachments.value = [...attachments.value, attachment];
      selectedAttachmentIds.value = [
        ...selectedAttachmentIds.value,
        attachment.id,
      ];
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível anexar o arquivo.';
  } finally {
    uploadingAttachment.value = false;
  }
}

function attachmentFor(id: string): AgentAttachment | undefined {
  return attachments.value.find((attachment) => attachment.id === id);
}

async function changeUsagePeriod(): Promise<void> {
  const taskId = currentTask.value?.task.id;
  if (!taskId) return;
  try {
    await reloadUsage(taskId);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar o período de usage.';
  }
}

async function saveBudget(): Promise<void> {
  const record = currentTask.value;
  if (!record || mutating.value) return;

  const maxTotalTokens = budgetTokens.value.trim()
    ? Number(budgetTokens.value)
    : undefined;
  const maxEstimatedCostUsd = budgetCost.value.trim()
    ? Number(budgetCost.value)
    : undefined;

  if (maxTotalTokens === undefined && maxEstimatedCostUsd === undefined) {
    errorMessage.value = 'Informe pelo menos um limite de budget.';
    return;
  }

  mutating.value = true;
  errorMessage.value = '';
  try {
    syncBudgetInputs(
      await setAgentBudget(props.project.id, record.task.id, {
        ...(maxTotalTokens !== undefined ? { maxTotalTokens } : {}),
        ...(maxEstimatedCostUsd !== undefined ? { maxEstimatedCostUsd } : {}),
        mode: budgetMode.value,
      }),
    );
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
  const record = currentTask.value;
  if (!record || mutating.value) return;
  mutating.value = true;
  errorMessage.value = '';
  try {
    syncBudgetInputs(await clearAgentBudget(props.project.id, record.task.id));
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível remover o budget.';
  } finally {
    mutating.value = false;
  }
}

async function cancelCurrent(): Promise<void> {
  const record = currentTask.value;
  if (!record) return;
  mutating.value = true;
  errorMessage.value = '';
  try {
    applySnapshot({
      status: await cancelAgentTask(props.project.id, record.task.id),
      activity:
        activity.value ??
        (await fetchAgentActivity(props.project.id, record.task.id)),
    });
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : 'Não foi possível parar a task.';
  } finally {
    mutating.value = false;
  }
}

async function retryCurrent(): Promise<void> {
  const record = currentTask.value;
  if (!record) return;
  mutating.value = true;
  errorMessage.value = '';
  try {
    const next = await retryAgentTask(props.project.id, record.task.id);
    replaceTask(next);
    await loadTask(next.task.id);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível tentar novamente.';
  } finally {
    mutating.value = false;
  }
}

async function recoverCurrent(): Promise<void> {
  const record = currentTask.value;
  if (!record) return;
  mutating.value = true;
  errorMessage.value = '';
  try {
    const next = await recoverAgentTask(props.project.id, record.task.id);
    status.value = next;
    replaceTask(next.task);
    activity.value = await fetchAgentActivity(props.project.id, record.task.id);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível recuperar a task.';
  } finally {
    mutating.value = false;
  }
}

async function toggleAuthorization(
  capability: AgentCapability,
  granted: boolean,
): Promise<void> {
  const record = currentTask.value;
  if (!record || mutating.value) return;
  mutating.value = true;
  errorMessage.value = '';
  try {
    await setAgentAuthorization(
      props.project.id,
      record.task.id,
      capability,
      granted,
    );
    activity.value = await fetchAgentActivity(props.project.id, record.task.id);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível alterar a autorização.';
  } finally {
    mutating.value = false;
  }
}

async function resolveCheckpoint(
  decision: 'approved' | 'rejected',
): Promise<void> {
  const record = currentTask.value;
  const checkpoint = pendingCheckpoint.value;
  if (!record || !checkpoint || mutating.value) return;
  mutating.value = true;
  errorMessage.value = '';

  try {
    const result = await resolveAgentCheckpoint(
      props.project.id,
      record.task.id,
      checkpoint.id,
      decision,
      decision === 'approved' ? checkpointInstruction.value : undefined,
    );
    replaceTask(result.task);
    checkpointInstruction.value = '';
    await loadTask(record.task.id);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível resolver o checkpoint.';
  } finally {
    mutating.value = false;
  }
}

function handleComposerKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    void createTask();
  }
}

function handleConversationKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    void continueCurrentConversation();
  }
}

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
});
</script>

<template>
  <section class="agent-panel" aria-label="Agente do projeto">
    <header class="agent-cockpit-header">
      <div class="agent-identity">
        <span class="agent-identity-icon" aria-hidden="true">
          <svg viewBox="0 0 64 64" role="img">
            <path
              d="M32 12v-5m0 0h1m-1 0h-1M18 24h28a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8H18a8 8 0 0 1-8-8V32a8 8 0 0 1 8-8Zm-8 9H6m48 0h4M22 36h.01M42 36h.01M24 44c4 3 12 3 16 0"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="4"
            />
          </svg>
        </span>
        <div>
          <h2>Agente</h2>
          <p>
            Transforme ideias em código. O agente executa tarefas no seu projeto
            com segurança, usando seus providers, skills e integrações.
          </p>
        </div>
      </div>

      <div class="agent-overview-status">
        <article>
          <span
            class="agent-health-dot"
            :class="{
              'agent-health-dot-ready':
                currentProvider?.availability === 'available',
            }"
          />
          <div>
            <small>Provider</small>
            <strong>Execução</strong>
            <span>{{
              currentProvider
                ? providerAvailabilityLabel(currentProvider)
                : 'Indisponível'
            }}</span>
          </div>
        </article>
        <article>
          <span
            class="agent-health-dot"
            :class="{ 'agent-health-dot-ready': socketState === 'connected' }"
          />
          <div>
            <small>Runtime</small>
            <strong>{{
              socketState === 'connected' ? 'Operacional' : 'Snapshot'
            }}</strong>
            <span>{{
              socketState === 'connected' ? 'Pronto para uso' : 'Sem tempo real'
            }}</span>
          </div>
        </article>
        <article>
          <span
            class="agent-health-dot"
            :class="{ 'agent-health-dot-ready': !!currentTask }"
          />
          <div>
            <small>Snapshot</small>
            <strong>{{ currentTask ? taskStateLabel : 'Sem task' }}</strong>
            <span>{{ currentTask ? 'Task ativa' : 'Nenhum ativo' }}</span>
          </div>
        </article>
      </div>
    </header>

    <EmptyState
      v-if="loading"
      class="agent-empty"
      icon="•••"
      title="Carregando Agent Runtime"
      description="Recuperando providers, tasks e estado atual."
    />

    <div v-else class="agent-cockpit">
      <div
        v-if="errorMessage"
        class="agent-error agent-cockpit-error"
        role="alert"
      >
        <span>{{ errorMessage }}</span>
        <button type="button" @click="errorMessage = ''">Fechar</button>
      </div>

      <section class="agent-card agent-composer agent-create-card">
        <div class="agent-create-heading">
          <span class="agent-create-icon" aria-hidden="true">
            <PencilSquareIcon />
          </span>
          <div>
            <h3>Nova task</h3>
            <p>
              Descreva o que você quer que o agente faça. Quanto mais contexto,
              melhor o resultado.
            </p>
          </div>
        </div>

        <div class="agent-prompt">
          <textarea
            v-model="instruction"
            rows="4"
            maxlength="4000"
            placeholder="Ex.: Adicionar um player de música com controle de volume e playlists..."
            aria-label="Instrução para nova task do Agente"
            @keydown="handleComposerKeydown"
          />
          <div class="agent-prompt-footer">
            <span class="agent-prompt-tools" aria-hidden="true">
              <AtSymbolIcon />
              <PaperClipIcon />
              <DocumentIcon />
            </span>
            <span>{{ instruction.length }}/4000</span>
            <kbd>Ctrl + Enter</kbd>
          </div>
        </div>

        <div
          v-if="backlogSelectionSource"
          class="agent-backlog-candidates"
          role="status"
        >
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

        <div
          v-if="backlogAdoptionNotice"
          class="agent-backlog-adopted"
          role="status"
        >
          <strong>
            #{{ backlogAdoptionNotice.issue.number }} ·
            {{ backlogAdoptionNotice.issue.title }}
          </strong>
          <span>
            Seleção: {{ backlogAdoptionSourceLabel }} · Task Context:
            {{ backlogAdoptionNotice.taskContextId ?? 'indisponível' }}
          </span>
        </div>

        <div class="agent-create-options">
          <label class="agent-field agent-context-field">
            <span>Task Context ⓘ</span>
            <select
              v-model="selectedTaskContextId"
              aria-label="Task Context da nova task"
            >
              <option value="">Sem vínculo explícito</option>
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
            <small>
              Vincule a task a um arquivo, pasta ou issue (opcional).
            </small>
          </label>

          <div class="agent-capability-picker agent-create-capabilities">
            <span>Capacidades do agente ⓘ</span>
            <div class="agent-capability-chips">
              <label
                v-for="capability in capabilities"
                :key="capability.id"
                class="agent-capability-option"
              >
                <input
                  v-model="requestedCapabilities"
                  type="checkbox"
                  :value="capability.id"
                />
                <span>{{ capability.label }}</span>
              </label>
            </div>
          </div>

          <button
            class="primary-button agent-create-button"
            type="button"
            :disabled="!canCreate"
            @click="createTask"
          >
            <BoltIcon aria-hidden="true" />
            Criar task
            <ArrowRightIcon aria-hidden="true" />
          </button>
        </div>

        <p v-if="selectedCreateTaskContext" class="agent-hint">
          Environment Instance:
          {{
            selectedCreateTaskContext.environmentInstanceId ?? 'não informada'
          }}
        </p>
      </section>

      <aside class="agent-provider-panel agent-card">
        <div class="agent-provider-panel-heading">
          <div>
            <PowerIcon class="agent-provider-power" aria-hidden="true" />
            <strong>Status do provider</strong>
          </div>
          <StatusBadge
            v-if="currentProvider"
            :tone="providerTone(currentProvider)"
          >
            {{ providerAvailabilityLabel(currentProvider) }}
          </StatusBadge>
        </div>

        <label class="agent-field">
          <span>Provider atual</span>
          <select
            v-model="selectedProviderId"
            :disabled="executing || !!selectedProfileId"
          >
            <option
              v-for="provider in providerOptions"
              :key="provider.providerId"
              :value="provider.providerId"
            >
              {{
                provider.providerId === 'automatic'
                  ? 'Execução'
                  : providerLabel(provider.providerId)
              }}
              · {{ providerAvailabilityLabel(provider) }}
            </option>
          </select>
        </label>

        <label class="agent-field">
          <span>Perfil de execução</span>
          <select
            v-model="selectedProfileId"
            :disabled="executing"
            @change="applySelectedProfile"
          >
            <option value="">Manual</option>
            <option
              v-for="profile in executionProfiles?.profiles ?? []"
              :key="profile.id"
              :value="profile.id"
            >
              {{ profile.label }}
            </option>
          </select>
        </label>

        <div class="agent-provider-metrics">
          <span>
            <small>Tokens</small>
            <strong>{{
              profileMaxTokens ? profileMaxTokens : 'Sem limite'
            }}</strong>
          </span>
          <span>
            <small>Custo (US$)</small>
            <strong>{{
              profileMaxCost ? profileMaxCost : 'Sem limite'
            }}</strong>
          </span>
          <span>
            <small>Budget</small>
            <strong>{{
              profileBudgetMode === 'hard' ? 'Hard' : 'Soft'
            }}</strong>
          </span>
        </div>

        <details ref="providerConfig" class="agent-provider-config">
          <summary>
            <span class="agent-provider-summary-icon" aria-hidden="true">⚙</span>
            Configurar provider
          </summary>
          <div class="agent-provider-config-body">
            <div class="agent-budget-fields">
              <label>
                <span>ID</span>
                <input v-model="profileIdDraft" placeholder="normal" />
              </label>
              <label>
                <span>Nome</span>
                <input v-model="profileLabelDraft" placeholder="Normal" />
              </label>
              <label>
                <span>Timeout (s)</span>
                <input
                  v-model="profileTimeoutSeconds"
                  type="number"
                  min="5"
                  max="1800"
                  placeholder="Sem limite"
                />
              </label>
            </div>
            <button
              class="secondary-button"
              type="button"
              :disabled="mutating"
              @click="saveCurrentExecutionProfile"
            >
              Salvar perfil atual
            </button>

            <div
              class="agent-provider-doctor"
              data-testid="provider-doctor"
              aria-live="polite"
            >
              <article
                v-for="provider in providerOptions"
                :key="'doctor-' + provider.providerId"
                class="agent-provider-doctor-item"
                :class="{
                  'agent-provider-doctor-item-active':
                    provider.providerId === selectedProviderId,
                }"
              >
                <div class="agent-provider-doctor-heading">
                  <strong>{{ providerLabel(provider.providerId) }}</strong>
                  <StatusBadge :tone="providerTone(provider)">
                    {{ providerAvailabilityLabel(provider) }}
                  </StatusBadge>
                </div>
                <small v-if="provider.version">
                  Versão {{ provider.version }}
                </small>
                <small>{{
                  providerObservedAtLabel(provider.observedAt)
                }}</small>
                <p data-testid="provider-diagnostic">
                  <strong>
                    {{ providerDiagnosticSummary(provider.diagnostic?.code) }}
                  </strong>
                  <span>
                    Evidência:
                    {{
                      provider.diagnostic?.evidence ??
                      provider.reason ??
                      'Sem evidência adicional.'
                    }}
                  </span>
                  <span>
                    Próxima ação:
                    {{ providerDiagnosticAction(provider.diagnostic?.code) }}
                  </span>
                </p>
              </article>
            </div>
          </div>
        </details>

        <button
          class="agent-provider-action"
          type="button"
          :disabled="providerRefreshing || executing"
          @click="refreshProviders"
        >
          <ArrowPathIcon aria-hidden="true" />
          Revalidar conexão
          <span aria-hidden="true">›</span>
        </button>
        <button
          class="agent-provider-action"
          type="button"
          @click="openIntegrations"
        >
          <PuzzlePieceIcon aria-hidden="true" />
          Ver integrações (MCP)
          <span aria-hidden="true">›</span>
        </button>
        <button
          class="agent-provider-action"
          type="button"
          @click="openProviderDiagnostics"
        >
          <ComputerDesktopIcon aria-hidden="true" />
          Diagnóstico do ambiente
          <span aria-hidden="true">›</span>
        </button>
      </aside>

      <section class="agent-card agent-task-overview">
        <div class="agent-section-heading agent-task-heading">
          <div>
            <span class="agent-section-icon" aria-hidden="true">⌁</span>
            <div>
              <strong>Task atual</strong>
              <small>
                {{
                  currentTask
                    ? currentTask.task.summary
                    : 'Nenhuma task em execução no momento.'
                }}
              </small>
            </div>
          </div>
          <StatusBadge v-if="currentTask" :tone="taskTone">
            {{ taskStateLabel }}
          </StatusBadge>
        </div>

        <div class="agent-task-steps">
          <article
            :class="{
              'is-active': currentTaskStage === 1,
              'is-done': currentTaskStage > 1,
            }"
          >
            <span>1</span>
            <strong>Criada</strong>
            <small>Task enviada para o agente.</small>
          </article>
          <article
            :class="{
              'is-active': currentTaskStage === 2,
              'is-done': currentTaskStage > 2,
            }"
          >
            <span>2</span>
            <strong>Executando</strong>
            <small>Agente trabalhando no projeto.</small>
          </article>
          <article
            :class="{
              'is-active': currentTaskStage === 3,
              'is-done': currentTaskStage > 3,
            }"
          >
            <span>3</span>
            <strong>Checkpoint</strong>
            <small>Ponto de verificação e revisão.</small>
          </article>
          <article :class="{ 'is-active': currentTaskStage === 4 }">
            <span>4</span>
            <strong>Review</strong>
            <small>Aguardando sua validação.</small>
          </article>
        </div>

        <div v-if="!currentTask" class="agent-task-empty">
          <span aria-hidden="true"><CubeIcon /></span>
          <div>
            <strong>Nenhuma task em execução</strong>
            <small
              >Crie uma nova task acima para iniciar a execução com o
              agente.</small
            >
          </div>
        </div>
        <div v-else class="agent-task-overview-actions">
          <button
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
            class="secondary-button"
            type="button"
            :disabled="mutating"
            @click="cancelCurrent"
          >
            <StopIcon aria-hidden="true" />
            Parar
          </button>
        </div>
      </section>

      <section class="agent-card agent-recent-history">
        <div class="agent-section-heading agent-history-heading">
          <div>
            <ClockIcon class="agent-section-icon" aria-hidden="true" />
            <strong>Histórico recente</strong>
          </div>
          <button
            class="agent-history-show-all"
            type="button"
            @click="showAllHistory = !showAllHistory"
          >
            {{ showAllHistory ? 'Ver menos' : 'Ver todos' }}
          </button>
        </div>

        <p v-if="!sortedTasks.length" class="agent-hint">
          Nenhuma task criada neste projeto.
        </p>
        <template v-else>
          <button
            v-for="record in showAllHistory ? sortedTasks : sortedTasks.slice(0, 5)"
            :key="record.task.id"
            class="agent-history-item"
            :class="{ 'is-selected': record.task.id === selectedTaskId }"
            type="button"
            @click="selectTask(record.task.id)"
          >
            <span
              class="agent-history-state"
              :class="'state-' + record.task.state"
              aria-hidden="true"
            />
            <div>
              <strong>{{ record.task.summary }}</strong>
              <small>
                {{ taskStateSummary(record.task.state) }} ·
                {{ new Date(record.task.updatedAt).toLocaleString() }}
              </small>
            </div>
          </button>
        </template>
      </section>

      <details
        ref="integrationsSummary"
        class="agent-integrations-summary agent-card"
      >
        <summary>
          <div class="agent-integrations-copy">
            <PuzzlePieceIcon class="agent-integrations-icon" aria-hidden="true" />
            <div>
              <strong>Integrações e MCP</strong>
              <small>
                Conecte ferramentas, plugins e skills para expandir as
                capacidades do agente.
              </small>
            </div>
          </div>
          <div class="agent-integration-stats">
            <span>
              <LinkIcon aria-hidden="true" />
              <span>
                <strong>Integrações</strong>
                <small>conectadas</small>
              </span>
            </span>
            <span>
              <PuzzlePieceIcon aria-hidden="true" />
              <span>
                <strong>Plugins</strong>
                <small>disponíveis</small>
              </span>
            </span>
            <span>
              <CubeIcon aria-hidden="true" />
              <span>
                <strong>MCP</strong>
                <small>{{ availableProviderCount }} provider(s)</small>
              </span>
            </span>
            <b>
              Gerenciar integrações
              <ArrowRightIcon aria-hidden="true" />
            </b>
          </div>
        </summary>
        <ProjectAgentIntegrationsCard
          :project="project"
          v-bind="environmentInstanceId ? { environmentInstanceId } : {}"
        />
      </details>

      <div class="agent-detail-area">
        <template v-if="currentTask">
          <section class="agent-current agent-card">
            <div class="agent-section-heading">
              <div>
                <span>Task atual</span>
                <strong>{{ currentTask.task.summary }}</strong>
              </div>
              <StatusBadge :tone="taskTone">{{ taskStateLabel }}</StatusBadge>
            </div>

            <div
              v-if="latestExecution?.execution.configuration"
              class="agent-hint"
            >
              Configuração efetiva:
              {{
                latestExecution.execution.configuration.profileLabel ?? 'manual'
              }}
              ·
              {{
                providerLabel(
                  latestExecution.execution.configuration.providerId,
                )
              }}
              · modelo indisponível · esforço indisponível
            </div>

            <div class="agent-runtime-strip">
              <span>
                <small>Runtime</small>
                <strong>{{ status?.runtime.state ?? 'idle' }}</strong>
              </span>
              <span>
                <small>Tentativas</small>
                <strong>{{ status?.runtime.attempts ?? 0 }}</strong>
              </span>
              <span>
                <small>Execução</small>
                <strong>{{
                  latestExecution?.execution.id ??
                  status?.activeExecution?.executionId ??
                  '—'
                }}</strong>
              </span>
              <span>
                <small>Provider real</small>
                <strong>{{
                  latestExecution
                    ? providerLabel(latestExecution.execution.providerId)
                    : lastConcreteProviderId
                      ? providerLabel(lastConcreteProviderId)
                      : status?.activeExecution
                        ? 'Em seleção'
                        : '—'
                }}</strong>
              </span>
            </div>

            <div class="agent-usage-heading">
              <div>
                <small>Consumo observado</small>
                <strong>Resumo do período</strong>
              </div>
              <select v-model="usagePeriod" @change="changeUsagePeriod">
                <option value="all">Todo período</option>
                <option value="24h">Últimas 24h</option>
                <option value="7d">Últimos 7 dias</option>
                <option value="30d">Últimos 30 dias</option>
              </select>
            </div>

            <div class="agent-usage-strip">
              <span>
                <small>Execuções medidas</small>
                <strong>{{ usage?.total.executionCount ?? 0 }}</strong>
              </span>
              <span>
                <small>Entrada</small>
                <strong>{{ formatTokens(usage?.total.inputTokens) }}</strong>
              </span>
              <span>
                <small>Cache</small>
                <strong>{{
                  formatTokens(usage?.total.cachedInputTokens)
                }}</strong>
              </span>
              <span>
                <small>Saída</small>
                <strong>{{ formatTokens(usage?.total.outputTokens) }}</strong>
              </span>
              <span>
                <small>Duração</small>
                <strong>{{ formatDuration(usage?.total.durationMs) }}</strong>
              </span>
              <span>
                <small>Custo reportado</small>
                <strong>{{ formatCost(usage?.total.reportedCostUsd) }}</strong>
              </span>
              <span>
                <small>Custo estimado</small>
                <strong>{{ formatCost(usage?.total.estimatedCostUsd) }}</strong>
              </span>
            </div>
            <p
              v-if="usage && !usageHasMetrics"
              class="agent-hint agent-usage-hint"
            >
              O provider não reportou telemetria confiável para esta task.
              Tokens e custo permanecem indisponíveis.
            </p>

            <div class="agent-budget">
              <div class="agent-budget-heading">
                <div>
                  <small>Budget</small>
                  <strong>{{
                    budgetMode === 'hard'
                      ? 'Bloqueia nova execução ao atingir o limite'
                      : 'Alerta sem interromper a execução'
                  }}</strong>
                </div>
                <StatusBadge v-if="budgetAlertMessage" tone="warning">
                  Limite atingido
                </StatusBadge>
              </div>
              <div class="agent-budget-fields">
                <label>
                  <span>Modo</span>
                  <select v-model="budgetMode">
                    <option value="soft">Soft · só alerta</option>
                    <option value="hard">Hard · bloqueia nova execução</option>
                  </select>
                </label>
                <label>
                  <span>Total de tokens</span>
                  <input
                    v-model="budgetTokens"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Sem limite"
                  />
                </label>
                <label>
                  <span>Custo estimado (US$)</span>
                  <input
                    v-model="budgetCost"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Sem limite"
                  />
                </label>
                <div class="agent-budget-actions">
                  <button
                    class="secondary-button"
                    type="button"
                    :disabled="mutating"
                    @click="saveBudget"
                  >
                    Salvar limite
                  </button>
                  <button
                    v-if="budget?.budget"
                    class="secondary-button"
                    type="button"
                    :disabled="mutating"
                    @click="clearBudget"
                  >
                    Remover
                  </button>
                </div>
              </div>
              <p v-if="budgetAlertMessage" class="agent-budget-alert">
                {{ budgetAlertMessage }}
                <template v-if="budget?.blocking">
                  · Nova execução bloqueada até ajustar ou remover o budget.
                </template>
              </p>
              <p v-else class="agent-hint">
                Hard budget é verificado antes do provider iniciar; nunca
                cancela uma execução em andamento nem altera recovery.
              </p>
            </div>

            <div class="agent-actions">
              <button
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
                class="secondary-button"
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
                Retry
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
                Recover
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
            </div>
          </section>

          <section
            class="agent-conversation agent-card"
            aria-label="Conversa da task"
          >
            <div class="agent-section-heading">
              <div>
                <span>Conversa</span>
                <strong>Continuidade da Agent Task</strong>
              </div>
              <span class="agent-shortcut">Ctrl/⌘ + Enter</span>
            </div>

            <p v-if="!conversationTurns.length" class="agent-hint">
              Ainda não há turnos persistidos nesta task.
            </p>
            <ol v-else class="agent-conversation-list">
              <li
                v-for="turn in conversationTurns"
                :key="turn.id"
                class="agent-message"
                :class="{ 'agent-message-user': turn.role === 'user' }"
              >
                <div class="agent-message-meta">
                  <strong>
                    {{
                      turn.role === 'user'
                        ? 'Você'
                        : turn.providerId
                          ? providerLabel(turn.providerId)
                          : 'Agente'
                    }}
                  </strong>
                  <span v-if="turn.executionId">
                    {{ turn.executionId }}
                  </span>
                  <small>{{ new Date(turn.createdAt).toLocaleString() }}</small>
                </div>
                <p>{{ turn.content }}</p>
              </li>
            </ol>

            <template v-if="currentTask.task.state === 'review'">
              <textarea
                v-model="conversationInstruction"
                rows="3"
                maxlength="16000"
                placeholder="Continue a mesma task com uma nova instrução..."
                aria-label="Instrução para continuar a task do Agente"
                :disabled="executing || mutating"
                @keydown="handleConversationKeydown"
              />
              <div class="agent-composer-actions">
                <p>
                  A mensagem usa a mesma task, contexto e autorizações; nenhuma
                  capability nova é concedida automaticamente.
                </p>
                <button
                  class="primary-button"
                  type="button"
                  :disabled="!canContinue"
                  @click="continueCurrentConversation"
                >
                  <BoltIcon aria-hidden="true" />
                  {{ executing ? 'Executando…' : 'Enviar instrução' }}
                </button>
              </div>
            </template>
            <p v-else class="agent-hint">
              A continuação fica disponível quando a task retorna para revisão.
            </p>
          </section>

          <section
            v-if="pendingCheckpoint"
            class="agent-checkpoint agent-card"
            aria-label="Checkpoint pendente"
          >
            <div class="agent-checkpoint-icon">
              <PauseCircleIcon aria-hidden="true" />
            </div>
            <div class="agent-checkpoint-body">
              <div class="agent-section-heading">
                <div>
                  <span>Checkpoint</span>
                  <strong>{{ pendingCheckpoint.summary }}</strong>
                </div>
                <StatusBadge tone="warning">Ação necessária</StatusBadge>
              </div>

              <p v-if="pendingCheckpoint.requiredCapabilities.length">
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
                rows="3"
                maxlength="4000"
                placeholder="Instrução opcional para continuar..."
                aria-label="Instrução de continuação do checkpoint"
              />

              <div class="agent-actions">
                <button
                  class="primary-button"
                  type="button"
                  :disabled="mutating"
                  @click="resolveCheckpoint('approved')"
                >
                  <CheckCircleIcon aria-hidden="true" />
                  Aprovar
                </button>
                <button
                  class="secondary-button"
                  type="button"
                  :disabled="mutating"
                  @click="resolveCheckpoint('rejected')"
                >
                  <NoSymbolIcon aria-hidden="true" />
                  Rejeitar
                </button>
              </div>
            </div>
          </section>

          <section class="agent-card">
            <div class="agent-section-heading">
              <div>
                <span>Contexto</span>
                <strong>Contexto do projeto</strong>
              </div>
            </div>
            <ProjectTaskContextSummary
              :project-id="project.id"
              :current-branch="boundTaskContext?.branch ?? currentBranch"
              :environment-instance-id="
                currentTask.task.environmentInstanceId ?? environmentInstanceId
              "
              :task-context-id="currentTask.task.taskContextId"
            />
          </section>

          <section class="agent-card">
            <div class="agent-section-heading">
              <div>
                <span>Contexto adicional</span>
                <strong>Anexos da task</strong>
              </div>
            </div>
            <label class="agent-field">
              <span>Adicionar arquivo</span>
              <input
                type="file"
                multiple
                accept=".txt,.log,.md,.json,image/png,image/jpeg,image/webp"
                :disabled="uploadingAttachment || attachments.length >= 8"
                @change="addAttachments"
              />
            </label>
            <p class="agent-hint">
              Até 8 arquivos, 1 MB cada. Texto, Markdown, JSON, PNG, JPEG e
              WebP. O conteúdo é tratado como dado não confiável.
            </p>
            <p v-if="!attachments.length" class="agent-hint">
              Nenhum anexo nesta task.
            </p>
            <div v-else class="agent-authorization-list">
              <label
                v-for="attachment in attachments"
                :key="attachment.id"
                class="agent-authorization"
              >
                <div>
                  <strong>{{ attachment.filename }}</strong>
                  <small>
                    {{ attachment.mediaType }} ·
                    {{ Math.ceil(attachment.byteSize / 1024) }} KB
                  </small>
                </div>
                <input
                  v-model="selectedAttachmentIds"
                  type="checkbox"
                  :value="attachment.id"
                />
              </label>
            </div>
            <div
              v-for="turn in conversationTurns.filter(
                (item) => item.attachmentIds?.length,
              )"
              :key="'attachments-' + turn.id"
              class="agent-hint"
            >
              Turno {{ turn.role }}:
              {{
                turn.attachmentIds
                  ?.map((id) => attachmentFor(id)?.filename ?? id)
                  .join(', ')
              }}
            </div>
          </section>

          <section class="agent-card">
            <div class="agent-section-heading">
              <div>
                <span>Notificações</span>
                <strong>Eventos da Agent Task</strong>
              </div>
            </div>
            <div class="agent-authorization-list">
              <label class="agent-authorization">
                <div>
                  <strong>Checkpoint e autorização</strong>
                  <small>Avisa quando a task precisa de uma decisão sua.</small>
                </div>
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
              </label>
              <label class="agent-authorization">
                <div>
                  <strong>Falha e recovery</strong>
                  <small
                    >Avisa quando a task bloqueia, falha ou precisa
                    recuperar.</small
                  >
                </div>
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
              </label>
              <label class="agent-authorization">
                <div>
                  <strong>Conclusão</strong>
                  <small>Avisa quando a Agent Task é concluída.</small>
                </div>
                <input
                  type="checkbox"
                  :checked="agentNotificationPreferences.completed"
                  @change="toggleAgentNotificationGroup(['completed'], $event)"
                />
              </label>
            </div>
          </section>

          <section class="agent-card">
            <div class="agent-section-heading">
              <div>
                <span>Autorizações</span>
                <strong>Capabilities da task</strong>
              </div>
            </div>

            <p
              v-if="!currentTask.task.requestedCapabilities.length"
              class="agent-hint"
            >
              Esta task não solicitou capabilities protegidas.
            </p>
            <div v-else class="agent-authorization-list">
              <div
                v-for="capability in currentTask.task.requestedCapabilities"
                :key="capability"
                class="agent-authorization"
              >
                <div>
                  <strong>{{ capability }}</strong>
                  <small>{{
                    authorizationGranted(capability)
                      ? 'Concedida'
                      : 'Não concedida'
                  }}</small>
                  <small
                    v-if="authorizationByCapability.get(capability)?.scope"
                    class="agent-authorization-scope"
                  >
                    {{
                      authorizationScopeLabel(
                        authorizationByCapability.get(capability)?.scope,
                      )
                    }}
                  </small>
                </div>
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
                  {{
                    authorizationGranted(capability) ? 'Revogar' : 'Autorizar'
                  }}
                </button>
              </div>
            </div>
          </section>

          <div class="agent-detail-grid">
            <section class="agent-card">
              <div class="agent-section-heading">
                <div>
                  <span>Atividade</span>
                  <strong>O que está acontecendo</strong>
                </div>
              </div>
              <p v-if="!recentEvents.length" class="agent-hint">
                Ainda não há eventos registrados.
              </p>
              <ol v-else class="agent-timeline">
                <li v-for="event in recentEvents" :key="event.id">
                  <span>{{ event.type }}</span>
                  <strong>{{ event.summary }}</strong>
                  <small>{{
                    new Date(event.occurredAt).toLocaleString()
                  }}</small>
                </li>
              </ol>
            </section>

            <section class="agent-card">
              <div class="agent-section-heading">
                <div>
                  <span>Evidências</span>
                  <strong>Progresso verificável</strong>
                </div>
              </div>
              <p v-if="!recentEvidence.length" class="agent-hint">
                Nenhuma evidência registrada nesta task.
              </p>
              <ul v-else class="agent-evidence-list">
                <li v-for="evidence in recentEvidence" :key="evidence.id">
                  <span>{{ evidence.kind }}</span>
                  <strong>{{ evidence.summary }}</strong>
                  <small v-if="evidence.reference">{{
                    evidence.reference
                  }}</small>
                </li>
              </ul>
            </section>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.agent-panel {
  min-height: 0;
  background: var(--surface-0);
}

.agent-panel-header {
  display: flex;
  min-height: 80px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 22px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
}

.agent-panel-header > div:first-child {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.agent-panel-header h2,
.agent-panel-header p {
  margin: 0;
}

.agent-panel-header h2 {
  font-size: 23px;
  letter-spacing: -0.03em;
}

.agent-panel-header > div:first-child > p:last-child {
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.agent-kicker,
.agent-section-heading span {
  color: var(--text-dim);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.agent-header-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-socket-indicator {
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-dim);
  font-size: 10px;
}

.agent-socket-connected {
  color: var(--success-text);
}

.agent-layout {
  display: grid;
  grid-template-columns: minmax(220px, 270px) minmax(0, 1fr);
  min-height: 560px;
}

.agent-sidebar {
  min-width: 0;
  border-right: 1px solid var(--border);
  background: var(--surface-1);
}

.agent-section {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.agent-section-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.agent-section-heading > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.agent-section-heading strong {
  overflow: hidden;
  color: var(--text);
  font-size: var(--font-sm);
  text-overflow: ellipsis;
}

.agent-field,
.agent-capability-picker {
  display: grid;
  gap: 7px;
}

.agent-field > span,
.agent-capability-picker > span {
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
}

.agent-field select,
.agent-composer textarea,
.agent-conversation textarea,
.agent-checkpoint textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface-0);
  font: inherit;
}

.agent-field select {
  min-height: 36px;
  padding: 0 10px;
}

.agent-composer textarea,
.agent-conversation textarea,
.agent-checkpoint textarea {
  resize: vertical;
  padding: 11px 12px;
  line-height: 1.5;
}

.agent-hint {
  margin: 0;
  color: var(--text-dim);
  font-size: var(--font-xs);
  line-height: 1.45;
}

.agent-provider-doctor {
  display: grid;
  gap: 6px;
}

.agent-provider-doctor-item {
  display: grid;
  gap: 5px;
  padding: 8px 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
}

.agent-provider-doctor-item-active {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}

.agent-provider-doctor-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.agent-provider-doctor-heading > strong {
  font-size: var(--font-xs);
}

.agent-provider-doctor-item > small {
  color: var(--text-dim);
  font-size: 9px;
}

.agent-provider-doctor-item > p {
  display: grid;
  gap: 3px;
  margin: 0;
  color: var(--text-dim);
  font-size: 9px;
  line-height: 1.4;
}

.agent-provider-doctor-item > p > strong {
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.agent-history {
  align-content: start;
}

.agent-icon-button {
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
}

.agent-icon-button svg {
  width: 15px;
  height: 15px;
}

.agent-task-item {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: 3px;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.agent-task-item:hover,
.agent-task-item-active {
  border-color: var(--border);
  color: var(--text);
  background: var(--surface-2);
}

.agent-task-item span {
  overflow: hidden;
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-task-item small {
  color: var(--text-dim);
  font-size: 9px;
  text-transform: uppercase;
}

.agent-main {
  display: grid;
  align-content: start;
  min-width: 0;
  gap: 12px;
  padding: 16px;
}

.agent-card {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
}

.agent-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--danger-border, var(--border));
  border-radius: var(--radius-sm);
  color: var(--danger-text);
  background: var(--danger-surface);
  font-size: var(--font-xs);
}

.agent-error button {
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.agent-composer,
.agent-conversation {
  display: grid;
  gap: 12px;
}

.agent-conversation-list {
  display: grid;
  max-height: 420px;
  gap: 10px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.agent-message {
  display: grid;
  gap: 6px;
  max-width: min(760px, 92%);
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
}

.agent-message-user {
  justify-self: end;
  background: var(--surface-2);
}

.agent-message-meta {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 8px;
  color: var(--text-dim);
  font-size: 9px;
}

.agent-message-meta strong {
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.agent-message-meta span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-message-meta small {
  margin-left: auto;
  white-space: nowrap;
}

.agent-message p {
  margin: 0;
  color: var(--text);
  font-size: var(--font-sm);
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.agent-shortcut {
  color: var(--text-dim);
  font-size: 9px;
}

.agent-backlog-candidates {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
}

.agent-backlog-candidates > strong {
  font-size: var(--font-xs);
}

.agent-backlog-candidates button {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface-1);
  text-align: left;
  cursor: pointer;
}

.agent-backlog-candidates button:hover {
  background: var(--surface-2);
}

.agent-backlog-candidates button span {
  flex: 0 0 auto;
  color: var(--accent);
  font-weight: var(--font-weight-strong);
}

.agent-backlog-adopted {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
}

.agent-backlog-adopted strong {
  font-size: var(--font-xs);
}

.agent-backlog-adopted span {
  color: var(--text-dim);
  font-size: var(--font-xs);
}

.agent-capability-picker {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}

.agent-capability-picker > span {
  grid-column: 1 / -1;
}

.agent-capability-option {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.agent-capability-option > span {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.agent-capability-option strong {
  font-size: var(--font-xs);
}

.agent-capability-option small {
  overflow: hidden;
  color: var(--text-dim);
  font-size: 9px;
  text-overflow: ellipsis;
}

.agent-composer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.agent-composer-actions p {
  max-width: 560px;
  margin: 0;
  color: var(--text-dim);
  font-size: var(--font-xs);
}

.agent-composer-actions button,
.agent-actions button,
.agent-actions a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.agent-composer-actions svg,
.agent-actions svg {
  width: 15px;
  height: 15px;
}

.agent-current {
  display: grid;
  gap: 14px;
}

.agent-runtime-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.agent-runtime-strip > span {
  display: grid;
  min-width: 0;
  gap: 3px;
  padding: 9px 10px;
  border-right: 1px solid var(--border);
}

.agent-runtime-strip > span:last-child {
  border-right: 0;
}

.agent-usage-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.agent-usage-heading > div {
  display: grid;
  gap: 2px;
}

.agent-usage-heading small {
  color: var(--text-dim);
  font-size: 9px;
}

.agent-usage-heading strong {
  font-size: var(--font-xs);
}

.agent-usage-heading select {
  min-height: 32px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface-0);
  font: inherit;
  font-size: var(--font-xs);
}

.agent-usage-strip {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.agent-usage-strip > span {
  display: grid;
  min-width: 0;
  gap: 3px;
  padding: 9px 10px;
  border-right: 1px solid var(--border);
}

.agent-usage-strip > span:last-child {
  border-right: 0;
}

.agent-usage-strip small {
  color: var(--text-dim);
  font-size: 9px;
}

.agent-usage-strip strong {
  overflow: hidden;
  font-size: var(--font-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-usage-hint {
  margin-top: -4px;
}

.agent-runtime-strip small {
  color: var(--text-dim);
  font-size: 9px;
  text-transform: uppercase;
}

.agent-runtime-strip strong {
  overflow: hidden;
  font-size: var(--font-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-budget {
  display: grid;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
}

.agent-budget-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.agent-budget-heading > div {
  display: grid;
  gap: 2px;
}

.agent-budget-heading small,
.agent-budget-fields span {
  color: var(--text-dim);
  font-size: 9px;
}

.agent-budget-heading strong {
  font-size: var(--font-xs);
}

.agent-budget-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
  align-items: end;
  gap: 8px;
}

.agent-budget-fields label {
  display: grid;
  gap: 5px;
}

.agent-budget-fields input,
.agent-budget-fields select {
  min-height: 34px;
  box-sizing: border-box;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface-1);
  font: inherit;
}

.agent-budget-actions {
  display: flex;
  gap: 6px;
}

.agent-budget-alert {
  margin: 0;
  color: var(--warning-text);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
}

.agent-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.agent-checkpoint {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 14px;
  border-color: color-mix(in srgb, var(--warning-text) 35%, var(--border));
  background: color-mix(in srgb, var(--warning-surface) 38%, var(--surface-1));
}

.agent-checkpoint-icon {
  display: flex;
  width: 42px;
  height: 42px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: var(--warning-text);
  background: var(--warning-surface);
}

.agent-checkpoint-icon svg {
  width: 22px;
  height: 22px;
}

.agent-checkpoint-body {
  display: grid;
  min-width: 0;
  gap: 12px;
}

.agent-checkpoint-body p {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.agent-checkpoint code {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--surface-0);
  font-size: 10px;
}

.agent-authorization-list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.agent-authorization {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.agent-authorization > div {
  display: grid;
  gap: 2px;
}

.agent-authorization strong {
  font-size: var(--font-xs);
}

.agent-authorization small {
  color: var(--text-dim);
  font-size: 9px;
}

.agent-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.agent-timeline,
.agent-evidence-list {
  display: grid;
  gap: 8px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.agent-timeline li,
.agent-evidence-list li {
  display: grid;
  gap: 2px;
  padding: 8px 0;
  border-top: 1px solid var(--border);
}

.agent-timeline li:first-child,
.agent-evidence-list li:first-child {
  border-top: 0;
}

.agent-timeline span,
.agent-evidence-list span {
  color: var(--accent);
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
}

.agent-timeline strong,
.agent-evidence-list strong {
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
}

.agent-timeline small,
.agent-evidence-list small {
  overflow-wrap: anywhere;
  color: var(--text-dim);
  font-size: 9px;
}

.agent-empty {
  min-height: 240px;
}

@media (max-width: 920px) {
  .agent-layout {
    grid-template-columns: 1fr;
  }

  .agent-sidebar {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .agent-history {
    max-height: 240px;
    overflow-y: auto;
  }

  .agent-detail-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .agent-panel-header {
    align-items: flex-start;
    flex-direction: column;
    padding: 14px;
  }

  .agent-main {
    padding: 10px;
  }

  .agent-card {
    padding: 12px;
  }

  .agent-runtime-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .agent-runtime-strip > span:nth-child(2) {
    border-right: 0;
  }

  .agent-runtime-strip > span:nth-child(-n + 2) {
    border-bottom: 1px solid var(--border);
  }

  .agent-composer-actions,
  .agent-authorization {
    align-items: stretch;
    flex-direction: column;
  }
}

.agent-cockpit-header {
  display: flex;
  min-height: 132px;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  padding: 22px 26px;
  border-bottom: 1px solid var(--border);
  background:
    radial-gradient(
      circle at 12% 40%,
      color-mix(in srgb, var(--accent) 10%, transparent),
      transparent 28%
    ),
    var(--surface-1);
}

.agent-identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 18px;
}

.agent-identity-icon {
  display: inline-flex;
  width: 72px;
  height: 72px;
  flex: 0 0 72px;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--border));
  border-radius: 18px;
  color: var(--accent);
  background:
    radial-gradient(
      circle at 50% 45%,
      color-mix(in srgb, var(--accent) 32%, transparent),
      transparent 66%
    ),
    color-mix(in srgb, var(--accent) 12%, var(--surface-2));
}

.agent-identity-icon svg {
  width: 38px;
  height: 38px;
}

.agent-identity h2,
.agent-identity p {
  margin: 0;
}

.agent-identity h2 {
  color: var(--text);
  font-size: 30px;
  letter-spacing: -0.035em;
}

.agent-identity p {
  max-width: 620px;
  margin-top: 4px;
  color: var(--text-muted);
  font-size: var(--font-sm);
  line-height: 1.5;
}

.agent-overview-status {
  display: grid;
  grid-template-columns: repeat(3, minmax(150px, 1fr));
  gap: 12px;
}

.agent-overview-status article {
  display: flex;
  min-width: 0;
  gap: 10px;
  padding: 13px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--surface-2) 84%, transparent);
}

.agent-overview-status article > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.agent-overview-status small {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: var(--font-weight-strong);
}

.agent-overview-status strong {
  overflow: hidden;
  color: var(--text);
  font-size: var(--font-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-overview-status article span:not(.agent-health-dot) {
  overflow: hidden;
  color: var(--text-dim);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-health-dot {
  width: 9px;
  height: 9px;
  flex: 0 0 9px;
  margin-top: 4px;
  border-radius: 999px;
  background: var(--text-dim);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--text-dim) 10%, transparent);
}

.agent-health-dot-ready {
  background: var(--success-text);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--success-text) 12%, transparent);
}

.agent-cockpit {
  display: grid;
  grid-template-columns: minmax(0, 1.72fr) minmax(250px, 0.64fr) minmax(
      300px,
      0.72fr
    );
  grid-template-areas:
    'error error error'
    'create create provider'
    'task history provider'
    'integrations integrations integrations'
    'details details details';
  align-items: start;
  gap: 14px;
  padding: 18px;
}

.agent-cockpit-error {
  grid-area: error;
}

.agent-create-card {
  grid-area: create;
  display: grid;
  gap: 16px;
  padding: 20px;
  border-color: color-mix(in srgb, var(--accent) 32%, var(--border));
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent) 8%, var(--surface-1)),
    var(--surface-1) 48%
  );
}

.agent-create-heading {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.agent-create-heading h3,
.agent-create-heading p {
  margin: 0;
}

.agent-create-heading h3 {
  color: var(--text);
  font-size: 19px;
}

.agent-create-heading p {
  margin-top: 3px;
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.agent-create-icon {
  display: inline-flex;
  color: var(--accent);
}

.agent-create-icon svg {
  width: 28px;
  height: 28px;
}

.agent-prompt {
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  border-radius: var(--radius-md);
  background: var(--surface-0);
}

.agent-prompt textarea {
  width: 100%;
  min-height: 118px;
  box-sizing: border-box;
  resize: vertical;
  padding: 15px 16px 8px;
  border: 0;
  outline: 0;
  color: var(--text);
  background: transparent;
  font: inherit;
  line-height: 1.55;
}

.agent-prompt-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px 11px;
  color: var(--text-dim);
  font-size: 10px;
}

.agent-prompt-tools {
  display: inline-flex;
  align-items: center;
  gap: 11px;
  margin-right: auto;
  color: var(--text-muted);
}

.agent-prompt-tools svg {
  width: 18px;
  height: 18px;
}

.agent-prompt-footer kbd {
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-muted);
  background: var(--surface-2);
  font: inherit;
}

.agent-create-options {
  display: grid;
  grid-template-columns: minmax(220px, 0.85fr) minmax(0, 1.2fr) auto;
  align-items: end;
  gap: 14px;
}

.agent-context-field small {
  color: var(--text-dim);
  font-size: 9px;
}

.agent-create-capabilities {
  align-self: stretch;
}

.agent-capability-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.agent-create-capabilities .agent-capability-option {
  display: inline-flex;
  min-width: auto;
  align-items: center;
  gap: 7px;
  padding: 7px 9px;
  background: var(--surface-0);
}

.agent-create-capabilities .agent-capability-option input {
  margin: 0;
}

.agent-create-capabilities .agent-capability-option span {
  font-size: 10px;
  white-space: nowrap;
}

.agent-create-button {
  min-width: 150px;
  min-height: 56px;
  justify-content: center;
  padding-inline: 20px;
  font-weight: var(--font-weight-strong);
}

.agent-create-button svg {
  width: 18px;
  height: 18px;
}

.agent-create-button svg:last-child {
  margin-left: 4px;
}

.agent-provider-panel {
  grid-area: provider;
  display: grid;
  gap: 14px;
  position: sticky;
  top: 14px;
  padding: 18px;
}

.agent-provider-panel-heading,
.agent-provider-panel-heading > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
}

.agent-provider-panel-heading > div {
  justify-content: flex-start;
}

.agent-provider-panel-heading strong {
  font-size: var(--font-sm);
}

.agent-provider-power {
  width: 21px;
  height: 21px;
  color: var(--success-text);
}

.agent-provider-metrics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.agent-provider-metrics span {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px;
  border-right: 1px solid var(--border);
}

.agent-provider-metrics span:last-child {
  border-right: 0;
}

.agent-provider-metrics small {
  color: var(--text-dim);
  font-size: 9px;
}

.agent-provider-metrics strong {
  overflow: hidden;
  color: var(--text);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-provider-config {
  border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--border));
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent) 6%, var(--surface-0));
}

.agent-provider-config > summary {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 11px 13px;
  color: var(--accent);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  cursor: pointer;
  list-style: none;
}

.agent-provider-summary-icon {
  font-size: 17px;
}

.agent-provider-config > summary::-webkit-details-marker {
  display: none;
}

.agent-provider-config-body {
  display: grid;
  gap: 10px;
  padding: 0 10px 10px;
}

.agent-provider-config-body .agent-budget-fields {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.agent-provider-action {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 11px 2px;
  border: 0;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.agent-provider-action:hover {
  color: var(--text);
}

.agent-provider-action svg {
  width: 17px;
  height: 17px;
}

.agent-task-overview {
  grid-area: task;
  display: grid;
  gap: 12px;
  min-height: 238px;
  padding: 16px;
}

.agent-task-heading > div {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.agent-task-heading > div > div {
  display: grid;
  gap: 2px;
}

.agent-task-heading strong {
  font-size: var(--font-sm);
}

.agent-task-heading small {
  color: var(--text-muted);
  font-size: 10px;
}

.agent-section-icon {
  width: 18px;
  height: 18px;
  color: var(--accent);
  font-size: 18px;
}

.agent-task-steps {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
}

.agent-task-steps article {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 2px 8px;
  position: relative;
  min-width: 0;
}

.agent-task-steps article:not(:last-child)::after {
  position: absolute;
  top: 13px;
  left: 30px;
  right: 4px;
  height: 1px;
  background: var(--border);
  content: '';
}

.agent-task-steps article > span {
  display: inline-flex;
  width: 28px;
  height: 28px;
  z-index: 1;
  grid-row: 1 / 3;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-strong, var(--border));
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-1);
  font-size: 10px;
  font-weight: var(--font-weight-strong);
}

.agent-task-steps article.is-active > span,
.agent-task-steps article.is-done > span {
  border-color: var(--accent);
  color: white;
  background: var(--accent);
}

.agent-task-steps article > strong {
  align-self: end;
  font-size: 10px;
}

.agent-task-steps article > small {
  max-width: 110px;
  color: var(--text-dim);
  font-size: 9px;
  line-height: 1.35;
}

.agent-task-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 62px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
  text-align: left;
}

.agent-task-empty > span {
  display: inline-flex;
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--accent);
  background: var(--surface-2);
}

.agent-task-empty > span svg {
  width: 18px;
  height: 18px;
}

.agent-task-empty > div {
  display: grid;
  gap: 2px;
}

.agent-task-empty strong {
  font-size: var(--font-xs);
}

.agent-task-empty small {
  color: var(--text-dim);
  font-size: 9px;
}

.agent-task-overview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.agent-recent-history {
  grid-area: history;
  display: grid;
  align-content: start;
  gap: 2px;
  min-height: 238px;
}

.agent-history-heading > div {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-history-heading strong {
  font-size: var(--font-sm);
}

.agent-history-show-all {
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  background: transparent;
  font-size: 9px;
  cursor: pointer;
}

.agent-history-show-all:hover {
  color: var(--text);
  background: var(--surface-2);
}

.agent-history-item {
  display: grid;
  grid-template-columns: 18px 1fr;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-width: 0;
  padding: 8px 0;
  border: 0;
  border-top: 1px solid var(--border);
  color: var(--text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.agent-history-item:first-of-type {
  border-top: 0;
}

.agent-history-item > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.agent-history-item strong {
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-history-item small {
  overflow: hidden;
  color: var(--text-dim);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-history-item.is-selected {
  color: var(--accent);
}

.agent-history-state {
  width: 13px;
  height: 13px;
  border-radius: 999px;
  background: var(--text-dim);
}

.agent-history-state.state-completed {
  background: var(--success-text);
}

.agent-history-state.state-failed,
.agent-history-state.state-cancelled {
  background: var(--danger-text);
}

.agent-history-state.state-review,
.agent-history-state.state-checkpoint,
.agent-history-state.state-blocked {
  background: var(--warning-text);
}

.agent-history-state.state-running {
  background: var(--accent);
}

.agent-integrations-summary {
  grid-area: integrations;
  padding: 0;
  overflow: hidden;
}

.agent-integrations-summary > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 13px 16px;
  cursor: pointer;
  list-style: none;
}

.agent-integrations-summary > summary::-webkit-details-marker {
  display: none;
}

.agent-integrations-copy {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.agent-integrations-copy > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.agent-integrations-copy strong {
  font-size: var(--font-sm);
}

.agent-integrations-copy small {
  overflow: hidden;
  color: var(--text-dim);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-integrations-icon {
  width: 24px;
  height: 24px;
  color: var(--accent);
}

.agent-integration-stats {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-integration-stats > span {
  display: flex;
  min-width: 118px;
  align-items: center;
  gap: 9px;
  padding: 8px 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
}

.agent-integration-stats > span > svg {
  width: 17px;
  height: 17px;
  color: var(--text-muted);
}

.agent-integration-stats > span > span {
  display: grid;
  gap: 1px;
}

.agent-integration-stats strong {
  font-size: 10px;
}

.agent-integration-stats small {
  color: var(--text-dim);
  font-size: 9px;
}

.agent-integration-stats b {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
  border-radius: var(--radius-sm);
  color: var(--accent);
  font-size: 10px;
}

.agent-integration-stats b svg {
  width: 15px;
  height: 15px;
}

.agent-integrations-summary[open] > summary {
  border-bottom: 1px solid var(--border);
}

.agent-detail-area {
  display: grid;
  grid-area: details;
  gap: 12px;
}

.agent-detail-area > .agent-current {
  display: none;
}

@media (max-width: 1220px) {
  .agent-cockpit {
    grid-template-columns: minmax(0, 1.45fr) minmax(280px, 0.85fr);
    grid-template-areas:
      'error error'
      'create provider'
      'task provider'
      'history provider'
      'integrations integrations'
      'details details';
  }

  .agent-overview-status {
    grid-template-columns: 1fr;
    min-width: 190px;
  }

  .agent-create-options {
    grid-template-columns: 1fr;
  }

  .agent-create-button {
    width: 100%;
  }
}

@media (max-width: 900px) {
  .agent-cockpit-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .agent-overview-status {
    width: 100%;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .agent-cockpit {
    grid-template-columns: 1fr;
    grid-template-areas:
      'error'
      'create'
      'provider'
      'task'
      'history'
      'integrations'
      'details';
  }

  .agent-provider-panel {
    position: static;
  }

  .agent-integrations-summary > summary {
    align-items: stretch;
    flex-direction: column;
  }

  .agent-integration-stats {
    flex-wrap: wrap;
  }
}

@media (max-width: 640px) {
  .agent-cockpit-header {
    padding: 16px;
  }

  .agent-identity-icon {
    width: 56px;
    height: 56px;
    flex-basis: 56px;
  }

  .agent-identity h2 {
    font-size: 24px;
  }

  .agent-overview-status {
    grid-template-columns: 1fr;
  }

  .agent-cockpit {
    padding: 10px;
  }

  .agent-task-steps {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .agent-task-steps article:not(:last-child)::after {
    display: none;
  }

  .agent-provider-metrics {
    grid-template-columns: 1fr;
  }

  .agent-provider-metrics span {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .agent-provider-metrics span:last-child {
    border-bottom: 0;
  }

  .agent-integration-stats {
    display: grid;
    width: 100%;
  }

  .agent-integration-stats > span {
    min-width: 0;
  }
}
</style>
