<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { routerKey } from 'vue-router';
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  NoSymbolIcon,
  PlayIcon,
  ShieldExclamationIcon,
  StopIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';

import type {
  Deployment,
  DeploymentLog,
  DeploymentPendingChanges,
  DeploymentPlan,
  DeploymentPlanStep,
  DeploymentProviderAvailability,
  DeploymentStepStatus,
  DeploymentStatus,
  ProductionCommandId,
  ProductionDeploymentStatus,
  Project,
  ProjectGitOverview,
  ProjectGitWorkspace,
  TestExecutionRecord,
} from '@dev-dashboard/contracts';

import {
  cancelDeployment,
  createDeploymentConfirmation,
  fetchDeployment,
  fetchDeploymentChanges,
  fetchDeploymentCommits,
  fetchDeploymentHistory,
  fetchDeploymentLog,
  fetchDeploymentPlan,
  fetchProductionDeploymentStatus,
  fetchProjectGitWorkspace,
  fetchProjectTestHistory,
  retryDeploymentVerify,
  startDeployment,
} from '../api';
import DeploymentLogViewer from './DeploymentLogViewer.vue';
import ProductionSudoModal from './ProductionSudoModal.vue';
import ProductionChanges from './production/ProductionChanges.vue';
import ProductionHistory, {
  type ProductionHistoryItem,
} from './production/ProductionHistory.vue';
import ProductionReadiness from './production/ProductionReadiness.vue';
import ProductionRecovery from './production/ProductionRecovery.vue';
import ProductionPlanPanel, {
  type ProductionPlanStepView,
} from './production/ProductionPlanPanel.vue';
import ProductionStatusHeader from './production/ProductionStatusHeader.vue';
import ProductionTimeline, {
  type ProductionTimelineStep,
} from './production/ProductionTimeline.vue';
import StatusBadge from './StatusBadge.vue';
import { buildProductionReadiness } from '../utils/production-readiness';
import UiButton from './ui/UiButton.vue';

interface Props {
  project: Project;
  gitOverview?: ProjectGitOverview | null;
}

const props = withDefaults(defineProps<Props>(), { gitOverview: null });

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
type Operation =
  '' | 'planning' | 'starting' | 'verifying' | 'cancelling' | 'refreshing';

const TERMINAL_STATUSES = new Set<DeploymentStatus>([
  'succeeded',
  'failed',
  'recovery_required',
  'cancelled',
]);

const stepLabels: Record<DeploymentPlanStep['id'], string> = {
  status: 'Status',
  check: 'Check',
  backup: 'Backup',
  migrate: 'Migration',
  deploy: 'Deploy',
  verify: 'Verify',
  restoreCheck: 'Restore check',
  rollback: 'Rollback',
  logs: 'Logs',
  'provider-deploy': 'Deploy Vercel',
  'self-update': 'Self-update',
};

const stepStatusLabels: Record<DeploymentStepStatus, string> = {
  pending: 'Pendente',
  running: 'Em execução',
  succeeded: 'Concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};

const initialLoading = ref(false);
const operation = ref<Operation>('');
const errorMessage = ref('');
const plan = ref<DeploymentPlan | null>(null);
const history = ref<Deployment[]>([]);
const changes = ref<DeploymentPendingChanges | null>(null);
const changesLoading = ref(false);
const commitSubjects = ref<Record<string, string>>({});
const testRuns = ref<TestExecutionRecord[] | null>(null);
const router = inject(routerKey, null);
const activeDeployment = ref<Deployment | null>(null);
const deploymentLog = ref<DeploymentLog | null>(null);
const providerStatus = ref<ProductionDeploymentStatus | null>(null);
const gitWorkspace = ref<ProjectGitWorkspace | null>(null);
const executionDetailsOpen = ref(false);
const sudoModalOpen = ref(false);
const sudoAuthorized = ref(false);
const connectionMessage = ref('');

const MAX_POLL_FAILURES = 5;
let generation = 0;
let requestController: AbortController | undefined;
let pollTimer: number | undefined;
let pollFailureCount = 0;

const hasProductionCapability = computed(() =>
  props.project.capabilities.includes('production'),
);
const production = computed(() => props.project.production);
const isCommand = computed(
  () =>
    hasProductionCapability.value &&
    production.value?.enabled === true &&
    production.value.strategy === 'command',
);
const isGitManaged = computed(
  () =>
    hasProductionCapability.value &&
    production.value?.enabled === true &&
    production.value.strategy === 'git-managed',
);
const commandStatus = computed(() =>
  providerStatus.value?.strategy === 'command' ? providerStatus.value : null,
);
const gitManagedStatus = computed(() =>
  providerStatus.value?.strategy === 'git-managed'
    ? providerStatus.value
    : null,
);
const canExecuteDeployment = computed(
  () => isCommand.value || isGitManaged.value,
);

const latestDeployment = computed(
  () => activeDeployment.value ?? history.value[0] ?? null,
);
const lastSuccessfulDeployment = computed(() => {
  if (activeDeployment.value?.status === 'succeeded') {
    return activeDeployment.value;
  }
  return history.value.find((item) => item.status === 'succeeded') ?? null;
});
const hasActiveDeployment = computed(() => {
  const current = latestDeployment.value;
  return current ? !TERMINAL_STATUSES.has(current.status) : false;
});
const canCancelActiveDeployment = computed(() => {
  const deployment = activeDeployment.value;
  if (!deployment || TERMINAL_STATUSES.has(deployment.status)) return false;
  if (!deployment.currentStepId) return true;
  const currentStep = deployment.timeline.find(
    (step) => step.id === deployment.currentStepId,
  );
  return currentStep ? !currentStep.mutating : true;
});

function mutationStepSucceeded(deployment: Deployment): boolean {
  return Boolean(
    deployment.timeline.find(
      (step) => step.id === 'deploy' || step.id === 'provider-deploy',
    )?.status === 'succeeded',
  );
}

const hasRetryableLatestVerifyTimeline = computed(() => {
  if (!canExecuteDeployment.value) return false;
  const deployment = latestDeployment.value;
  if (
    !deployment ||
    (deployment.status !== 'recovery_required' &&
      deployment.status !== 'failed' &&
      deployment.status !== 'cancelled')
  ) {
    return false;
  }

  const verifyIndex = deployment.timeline.findIndex(
    (step) => step.id === 'verify',
  );
  const verify = deployment.timeline[verifyIndex];
  return Boolean(
    verify &&
    verifyIndex === deployment.timeline.length - 1 &&
    !verify.mutating &&
    !verify.irreversible &&
    (verify.status === 'failed' || verify.status === 'cancelled') &&
    mutationStepSucceeded(deployment) &&
    deployment.timeline
      .slice(0, verifyIndex)
      .every((step) => step.status === 'succeeded'),
  );
});

const branch = computed(() => production.value?.branch ?? 'main');
const localRevision = computed(() => props.gitOverview?.latestCommit?.hash);
const latestVerifySnapshotIsCurrent = computed(() => {
  const deployment = latestDeployment.value;
  return Boolean(
    deployment &&
    props.gitOverview?.branch === deployment.branch &&
    localRevision.value === deployment.revision,
  );
});
const canRetryLatestVerify = computed(
  () =>
    hasRetryableLatestVerifyTimeline.value &&
    latestVerifySnapshotIsCurrent.value,
);
const needsSudoAuthorization = computed(() => {
  const deployment = latestDeployment.value;
  return Boolean(
    isCommand.value &&
    deployment?.errorCode === 'DEPLOYMENT_PRIVILEGE_REQUIRED' &&
    (deployment.status === 'failed' || canRetryLatestVerify.value) &&
    !sudoAuthorized.value,
  );
});

const originRevision = computed(() => {
  if (providerStatus.value?.originRevision) {
    return providerStatus.value.originRevision;
  }
  const target = branch.value;
  const remoteBranch = gitWorkspace.value?.branches.find(
    (item) =>
      item.kind === 'remote' &&
      ((item.remote === 'origin' && item.shortName === target) ||
        item.name === `origin/${target}` ||
        item.name === `remotes/origin/${target}`),
  );
  return remoteBranch?.latestCommit?.hash;
});
const productionRevision = computed(() => {
  if (isCommand.value) return commandStatus.value?.productionRevision;
  return (
    gitManagedStatus.value?.productionRevision ??
    lastSuccessfulDeployment.value?.revision
  );
});
const commandDrift = computed(() => commandStatus.value?.drift ?? 'unknown');

function applicationUrlFromHealth(value: string | undefined): string {
  if (!value) return '';
  try {
    const url = new URL(value);
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return value;
  }
}

const productionUrl = computed(
  () =>
    applicationUrlFromHealth(production.value?.health?.url) ||
    gitManagedStatus.value?.deployment?.url ||
    '',
);
const deploymentInspectorUrl = computed(
  () =>
    gitManagedStatus.value?.deployment?.inspectorUrl ??
    gitManagedStatus.value?.deployment?.url ??
    '',
);
const visibleTimeline = computed(
  () =>
    latestDeployment.value?.timeline ?? gitManagedStatus.value?.timeline ?? [],
);
function providerAvailabilityLabel(
  availability: DeploymentProviderAvailability,
): string {
  const labels: Record<DeploymentProviderAvailability, string> = {
    available: 'Disponível',
    'not-configured': 'Não configurado',
    'auth-error': 'Autenticação',
    'quota-limited': 'Cota limitada',
    'project-not-found': 'Projeto não encontrado',
    unavailable: 'Indisponível',
    'invalid-response': 'Resposta inválida',
  };
  return labels[availability];
}

const statusView = computed(
  (): {
    title: string;
    description: string;
    label: string;
    tone: Tone;
    icon: typeof InformationCircleIcon;
  } => {
    if (!hasProductionCapability.value) {
      if (props.project.productionWarning) {
        return {
          title: 'Contrato de produção inválido',
          description: props.project.productionWarning.message,
          label: 'Bloqueado',
          tone: 'danger',
          icon: XCircleIcon,
        };
      }
      return {
        title: 'Produção não configurada',
        description:
          'Este projeto não possui um Production Contract válido e nenhuma ação de produção está disponível.',
        label: 'Indisponível',
        tone: 'neutral',
        icon: InformationCircleIcon,
      };
    }

    if (!production.value || !production.value.enabled) {
      return {
        title: 'Produção bloqueada por contrato',
        description: production.value?.blockedBy?.length
          ? `Bloqueadores: ${production.value.blockedBy.join(', ')}.`
          : 'O contrato existe, mas mantém operações de produção desabilitadas.',
        label: 'Bloqueada',
        tone: 'warning',
        icon: NoSymbolIcon,
      };
    }

    const deployment = latestDeployment.value;
    if (deployment && canExecuteDeployment.value) {
      if (!TERMINAL_STATUSES.has(deployment.status)) {
        return {
          title: 'Deployment em execução',
          description:
            'Acompanhe as etapas reais da execução e o log do deployment abaixo.',
          label: 'Executando',
          tone: 'info',
          icon: ClockIcon,
        };
      }
      if (deployment.status === 'recovery_required') {
        if (canRetryLatestVerify.value) {
          return {
            title: 'Deploy concluído · verificação falhou',
            description:
              'A mutação terminou e somente o verify falhou. Você pode verificar novamente sem repetir a promoção.',
            label: 'Verificar',
            tone: 'warning',
            icon: ExclamationTriangleIcon,
          };
        }
        return {
          title: 'Produção requer recuperação',
          description:
            'Uma etapa irreversível pode ter produzido efeito parcial. Revise timeline, log e política de rollback antes de repetir o deployment.',
          label: 'Recuperação',
          tone: 'danger',
          icon: ShieldExclamationIcon,
        };
      }
      if (deployment.status === 'failed') {
        if (deployment.errorCode === 'DEPLOYMENT_CHECK_DATABASE_UNAVAILABLE') {
          return {
            title: 'Banco de check indisponível',
            description:
              deployment.errorMessage ??
              'O check não conseguiu acessar o banco configurado para o ambiente de check.',
            label: 'Falhou',
            tone: 'danger',
            icon: XCircleIcon,
          };
        }
        return {
          title: 'Último deployment falhou',
          description:
            deployment.errorMessage ??
            'Revise a execução antes de preparar um novo deployment.',
          label: 'Falhou',
          tone: 'danger',
          icon: XCircleIcon,
        };
      }
      if (deployment.status === 'cancelled') {
        return {
          title: 'Último deployment foi cancelado',
          description:
            'Nenhuma execução está ativa. Prepare um novo deployment quando quiser tentar novamente.',
          label: 'Cancelado',
          tone: 'neutral',
          icon: StopIcon,
        };
      }
    }

    if (isCommand.value) {
      const status = commandStatus.value;
      if (!status) {
        return {
          title: 'Status de produção ainda não consultado',
          description:
            'Atualize o status para observar a revision realmente ativa antes de decidir por um deployment.',
          label: 'Desconhecido',
          tone: 'neutral',
          icon: InformationCircleIcon,
        };
      }
      if (status.statusAvailability !== 'available') {
        return {
          title: 'Status vivo de produção indisponível',
          description:
            status.errorMessage ??
            'prod:status não forneceu uma evidência estruturada válida.',
          label: 'Não verificado',
          tone:
            status.statusAvailability === 'command-failed'
              ? 'danger'
              : 'warning',
          icon: ExclamationTriangleIcon,
        };
      }
      if (status.runtimeState === 'unavailable') {
        return {
          title: 'Produção indisponível',
          description:
            'prod:status confirmou a revision ativa, mas informou que o runtime de produção está indisponível.',
          label: 'Indisponível',
          tone: 'danger',
          icon: XCircleIcon,
        };
      }
      if (status.runtimeState === 'degraded') {
        return {
          title: 'Produção degradada',
          description:
            'prod:status confirmou a revision ativa, mas o runtime informou estado degradado.',
          label: 'Degradada',
          tone: 'warning',
          icon: ExclamationTriangleIcon,
        };
      }
      if (commandDrift.value === 'drift') {
        return {
          title: 'Produção está em revision diferente',
          description:
            'prod:status e origin apontam para SHAs diferentes. Prepare um deployment para revisar e promover a revision atual.',
          label: 'Desatualizada',
          tone: 'warning',
          icon: ExclamationTriangleIcon,
        };
      }
      if (commandDrift.value === 'in-sync' && status.runtimeState === 'ready') {
        return {
          title: 'Produção alinhada com origin',
          description:
            'prod:status confirmou que a revision realmente ativa coincide com origin.',
          label: 'Atualizada',
          tone: 'success',
          icon: CheckCircleIcon,
        };
      }
      return {
        title: 'Estado de produção inconclusivo',
        description:
          'prod:status respondeu, mas ainda não há evidência suficiente para classificar a revision ativa.',
        label: 'Não verificado',
        tone: 'neutral',
        icon: InformationCircleIcon,
      };
    }

    if (isGitManaged.value) {
      const status = gitManagedStatus.value;
      if (!status) {
        return {
          title: 'Status externo ainda não disponível',
          description: 'Atualize o snapshot para comparar origin e produção.',
          label: 'Desconhecido',
          tone: 'neutral',
          icon: InformationCircleIcon,
        };
      }
      if (status.providerAvailability !== 'available') {
        return {
          title: 'Provider externo indisponível',
          description:
            status.errorMessage ??
            providerAvailabilityLabel(status.providerAvailability),
          label: providerAvailabilityLabel(status.providerAvailability),
          tone:
            status.providerAvailability === 'auth-error' ? 'danger' : 'warning',
          icon: ExclamationTriangleIcon,
        };
      }
      if (['queued', 'building'].includes(status.deployment?.state ?? '')) {
        return {
          title: 'Deployment externo em andamento',
          description:
            'O provider está construindo ou promovendo a revision atual.',
          label: 'Executando',
          tone: 'info',
          icon: ClockIcon,
        };
      }
      if (status.deployment?.state === 'error') {
        return {
          title: 'Deployment externo falhou',
          description: 'O provider informou erro no deployment atual.',
          label: 'Falhou',
          tone: 'danger',
          icon: XCircleIcon,
        };
      }
      if (status.drift === 'drift') {
        return {
          title: 'Produção está em revision diferente',
          description:
            'origin e produção apontam para SHAs diferentes. Prepare um deployment para revisar e promover a revision atual.',
          label: 'Desatualizada',
          tone: 'warning',
          icon: ExclamationTriangleIcon,
        };
      }
      if (status.drift === 'in-sync' && status.deployment?.state === 'ready') {
        return {
          title: 'Produção alinhada com origin',
          description: 'A revision coincide e o provider está READY.',
          label: 'Atualizada',
          tone: 'success',
          icon: CheckCircleIcon,
        };
      }
      return {
        title: 'Produção pronta para planejar',
        description:
          'O provider está disponível para preparar um novo deployment.',
        label: 'Pronta',
        tone: 'info',
        icon: InformationCircleIcon,
      };
    }

    return {
      title: 'Estratégia de produção sem operação nesta tela',
      description:
        'O contrato foi reconhecido, mas não há ação compatível disponível.',
      label: 'Indisponível',
      tone: 'neutral',
      icon: InformationCircleIcon,
    };
  },
);

const historyItems = computed<ProductionHistoryItem[]>(() =>
  history.value.map((item) => ({
    id: item.id,
    revision: item.revision,
    subject: commitSubjects.value[item.revision],
    statusLabel: deploymentStatusLabel(item.status),
    tone: deploymentTone(item.status),
    when: formatDate(item.startedAt ?? item.createdAt),
    duration: formatDuration(item),
  })),
);

const planSteps = computed<ProductionPlanStepView[]>(() =>
  (plan.value?.steps ?? []).map((step) => ({
    id: step.id,
    label: stepLabels[step.id],
    script: stepScript(step),
    mutating: step.mutating,
    irreversible: step.irreversible,
  })),
);

const timelineSteps = computed<ProductionTimelineStep[]>(() =>
  visibleTimeline.value.map((step) => ({
    id: step.id,
    label: stepLabels[step.id] ?? 'Provider deploy',
    script: latestDeployment.value ? stepScript(step) : undefined,
    status: step.status,
    statusLabel: stepStatusLabels[step.status],
    duration: stepDuration(step),
  })),
);

const headerFacts = computed(() => {
  if (!hasProductionCapability.value || !production.value?.enabled) return [];
  const revision = productionRevision.value ?? latestDeployment.value?.revision;
  const facts: {
    label: string;
    value: string;
    mono?: boolean;
    title?: string;
  }[] = [
    {
      label: 'Em produção',
      value: shortRevision(revision),
      mono: true,
      ...(revision ? { title: revision } : {}),
    },
    { label: 'Branch', value: branch.value },
  ];
  const runtime = commandStatus.value?.runtimeState;
  if (commandStatus.value?.statusAvailability === 'available' && runtime) {
    facts.push({
      label: 'Saúde',
      value:
        runtime === 'ready'
          ? 'Saudável'
          : runtime === 'degraded'
            ? 'Degradada'
            : 'Indisponível',
    });
  }
  const latest = latestDeployment.value;
  if (latest) {
    facts.push(
      {
        label: 'Último deploy',
        value: formatDate(latest.startedAt ?? latest.createdAt),
      },
      { label: 'Duração', value: formatDuration(latest) },
    );
  }
  return facts;
});

const readinessItems = computed(() =>
  buildProductionReadiness({
    branch: branch.value,
    git: props.gitOverview,
    tests: testRuns.value,
    changes: changes.value,
    health:
      commandStatus.value?.statusAvailability === 'available' &&
      commandStatus.value.runtimeState
        ? commandStatus.value.runtimeState
        : gitManagedStatus.value?.deployment?.state === 'ready'
          ? 'ready'
          : gitManagedStatus.value?.deployment?.state === 'error'
            ? 'unavailable'
            : null,
    policies: production.value?.policies,
    hasBackupCommand: Boolean(production.value?.commands.backup),
  }),
);

/** Última versão estável anterior à que está no ar (ou à tentativa que falhou). */
const previousStable = computed(() => {
  const succeeded = history.value.filter((item) => item.status === 'succeeded');
  const latest = latestDeployment.value;
  const candidate =
    latest?.status === 'succeeded' ? succeeded[1] : succeeded[0];
  if (!candidate) return null;
  return {
    revision: candidate.revision,
    subject: commitSubjects.value[candidate.revision],
    when: formatDate(candidate.startedAt ?? candidate.createdAt),
  };
});

const recoveryOpen = computed(() => {
  const status = latestDeployment.value?.status;
  return status === 'failed' || status === 'recovery_required';
});

async function copyRevision(revision: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(revision);
  } catch {
    // Sem permissão de área de transferência: o hash continua visível na tela.
  }
}

function openTerminal(): void {
  void router?.push({
    name: 'project-terminal',
    params: { projectId: props.project.id },
  });
}

function handleReadinessAction(id: 'run-tests'): void {
  if (id === 'run-tests') {
    void router?.push({
      name: 'project-tests',
      params: { projectId: props.project.id },
    });
  }
}

function stepDuration(step: {
  startedAt?: string | undefined;
  finishedAt?: string | undefined;
}): string | undefined {
  if (!step.startedAt || !step.finishedAt) return undefined;
  const seconds = Math.round(
    (new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime()) /
      1000,
  );
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return seconds < 60
    ? `${seconds}s`
    : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

const publishLabel = computed(() => {
  if (operation.value === 'planning') return 'Preparando…';
  if (needsSudoAuthorization.value) return 'Preparar novamente';
  const data = changes.value;
  if (data?.state === 'available' && data.total > 0) {
    return `Publicar ${data.total} ${data.total === 1 ? 'commit' : 'commits'}`;
  }
  return 'Preparar deployment';
});

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}
function shortRevision(value: string | undefined): string {
  return value ? value.slice(0, 8) : '—';
}
function stepTone(status: DeploymentStepStatus): Tone {
  if (status === 'succeeded') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'running') return 'info';
  if (status === 'cancelled') return 'warning';
  return 'neutral';
}
function deploymentTone(status: DeploymentStatus): Tone {
  if (status === 'succeeded') return 'success';
  if (status === 'failed' || status === 'recovery_required') return 'danger';
  if (status === 'cancelled') return 'warning';
  if (status === 'planned') return 'neutral';
  return 'info';
}
function deploymentStatusLabel(status: DeploymentStatus): string {
  const labels: Record<DeploymentStatus, string> = {
    planned: 'Planejado',
    preparing: 'Preparando',
    backing_up: 'Backup',
    migrating: 'Migrando',
    deploying: 'Deploy',
    verifying: 'Verificando',
    succeeded: 'Concluído',
    failed: 'Falhou',
    recovery_required: 'Requer recuperação',
    cancelled: 'Cancelado',
  };
  return labels[status];
}
function formatDate(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}
function formatDuration(deployment: Deployment): string {
  if (!deployment.startedAt || !deployment.finishedAt) return '—';
  const start = new Date(deployment.startedAt).getTime();
  const finish = new Date(deployment.finishedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(finish) || finish < start) {
    return '—';
  }
  const seconds = Math.round((finish - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes} min ${remaining.toString().padStart(2, '0')} s`;
}
function commandScript(id: ProductionCommandId): string {
  if (id === 'restoreCheck') return 'prod:restore-check';
  return `prod:${id}`;
}
function stepScript(step: {
  id: DeploymentPlanStep['id'];
  script?: string;
}): string {
  return step.script ?? 'Provider API';
}
function handleExecutionDetailsToggle(event: Event): void {
  const target = event.currentTarget;
  if (target instanceof HTMLDetailsElement) {
    executionDetailsOpen.value = target.open;
  }
}

function clearPoll(): void {
  if (pollTimer !== undefined) {
    window.clearTimeout(pollTimer);
    pollTimer = undefined;
  }
}
function schedulePoll(callback: () => void, delay: number): void {
  clearPoll();
  pollTimer = window.setTimeout(callback, delay);
}
function resetPollFailures(): void {
  pollFailureCount = 0;
  connectionMessage.value = '';
}
function schedulePollRetry(
  current: number,
  callback: () => void,
  baseDelay: number,
  finalMessage: string,
): void {
  if (current !== generation) return;
  pollFailureCount += 1;
  if (pollFailureCount > MAX_POLL_FAILURES) {
    connectionMessage.value = '';
    errorMessage.value = finalMessage;
    return;
  }
  const delay = Math.min(baseDelay * 2 ** pollFailureCount, 5_000);
  connectionMessage.value = `Conexão temporariamente indisponível. Reconectando (${pollFailureCount}/${MAX_POLL_FAILURES})…`;
  schedulePoll(callback, delay);
}

async function loadDeploymentLog(
  deploymentId: string,
  current: number,
): Promise<void> {
  try {
    const next = await fetchDeploymentLog(
      props.project.id,
      deploymentId,
      requestController?.signal,
    );
    if (current === generation) deploymentLog.value = next;
  } catch (error) {
    if (current !== generation || isAbortError(error)) return;
    deploymentLog.value = null;
  }
}

async function loadExecutionState(current: number): Promise<void> {
  const [historyResult, workspaceResult] = await Promise.all([
    fetchDeploymentHistory(props.project.id, {
      page: 1,
      pageSize: 8,
      signal: requestController?.signal,
    }),
    props.project.capabilities.includes('git')
      ? fetchProjectGitWorkspace(
          props.project.id,
          requestController?.signal,
        ).catch((error: unknown) => {
          if (isAbortError(error)) throw error;
          return null;
        })
      : Promise.resolve(null),
  ]);
  if (current !== generation) return;
  history.value = historyResult.items;
  gitWorkspace.value = workspaceResult;
  const latest = historyResult.items[0];
  activeDeployment.value =
    latest && !TERMINAL_STATUSES.has(latest.status) ? latest : null;
  executionDetailsOpen.value = Boolean(
    activeDeployment.value || (latest && latest.status !== 'succeeded'),
  );
  if (latest) await loadDeploymentLog(latest.id, current);
}

async function loadProviderState(current: number): Promise<void> {
  const status = await fetchProductionDeploymentStatus(
    props.project.id,
    requestController?.signal,
  );
  if (current === generation) providerStatus.value = status;
}

function scheduleRelevantPoll(current: number): void {
  if (activeDeployment.value) {
    schedulePoll(() => void pollDeployment(current), 700);
    return;
  }
  if (
    isGitManaged.value &&
    ['queued', 'building'].includes(
      gitManagedStatus.value?.deployment?.state ?? '',
    )
  ) {
    schedulePoll(() => void pollProviderStatus(current), 3_000);
  }
}

async function pollDeployment(current: number): Promise<void> {
  const deploymentId = activeDeployment.value?.id;
  if (!deploymentId || current !== generation) return;
  try {
    const [deployment, nextLog] = await Promise.all([
      fetchDeployment(
        props.project.id,
        deploymentId,
        requestController?.signal,
      ),
      fetchDeploymentLog(
        props.project.id,
        deploymentId,
        requestController?.signal,
      ).catch((error: unknown) => {
        if (isAbortError(error)) throw error;
        return null;
      }),
    ]);
    if (current !== generation) return;
    resetPollFailures();
    if (nextLog) deploymentLog.value = nextLog;

    if (TERMINAL_STATUSES.has(deployment.status)) {
      if (deployment.errorCode === 'DEPLOYMENT_PRIVILEGE_REQUIRED') {
        sudoAuthorized.value = false;
      }
      const refreshed = await fetchDeploymentHistory(props.project.id, {
        page: 1,
        pageSize: 8,
        signal: requestController?.signal,
      });
      if (current !== generation) return;
      history.value = refreshed.items;
      if (canExecuteDeployment.value) {
        await loadProviderState(current).catch((error: unknown) => {
          if (isAbortError(error)) throw error;
        });
      }
      if (current !== generation) return;
      activeDeployment.value = deployment;
      executionDetailsOpen.value = deployment.status !== 'succeeded';
      return;
    }

    activeDeployment.value = deployment;
    executionDetailsOpen.value = true;
    schedulePoll(() => void pollDeployment(current), 700);
  } catch (error) {
    if (current !== generation || isAbortError(error)) return;
    schedulePollRetry(
      current,
      () => void pollDeployment(current),
      700,
      error instanceof Error
        ? error.message
        : 'Não foi possível acompanhar o deployment.',
    );
  }
}

async function pollProviderStatus(current: number): Promise<void> {
  if (current !== generation) return;
  try {
    await loadProviderState(current);
    resetPollFailures();
    if (
      current === generation &&
      ['queued', 'building'].includes(
        gitManagedStatus.value?.deployment?.state ?? '',
      )
    ) {
      schedulePoll(() => void pollProviderStatus(current), 3_000);
    }
  } catch (error) {
    if (current !== generation || isAbortError(error)) return;
    schedulePollRetry(
      current,
      () => void pollProviderStatus(current),
      1_500,
      error instanceof Error
        ? error.message
        : 'Não foi possível atualizar o status do provider.',
    );
  }
}

async function loadChanges(current: number): Promise<void> {
  const revision = productionRevision.value;
  if (
    !canExecuteDeployment.value ||
    !revision ||
    !props.project.capabilities.includes('git')
  ) {
    changes.value = null;
    return;
  }
  changesLoading.value = true;
  try {
    const result = await fetchDeploymentChanges(
      props.project.id,
      revision,
      requestController?.signal,
    );
    if (current === generation) changes.value = result;
  } catch (error) {
    if (current === generation && !isAbortError(error)) changes.value = null;
  } finally {
    if (current === generation) changesLoading.value = false;
  }
}

async function loadTestRuns(current: number): Promise<void> {
  if (!props.project.capabilities.includes('tests')) return;
  try {
    const result = await fetchProjectTestHistory(props.project.id, 1, 10);
    if (current === generation) testRuns.value = result.items;
  } catch {
    // Sem o histórico de testes, o checklist só omite esse item.
  }
}

async function loadCommitSubjects(current: number): Promise<void> {
  const revisions = history.value.map((item) => item.revision);
  if (revisions.length === 0 || !props.project.capabilities.includes('git')) {
    return;
  }
  try {
    const commits = await fetchDeploymentCommits(
      props.project.id,
      revisions,
      requestController?.signal,
    );
    if (current !== generation) return;
    commitSubjects.value = Object.fromEntries(
      commits.map((commit) => [commit.hash, commit.subject]),
    );
  } catch {
    // As mensagens são um complemento; o histórico continua sem elas.
  }
}

async function load(preserveOperation = false): Promise<void> {
  const current = ++generation;
  clearPoll();
  requestController?.abort();
  requestController = new AbortController();
  initialLoading.value = false;
  if (!preserveOperation) operation.value = '';
  errorMessage.value = '';
  resetPollFailures();
  plan.value = null;
  history.value = [];
  changes.value = null;
  commitSubjects.value = {};
  testRuns.value = null;
  activeDeployment.value = null;
  deploymentLog.value = null;
  providerStatus.value = null;
  gitWorkspace.value = null;
  executionDetailsOpen.value = false;
  sudoModalOpen.value = false;
  sudoAuthorized.value = false;

  if (!hasProductionCapability.value || !production.value) return;
  if (!production.value.enabled || production.value.strategy === 'disabled') {
    return;
  }

  initialLoading.value = true;
  try {
    await loadExecutionState(current);
    if (canExecuteDeployment.value) await loadProviderState(current);
    if (current === generation) scheduleRelevantPoll(current);
    await Promise.all([
      loadChanges(current),
      loadCommitSubjects(current),
      loadTestRuns(current),
    ]);
  } catch (error) {
    if (current !== generation || isAbortError(error)) return;
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar o estado de produção.';
  } finally {
    if (current === generation) initialLoading.value = false;
  }
}

async function refresh(): Promise<void> {
  if (operation.value) return;
  operation.value = 'refreshing';
  try {
    await load(true);
  } finally {
    operation.value = '';
  }
}

async function preparePlan(): Promise<void> {
  if (!canExecuteDeployment.value || operation.value) return;
  if (
    isGitManaged.value &&
    gitManagedStatus.value?.providerAvailability !== 'available'
  ) {
    errorMessage.value =
      gitManagedStatus.value?.errorMessage ??
      'Configure a integração Vercel antes de preparar o deployment.';
    return;
  }
  const current = generation;
  operation.value = 'planning';
  errorMessage.value = '';
  try {
    const nextPlan = await fetchDeploymentPlan(
      props.project.id,
      requestController?.signal,
    );
    if (current !== generation) return;
    plan.value = nextPlan;
    await nextTick();
    document.getElementById('prod-plan-title')?.focus();
  } catch (error) {
    if (current !== generation || isAbortError(error)) return;
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível gerar o plano de deployment.';
  } finally {
    if (current === generation) operation.value = '';
  }
}

function closePlan(): void {
  if (operation.value === 'starting') return;
  plan.value = null;
}

async function handleSudoAuthorized(): Promise<void> {
  sudoModalOpen.value = false;
  sudoAuthorized.value = true;
  if (canRetryLatestVerify.value) await retryLatestVerify();
  else await preparePlan();
}

async function confirmAndStart(): Promise<void> {
  const currentPlan = plan.value;
  if (!currentPlan || operation.value) return;
  const current = generation;
  operation.value = 'starting';
  errorMessage.value = '';
  try {
    const confirmation = await createDeploymentConfirmation(
      props.project.id,
      currentPlan.planHash,
      requestController?.signal,
    );
    if (current !== generation) return;
    const deployment = await startDeployment(
      props.project.id,
      currentPlan.planHash,
      confirmation.token,
      requestController?.signal,
    );
    if (current !== generation) return;
    plan.value = null;
    activeDeployment.value = deployment;
    executionDetailsOpen.value = !TERMINAL_STATUSES.has(deployment.status)
      ? true
      : deployment.status !== 'succeeded';
    deploymentLog.value = null;
    history.value = [
      deployment,
      ...history.value.filter((item) => item.id !== deployment.id),
    ].slice(0, 8);
    if (TERMINAL_STATUSES.has(deployment.status)) {
      await loadDeploymentLog(deployment.id, current);
    } else {
      schedulePoll(() => void pollDeployment(current), 350);
    }
  } catch (error) {
    if (current !== generation || isAbortError(error)) return;
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível iniciar o deployment.';
  } finally {
    if (current === generation) operation.value = '';
  }
}

async function retryLatestVerify(): Promise<void> {
  const deployment = latestDeployment.value;
  if (!deployment || !canRetryLatestVerify.value || operation.value) return;
  const current = generation;
  operation.value = 'verifying';
  errorMessage.value = '';
  try {
    const retrying = await retryDeploymentVerify(
      props.project.id,
      deployment.id,
      requestController?.signal,
    );
    if (current !== generation) return;
    activeDeployment.value = retrying;
    executionDetailsOpen.value = true;
    history.value = [
      retrying,
      ...history.value.filter((item) => item.id !== retrying.id),
    ].slice(0, 8);
    schedulePoll(() => void pollDeployment(current), 250);
  } catch (error) {
    if (current !== generation || isAbortError(error)) return;
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível repetir a verificação de produção.';
  } finally {
    if (current === generation) operation.value = '';
  }
}

async function cancelActiveDeployment(): Promise<void> {
  const deployment = latestDeployment.value;
  if (
    !deployment ||
    TERMINAL_STATUSES.has(deployment.status) ||
    operation.value ||
    !canCancelActiveDeployment.value
  ) {
    return;
  }
  const current = generation;
  operation.value = 'cancelling';
  errorMessage.value = '';
  try {
    activeDeployment.value = await cancelDeployment(
      props.project.id,
      deployment.id,
      requestController?.signal,
    );
    if (current !== generation) return;
    schedulePoll(() => void pollDeployment(current), 250);
  } catch (error) {
    if (current !== generation || isAbortError(error)) return;
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível cancelar o deployment.';
  } finally {
    if (current === generation) operation.value = '';
  }
}

watch(
  () => props.project.id,
  () => void load(),
  { immediate: true },
);

onBeforeUnmount(() => {
  generation += 1;
  clearPoll();
  requestController?.abort();
});
</script>

<template>
  <section
    class="prod-page"
    aria-label="Produção"
    :aria-busy="initialLoading || Boolean(operation)"
  >
    <ProductionStatusHeader
      :tone="statusView.tone"
      :icon="statusView.icon"
      :title="statusView.title"
      :description="statusView.description"
      :label="statusView.label"
      :facts="headerFacts"
    >
      <template v-if="hasProductionCapability && production?.enabled">
        <a
          v-if="productionUrl"
          class="prod-link"
          :href="productionUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir produção
          <ArrowTopRightOnSquareIcon aria-hidden="true" />
        </a>
        <UiButton
          v-if="canExecuteDeployment"
          :disabled="Boolean(operation)"
          @click="refresh"
        >
          <ArrowPathIcon
            :class="{ 'prod-spin': operation === 'refreshing' }"
            aria-hidden="true"
          />
          Atualizar status
        </UiButton>
        <UiButton
          v-if="needsSudoAuthorization"
          variant="primary"
          :disabled="Boolean(operation)"
          @click="sudoModalOpen = true"
        >
          <ShieldExclamationIcon aria-hidden="true" />
          Autorizar sudo
        </UiButton>
        <UiButton
          v-if="canRetryLatestVerify"
          variant="primary"
          :disabled="Boolean(operation)"
          @click="retryLatestVerify"
        >
          <ArrowPathIcon
            :class="{ 'prod-spin': operation === 'verifying' }"
            aria-hidden="true"
          />
          {{
            operation === 'verifying' ? 'Verificando' : 'Verificar novamente'
          }}
        </UiButton>
        <UiButton
          v-if="hasActiveDeployment"
          variant="danger"
          :disabled="Boolean(operation) || !canCancelActiveDeployment"
          :title="
            canCancelActiveDeployment
              ? undefined
              : 'A etapa atual altera produção e não pode ser cancelada com segurança.'
          "
          @click="cancelActiveDeployment"
        >
          <StopIcon aria-hidden="true" />
          {{
            operation === 'cancelling' ? 'Cancelando' : 'Cancelar deployment'
          }}
        </UiButton>
      </template>
    </ProductionStatusHeader>

    <div v-if="connectionMessage" class="prod-alert" role="status">
      <ArrowPathIcon class="prod-spin" aria-hidden="true" />
      <div>
        <strong>Reconectando ao deployment</strong>
        <span>{{ connectionMessage }}</span>
      </div>
    </div>

    <div v-if="errorMessage" class="prod-alert is-error" role="alert">
      <ExclamationTriangleIcon aria-hidden="true" />
      <div>
        <strong>Não foi possível concluir a operação</strong>
        <span>{{ errorMessage }}</span>
      </div>
    </div>

    <div v-if="initialLoading" class="prod-alert" role="status">
      <ArrowPathIcon class="prod-spin" aria-hidden="true" />
      <span>Consultando o estado real de produção…</span>
    </div>

    <template v-if="hasProductionCapability && production">
      <div v-if="canExecuteDeployment" class="prod-columns">
        <div class="prod-main">
          <ProductionChanges
            v-if="!hasActiveDeployment && !canRetryLatestVerify"
            :changes="changes"
            :loading="changesLoading"
            :comparable="Boolean(productionRevision)"
            :branch="branch"
          >
            <template #action>
              <UiButton
                v-if="!plan"
                variant="primary"
                :disabled="
                  Boolean(operation) ||
                  (isGitManaged &&
                    gitManagedStatus?.providerAvailability !== 'available')
                "
                @click="preparePlan"
              >
                <ArrowPathIcon
                  v-if="operation === 'planning'"
                  class="prod-spin"
                  aria-hidden="true"
                />
                <PlayIcon v-else aria-hidden="true" />
                {{ publishLabel }}
              </UiButton>
            </template>
          </ProductionChanges>

          <ProductionReadiness
            v-if="!hasActiveDeployment && !canRetryLatestVerify"
            :items="readinessItems"
            @action="handleReadinessAction"
          />

          <ProductionPlanPanel
            v-if="plan"
            title="Plano de deployment"
            :branch="plan.branch"
            :project-name="plan.projectName"
            :revision="plan.revision"
            :steps="planSteps"
            :busy="Boolean(operation)"
            :confirm-label="
              operation === 'starting' ? 'Iniciando…' : 'Iniciar deployment'
            "
            @cancel="closePlan"
            @confirm="confirmAndStart"
          />

          <ProductionRecovery
            v-if="!hasActiveDeployment && history.length > 0"
            :policy="production.policies.rollback"
            :has-backup-command="Boolean(production.commands.backup)"
            :has-restore-check="Boolean(production.commands.restoreCheck)"
            :previous="previousStable"
            :current="productionRevision"
            :open="recoveryOpen"
            @copy-revision="copyRevision"
            @open-terminal="openTerminal"
          />

          <details
            v-if="latestDeployment || (isGitManaged && visibleTimeline.length)"
            class="prod-card prod-execution"
            :open="executionDetailsOpen"
            @toggle="handleExecutionDetailsToggle"
          >
            <summary>
              <div>
                <span class="prod-eyebrow">Execução</span>
                <strong>Detalhes da última execução</strong>
              </div>
              <div v-if="latestDeployment" class="prod-execution-meta">
                <StatusBadge :tone="deploymentTone(latestDeployment.status)">
                  {{ deploymentStatusLabel(latestDeployment.status) }}
                </StatusBadge>
                <span>{{
                  formatDate(
                    latestDeployment.startedAt ?? latestDeployment.createdAt,
                  )
                }}</span>
              </div>
            </summary>
            <div class="prod-execution-body">
              <ProductionTimeline :steps="timelineSteps" />
              <div
                v-if="latestDeployment?.status === 'recovery_required'"
                class="prod-recovery"
              >
                <ShieldExclamationIcon aria-hidden="true" />
                <div v-if="canRetryLatestVerify">
                  <strong>O deploy terminou; não repita a mutação</strong>
                  <p>
                    Use “Verificar novamente” para repetir apenas a validação de
                    leitura.
                  </p>
                </div>
                <div v-else>
                  <strong>Não faça rollback cego</strong>
                  <p>
                    Confira log, schema, backup e a política do projeto antes de
                    qualquer recuperação manual.
                  </p>
                </div>
              </div>
              <DeploymentLogViewer
                v-if="latestDeployment && deploymentLog"
                :log="deploymentLog"
                :active="hasActiveDeployment"
                :open="
                  hasActiveDeployment ||
                  latestDeployment.status === 'recovery_required' ||
                  latestDeployment.status === 'failed'
                "
              />
            </div>
          </details>
        </div>

        <aside class="prod-side">
          <ProductionHistory :items="historyItems" />
        </aside>
      </div>

      <details class="prod-card prod-technical">
        <summary>Detalhes técnicos</summary>
        <div class="prod-technical-grid">
          <div>
            <span>Local</span>
            <code :title="localRevision">{{
              shortRevision(localRevision)
            }}</code>
          </div>
          <div>
            <span>origin/{{ branch }}</span>
            <code :title="originRevision">{{
              shortRevision(originRevision)
            }}</code>
          </div>
          <div>
            <span>Produção</span>
            <code :title="productionRevision">{{
              shortRevision(productionRevision)
            }}</code>
          </div>
          <div>
            <span>Estratégia</span>
            <strong>{{ production.strategy }}</strong>
          </div>
          <div>
            <span>Provider</span>
            <strong>{{ production.provider }}</strong>
          </div>
          <div v-if="latestDeployment?.providerDeploymentId">
            <span>Deployment provider</span>
            <code>{{ latestDeployment.providerDeploymentId }}</code>
          </div>
          <div v-if="production.health">
            <span>Health</span>
            <code>{{ production.health.url }}</code>
          </div>
        </div>
        <div
          v-if="isGitManaged && gitManagedStatus"
          class="prod-provider-detail"
        >
          <div>
            <strong>{{
              gitManagedStatus.providerProjectName ??
              gitManagedStatus.externalProject
            }}</strong>
            <StatusBadge
              :tone="
                gitManagedStatus.providerAvailability === 'available'
                  ? 'success'
                  : 'warning'
              "
            >
              {{
                providerAvailabilityLabel(gitManagedStatus.providerAvailability)
              }}
            </StatusBadge>
          </div>
          <a
            v-if="deploymentInspectorUrl"
            :href="deploymentInspectorUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir deployment <ArrowTopRightOnSquareIcon aria-hidden="true" />
          </a>
          <div
            v-if="gitManagedStatus.localOperations.length"
            class="prod-local-operations"
          >
            <span>Operações locais declaradas</span>
            <div>
              <code
                v-for="item in gitManagedStatus.localOperations"
                :key="item"
              >
                {{ commandScript(item) }}
              </code>
            </div>
          </div>
        </div>
      </details>
    </template>

    <ProductionSudoModal
      :open="sudoModalOpen"
      :project-id="project.id"
      @close="sudoModalOpen = false"
      @authorized="handleSudoAuthorized"
    />
  </section>
</template>

<style scoped>
.prod-page {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 14px;
}

.prod-link {
  display: inline-flex;
  height: 34px;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.prod-link:hover {
  background: var(--surface-2);
}

.prod-link svg {
  width: 15px;
  height: 15px;
}

.prod-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  background: var(--surface-1);
  font-size: 13px;
}

.prod-alert svg {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

.prod-alert div {
  display: flex;
  flex-direction: column;
}

.prod-alert.is-error {
  border-color: transparent;
  color: var(--danger-text, #f85149);
  background: color-mix(in srgb, var(--danger-text, #f85149) 12%, transparent);
}

.prod-spin {
  animation: prod-spin 1s linear infinite;
}

@keyframes prod-spin {
  to {
    transform: rotate(360deg);
  }
}

.prod-columns {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 14px;
  align-items: start;
}

@media (max-width: 1000px) {
  .prod-columns {
    grid-template-columns: minmax(0, 1fr);
  }
}

.prod-main,
.prod-side {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 14px;
}

.prod-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.prod-card summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 20px;
  cursor: pointer;
  list-style: none;
}

.prod-card summary::-webkit-details-marker {
  display: none;
}

.prod-eyebrow {
  display: block;
  color: var(--accent);
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.prod-execution-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-dim);
  font-size: 12.5px;
}

.prod-execution-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0 20px 18px;
}

.prod-recovery {
  display: flex;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  color: var(--warning-text);
  background: color-mix(in srgb, var(--warning-text) 10%, transparent);
}

.prod-recovery svg {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
}

.prod-recovery p {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}

.prod-technical-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px 20px;
  padding: 0 20px 16px;
}

.prod-technical-grid div,
.prod-provider-detail > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.prod-technical-grid span,
.prod-local-operations span {
  color: var(--text-dim);
  font-size: 11.5px;
  font-weight: 600;
  text-transform: uppercase;
}

.prod-technical-grid code,
.prod-local-operations code {
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  overflow-wrap: anywhere;
}

.prod-provider-detail {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 20px;
  padding: 0 20px 18px;
}

.prod-provider-detail a {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.prod-provider-detail a svg {
  width: 14px;
  height: 14px;
}

.prod-local-operations {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.prod-local-operations div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
