<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import {
  ArrowPathIcon,
  BoltIcon,
  CheckCircleIcon,
  CpuChipIcon,
  NoSymbolIcon,
  PauseCircleIcon,
  PlayIcon,
  StopIcon,
} from '@heroicons/vue/24/outline';

import type { Project, TaskContext } from '@dev-dashboard/contracts';

import { fetchTaskContexts } from '../api/task-contexts';
import {
  adoptAgentBacklog,
  agentRuntimeWebSocketUrl,
  cancelAgentTask,
  clearAgentBudget,
  createAgentTask,
  executeAgentConversationTurn,
  executeAgentTask,
  fetchAgentActivity,
  fetchAgentBudget,
  fetchAgentConversation,
  fetchAgentProviders,
  fetchAgentTasks,
  fetchAgentTaskStatus,
  fetchAgentUsage,
  recoverAgentTask,
  resolveAgentCheckpoint,
  retryAgentTask,
  setAgentBudget,
  setAgentAuthorization,
  type AgentActivity,
  type AgentBacklogIssue,
  type AgentBudgetOverview,
  type AgentCapability,
  type AgentConversationTurn,
  type AgentExecutionResult,
  type AgentProviderDiagnosticCode,
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
const instruction = ref('');
const conversationInstruction = ref('');
const conversationTurns = ref<AgentConversationTurn[]>([]);
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

const pendingCheckpoint = computed(() => {
  const values = activity.value?.checkpoints ?? [];
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index]?.status === 'pending') return values[index] ?? null;
  }
  return null;
});

const authorizationByCapability = computed(() => {
  const values = new Map<AgentCapability, boolean>();
  for (const authorization of activity.value?.authorizations ?? []) {
    values.set(authorization.capability, authorization.granted);
  }
  return values;
});

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

const providerDiagnosticSummary = (
  code: AgentProviderDiagnosticCode | undefined,
): string => {
  switch (code) {
    case 'ready':
      return 'Provider pronto para execução.';
    case 'command-unavailable':
      return 'CLI ou componente local não foi encontrado.';
    case 'version-unsupported':
      return 'Versão instalada não é suportada.';
    case 'authentication-required':
      return 'Autenticação não foi confirmada.';
    case 'preflight-timeout':
      return 'Validação do provider excedeu o tempo limite.';
    case 'runtime-failed':
      return 'O provider respondeu, mas o preflight falhou.';
    case 'bridge-token-missing':
      return 'Credencial local do Browser Bridge não está disponível.';
    case 'bridge-unavailable':
      return 'Browser Bridge não está acessível.';
    case 'bridge-unhealthy':
      return 'Browser Bridge respondeu com estado não saudável.';
    case 'bridge-paused':
      return 'Browser Bridge está pausado.';
    case 'browser-extension-unavailable':
      return 'Extensão ChatGPT Browser não está conectada.';
    case 'browser-extension-stale':
      return 'Heartbeat da extensão ChatGPT Browser está desatualizado.';
    case 'browser-session-unavailable':
      return 'Sessão do ChatGPT não está disponível na extensão.';
    case 'automatic-unavailable':
      return 'Automatic não encontrou Codex ou Claude Code pronto.';
    default:
      return 'Diagnóstico do provider indisponível.';
  }
};

const providerDiagnosticAction = (
  code: AgentProviderDiagnosticCode | undefined,
): string => {
  switch (code) {
    case 'ready':
      return 'Nenhuma ação necessária.';
    case 'command-unavailable':
      return 'Instale o CLI/componente oficial e revalide.';
    case 'version-unsupported':
      return 'Atualize o provider para uma versão suportada e revalide.';
    case 'authentication-required':
      return 'Autentique o provider pelo fluxo oficial local e revalide.';
    case 'preflight-timeout':
      return 'Verifique se o provider responde localmente e revalide.';
    case 'runtime-failed':
      return 'Execute o diagnóstico oficial do provider localmente e revalide.';
    case 'bridge-token-missing':
      return 'Reconfigure o setup local do Browser Bridge e revalide.';
    case 'bridge-unavailable':
      return 'Inicie o Browser Bridge local e revalide.';
    case 'bridge-unhealthy':
      return 'Corrija o estado do Browser Bridge e revalide.';
    case 'bridge-paused':
      return 'Retome o Browser Bridge e revalide.';
    case 'browser-extension-unavailable':
      return 'Ative/conecte a extensão ChatGPT Browser e revalide.';
    case 'browser-extension-stale':
      return 'Reconecte ou recarregue a extensão e revalide.';
    case 'browser-session-unavailable':
      return 'Abra uma sessão autenticada do ChatGPT e revalide.';
    case 'automatic-unavailable':
      return 'Configure Codex ou Claude Code e revalide.';
    default:
      return 'Revalide o provider após corrigir a configuração local.';
  }
};

const canExecute = computed(
  () =>
    currentTask.value?.task.state === 'queued' &&
    !executing.value &&
    !mutating.value &&
    currentProvider.value !== null &&
    currentProvider.value.availability !== 'unavailable' &&
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
    currentProvider.value.availability !== 'unavailable' &&
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

function applySnapshot(snapshot: AgentRealtimeSnapshot): void {
  status.value = snapshot.status;
  activity.value = snapshot.activity;
  replaceTask(snapshot.status.task);
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
    const [nextStatus, nextActivity, nextConversation, nextUsage, nextBudget] =
      await Promise.all([
        fetchAgentTaskStatus(props.project.id, taskId),
        fetchAgentActivity(props.project.id, taskId),
        fetchAgentConversation(props.project.id, taskId),
        fetchAgentUsage(props.project.id, taskId, usagePeriodRange()),
        fetchAgentBudget(props.project.id, taskId),
      ]);
    if (requestGeneration !== generation || selectedTaskId.value !== taskId) {
      return;
    }
    status.value = nextStatus;
    activity.value = nextActivity;
    conversationTurns.value = nextConversation;
    usage.value = nextUsage;
    syncBudgetInputs(nextBudget);
    replaceTask(nextStatus.task);
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
    const [nextProviders, nextTasks, nextTaskContexts] = await Promise.all([
      fetchAgentProviders(),
      fetchAgentTasks(props.project.id),
      fetchTaskContexts(props.project.id),
    ]);
    if (requestGeneration !== generation) return;
    providers.value = nextProviders;
    tasks.value = nextTasks;
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
    <header class="agent-panel-header">
      <div>
        <p class="agent-kicker">Agent Runtime</p>
        <h2>Agente</h2>
        <p>
          Solicite trabalho, autorize capacidades e acompanhe o estado sem
          depender de stdout bruto.
        </p>
      </div>
      <div class="agent-header-status">
        <StatusBadge :tone="taskTone">{{ taskStateLabel }}</StatusBadge>
        <span
          class="agent-socket-indicator"
          :class="{ 'agent-socket-connected': socketState === 'connected' }"
        >
          {{ socketState === 'connected' ? 'Tempo real' : 'Snapshot' }}
        </span>
      </div>
    </header>

    <EmptyState
      v-if="loading"
      class="agent-empty"
      icon="•••"
      title="Carregando Agent Runtime"
      description="Recuperando providers, tasks e estado atual."
    />

    <div v-else class="agent-layout">
      <aside class="agent-sidebar">
        <section class="agent-section">
          <div class="agent-section-heading">
            <div>
              <span>Provider</span>
              <strong>Execução</strong>
            </div>
            <StatusBadge
              v-if="currentProvider"
              :tone="providerTone(currentProvider)"
            >
              {{ providerAvailabilityLabel(currentProvider) }}
            </StatusBadge>
            <button
              class="agent-icon-button"
              type="button"
              aria-label="Revalidar providers"
              :disabled="providerRefreshing || executing"
              @click="refreshProviders"
            >
              <ArrowPathIcon aria-hidden="true" />
            </button>
          </div>

          <label class="agent-field">
            <span>Provider da próxima execução</span>
            <select v-model="selectedProviderId" :disabled="executing">
              <option
                v-for="provider in providerOptions"
                :key="provider.providerId"
                :value="provider.providerId"
              >
                {{ providerLabel(provider.providerId) }}
                · {{ providerAvailabilityLabel(provider) }}
              </option>
            </select>
          </label>
          <div
            v-if="currentProvider?.diagnostic"
            class="agent-hint"
            data-testid="provider-diagnostic"
          >
            <strong>
              {{ providerDiagnosticSummary(currentProvider.diagnostic.code) }}
            </strong>
            <br />
            Evidência:
            {{
              currentProvider.diagnostic.evidence ??
              currentProvider.reason ??
              'Sem evidência adicional.'
            }}
            <br />
            Próxima ação:
            {{ providerDiagnosticAction(currentProvider.diagnostic.code) }}
          </div>
          <p v-else-if="currentProvider?.reason" class="agent-hint">
            {{ currentProvider.reason }}
          </p>
          <p
            v-if="
              currentProvider?.providerId !== 'automatic' &&
              currentProvider?.quota
            "
            class="agent-hint"
          >
            Uso do plano:
            {{
              currentProvider.quota.status === 'available'
                ? (currentProvider.quota.label ?? 'Disponível')
                : 'Indisponível'
            }}
            <template v-if="currentProvider.quota.reason">
              · {{ currentProvider.quota.reason }}
            </template>
          </p>
        </section>

        <section class="agent-section agent-history">
          <div class="agent-section-heading">
            <div>
              <span>Histórico</span>
              <strong>Tasks do projeto</strong>
            </div>
            <button
              class="agent-icon-button"
              type="button"
              aria-label="Atualizar tasks"
              :disabled="loading"
              @click="load"
            >
              <ArrowPathIcon aria-hidden="true" />
            </button>
          </div>

          <p v-if="!sortedTasks.length" class="agent-hint">
            Nenhuma task criada neste projeto.
          </p>
          <button
            v-for="record in sortedTasks"
            :key="record.task.id"
            class="agent-task-item"
            :class="{
              'agent-task-item-active': record.task.id === selectedTaskId,
            }"
            type="button"
            @click="selectTask(record.task.id)"
          >
            <span>{{ record.task.summary }}</span>
            <small>{{ record.task.state }}</small>
          </button>
        </section>
      </aside>

      <main class="agent-main">
        <div v-if="errorMessage" class="agent-error" role="alert">
          <span>{{ errorMessage }}</span>
          <button type="button" @click="errorMessage = ''">Fechar</button>
        </div>

        <ProjectAgentIntegrationsCard
          :project="project"
          v-bind="environmentInstanceId ? { environmentInstanceId } : {}"
        />

        <section class="agent-composer agent-card">
          <div class="agent-section-heading">
            <div>
              <span>Nova task</span>
              <strong>O que deve ser feito?</strong>
            </div>
            <span class="agent-shortcut">Ctrl/⌘ + Enter</span>
          </div>

          <textarea
            v-model="instruction"
            rows="4"
            maxlength="4000"
            placeholder="Descreva a alteração, investigação ou revisão..."
            aria-label="Instrução para nova task do Agente"
            @keydown="handleComposerKeydown"
          />

          <p class="agent-hint">
            Para adotar o backlog real: “pegue a próxima atividade” ou “pegue a
            #123”.
          </p>

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
              {{ backlogAdoptionNotice.taskContextId ?? 'indisponível' }} ·
              {{
                backlogAdoptionNotice.reused
                  ? 'vínculo existente reutilizado'
                  : 'novo vínculo criado'
              }}
            </span>
          </div>

          <label class="agent-field">
            <span>Task Context</span>
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
          </label>
          <p v-if="selectedCreateTaskContext" class="agent-hint">
            A Environment Instance será derivada deste contexto:
            {{
              selectedCreateTaskContext.environmentInstanceId ??
              'não informada'
            }}.
          </p>

          <div class="agent-capability-picker">
            <span>Capabilities solicitadas</span>
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
              <span>
                <strong>{{ capability.label }}</strong>
                <small>{{ capability.id }}</small>
              </span>
            </label>
          </div>

          <div class="agent-composer-actions">
            <p>
              Criar a task não concede capabilities. Autorizações são feitas
              separadamente abaixo.
            </p>
            <button
              class="primary-button"
              type="button"
              :disabled="!canCreate"
              @click="createTask"
            >
              <BoltIcon aria-hidden="true" />
              Criar task
            </button>
          </div>
        </section>

        <template v-if="currentTask">
          <section class="agent-current agent-card">
            <div class="agent-section-heading">
              <div>
                <span>Task atual</span>
                <strong>{{ currentTask.task.summary }}</strong>
              </div>
              <StatusBadge :tone="taskTone">{{ taskStateLabel }}</StatusBadge>
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
                    authorizationByCapability.get(capability)
                      ? 'Concedida'
                      : 'Não concedida'
                  }}</small>
                </div>
                <button
                  class="secondary-button"
                  type="button"
                  :disabled="mutating"
                  @click="
                    toggleAuthorization(
                      capability,
                      !authorizationByCapability.get(capability),
                    )
                  "
                >
                  {{
                    authorizationByCapability.get(capability)
                      ? 'Revogar'
                      : 'Autorizar'
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

        <EmptyState
          v-else
          class="agent-empty agent-card"
          icon="◇"
          title="Nenhuma task selecionada"
          description="Crie uma task para iniciar um workflow com o Agent Runtime."
        />
      </main>
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
</style>
