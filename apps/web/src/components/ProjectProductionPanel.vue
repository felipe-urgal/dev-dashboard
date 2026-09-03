<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
  type Component,
} from 'vue';
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
} from '@dev-dashboard/contracts';

import {
  cancelDeployment,
  createDeploymentConfirmation,
  fetchDeployment,
  fetchDeploymentHistory,
  fetchDeploymentLog,
  fetchDeploymentPlan,
  fetchProductionDeploymentStatus,
  fetchProjectGitWorkspace,
  retryDeploymentVerify,
  startDeployment,
} from '../api';
import DeploymentLogViewer from './DeploymentLogViewer.vue';
import ProductionSudoModal from './ProductionSudoModal.vue';
import StatusBadge from './StatusBadge.vue';

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
const activeDeployment = ref<Deployment | null>(null);
const deploymentLog = ref<DeploymentLog | null>(null);
const providerStatus = ref<ProductionDeploymentStatus | null>(null);
const gitWorkspace = ref<ProjectGitWorkspace | null>(null);
const planHeading = ref<HTMLElement | null>(null);
const sudoModalOpen = ref(false);
const sudoAuthorized = ref(false);

let generation = 0;
let requestController: AbortController | undefined;
let pollTimer: number | undefined;

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
const canExecuteDeployment = computed(
  () => isCommand.value || isGitManaged.value,
);

const latestDeployment = computed(
  () => activeDeployment.value ?? history.value[0] ?? null,
);
const lastSuccessfulDeployment = computed(() => {
  if (activeDeployment.value?.status === 'succeeded')
    return activeDeployment.value;
  return history.value.find((item) => item.status === 'succeeded') ?? null;
});
const hasActiveDeployment = computed(() => {
  const current = latestDeployment.value;
  return current ? !TERMINAL_STATUSES.has(current.status) : false;
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
  if (providerStatus.value?.originRevision)
    return providerStatus.value.originRevision;
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
const productionRevision = computed(
  () =>
    providerStatus.value?.productionRevision ??
    lastSuccessfulDeployment.value?.revision,
);
const commandDrift = computed(() => {
  if (!isCommand.value || !originRevision.value || !productionRevision.value)
    return 'unknown';
  return originRevision.value === productionRevision.value
    ? 'in-sync'
    : 'drift';
});

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
    providerStatus.value?.deployment?.url ||
    '',
);
const deploymentInspectorUrl = computed(
  () =>
    providerStatus.value?.deployment?.inspectorUrl ??
    providerStatus.value?.deployment?.url ??
    '',
);
const visibleCommandTimeline = computed(
  () => latestDeployment.value?.timeline ?? [],
);
const visibleProviderTimeline = computed(
  () => providerStatus.value?.timeline ?? [],
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
    icon: Component;
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
          description: isGitManaged.value
            ? 'O plano local está executando validações e acompanhando a promoção real na Vercel.'
            : 'A timeline e o log abaixo acompanham somente o trabalho real registrado pelo domínio de deployment.',
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
              'O check não conseguiu acessar o banco configurado para o ambiente de check. Verifique a dependência e tente novamente.',
            label: 'Falhou',
            tone: 'danger',
            icon: XCircleIcon,
          };
        }
        return {
          title: 'Último deployment falhou',
          description:
            deployment.errorCode === 'DEPLOYMENT_PRIVILEGE_REQUIRED'
              ? (deployment.errorMessage ??
                'O comando requer privilégio não interativo configurado no host.')
              : deployment.failurePoint === 'before-irreversible'
                ? 'A falha ocorreu antes de uma mudança irreversível.'
                : 'Revise a timeline e o log antes de gerar um novo plano.',
          label: 'Falhou',
          tone: 'danger',
          icon: XCircleIcon,
        };
      }
      if (deployment.status === 'cancelled') {
        return {
          title: 'Último deployment foi cancelado',
          description:
            'Nenhuma execução está ativa. Gere um novo plano somente quando quiser tentar novamente.',
          label: 'Cancelado',
          tone: 'neutral',
          icon: StopIcon,
        };
      }
      if (isCommand.value && commandDrift.value === 'drift') {
        return {
          title: 'Produção está em revision diferente',
          description:
            'origin e produção apontam para SHAs diferentes. Prepare um deployment para revisar e promover a revision atual.',
          label: 'Desatualizada',
          tone: 'warning',
          icon: ExclamationTriangleIcon,
        };
      }
      if (isCommand.value) {
        return {
          title: 'Último deployment concluído',
          description:
            'A execução terminou com sucesso. Health atual continua separado do resultado histórico do verify.',
          label: 'Concluído',
          tone: 'success',
          icon: CheckCircleIcon,
        };
      }
    }

    if (isCommand.value) {
      return {
        title: 'Produção pronta para planejar',
        description:
          'Gere um plano para revisar revision, etapas e impacto antes de confirmar qualquer mutação.',
        label: 'Pronta',
        tone: 'info',
        icon: InformationCircleIcon,
      };
    }

    if (isGitManaged.value) {
      const status = providerStatus.value;
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
            'A Vercel está construindo ou promovendo a revisão atual.',
          label: 'Executando',
          tone: 'info',
          icon: ClockIcon,
        };
      }
      if (status.deployment?.state === 'error') {
        return {
          title: 'Deployment externo falhou',
          description:
            'A Vercel informou erro no deployment atual. READY e health da aplicação continuam sinais separados.',
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
          description:
            'A revision coincide e o provider está READY. Um novo plano continua disponível para uma nova revisão.',
          label: 'Atualizada',
          tone: 'success',
          icon: CheckCircleIcon,
        };
      }
      return {
        title: 'Produção pronta para planejar',
        description:
          'O provider está disponível. Gere um plano antes de promover a revision confirmada.',
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

const readinessCopy = computed(() => {
  const verify = latestDeployment.value?.timeline.find(
    (step) => step.id === 'verify',
  );
  if (verify?.status === 'running') return 'Verify em execução';
  if (verify?.status === 'succeeded') return 'Último verify passou';
  if (verify?.status === 'failed') return 'Último verify falhou';
  if (isGitManaged.value) {
    const state = providerStatus.value?.deployment?.state;
    if (state === 'ready') return 'Provider READY';
    if (state === 'building') return 'Provider construindo';
    if (state === 'queued') return 'Provider na fila';
    if (state === 'error') return 'Provider com erro';
    if (state === 'cancelled') return 'Deployment cancelado';
    return 'Não informado';
  }
  return 'Sem verify recente';
});

const healthCopy = computed(() => {
  if (!production.value?.health) return 'Não declarado no contrato';
  const verify = latestDeployment.value?.timeline.find(
    (step) => step.id === 'verify',
  );
  if (verify?.status === 'succeeded')
    return 'HTTP configurado; último verify passou';
  return 'HTTP configurado; estado atual não consultado';
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
function commandScript(id: ProductionCommandId): string {
  if (id === 'restoreCheck') return 'prod:restore-check';
  return `prod:${id}`;
}
function stepScript(step: DeploymentPlanStep): string {
  return 'script' in step ? step.script : 'Vercel API';
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

async function loadDeploymentLog(
  deploymentId: string,
  current: number,
): Promise<void> {
  try {
    const log = await fetchDeploymentLog(
      props.project.id,
      deploymentId,
      requestController?.signal,
    );
    if (current === generation) deploymentLog.value = log;
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
      providerStatus.value?.deployment?.state ?? '',
    )
  ) {
    schedulePoll(() => void pollProviderStatus(current), 3_000);
  }
}

async function pollDeployment(current: number): Promise<void> {
  const deploymentId = activeDeployment.value?.id;
  if (!deploymentId || current !== generation) return;
  try {
    const [deployment, log] = await Promise.all([
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
    activeDeployment.value = deployment;
    if (log) deploymentLog.value = log;

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
      activeDeployment.value = deployment;
      if (isGitManaged.value) {
        await loadProviderState(current).catch((error: unknown) => {
          if (isAbortError(error)) throw error;
        });
      }
      return;
    }
    schedulePoll(() => void pollDeployment(current), 700);
  } catch (error) {
    if (current !== generation || isAbortError(error)) return;
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível acompanhar o deployment.';
  }
}

async function pollProviderStatus(current: number): Promise<void> {
  if (current !== generation) return;
  try {
    await loadProviderState(current);
    if (
      current === generation &&
      ['queued', 'building'].includes(
        providerStatus.value?.deployment?.state ?? '',
      )
    ) {
      schedulePoll(() => void pollProviderStatus(current), 3_000);
    }
  } catch (error) {
    if (current !== generation || isAbortError(error)) return;
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível atualizar o status do provider.';
  }
}

async function load(): Promise<void> {
  const current = ++generation;
  clearPoll();
  requestController?.abort();
  requestController = new AbortController();
  initialLoading.value = false;
  operation.value = '';
  errorMessage.value = '';
  plan.value = null;
  history.value = [];
  activeDeployment.value = null;
  deploymentLog.value = null;
  providerStatus.value = null;
  gitWorkspace.value = null;
  sudoModalOpen.value = false;
  sudoAuthorized.value = false;

  if (!hasProductionCapability.value || !production.value) return;
  if (!production.value.enabled || production.value.strategy === 'disabled')
    return;

  initialLoading.value = true;
  try {
    await loadExecutionState(current);
    if (isGitManaged.value) await loadProviderState(current);
    if (current === generation) scheduleRelevantPoll(current);
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
  operation.value = 'refreshing';
  await load();
}

async function preparePlan(): Promise<void> {
  if (!canExecuteDeployment.value || operation.value) return;
  if (
    isGitManaged.value &&
    providerStatus.value?.providerAvailability !== 'available'
  ) {
    errorMessage.value =
      providerStatus.value?.errorMessage ??
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
    planHeading.value?.focus();
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
    operation.value
  )
    return;
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
    class="production-panel"
    aria-labelledby="production-title"
    :aria-busy="initialLoading || Boolean(operation)"
  >
    <article class="production-card production-overview">
      <div class="production-state-icon" :class="`is-${statusView.tone}`">
        <component :is="statusView.icon" aria-hidden="true" />
      </div>
      <div class="production-state-copy">
        <span class="production-eyebrow">Produção</span>
        <div class="production-title-row">
          <h3 id="production-title">{{ statusView.title }}</h3>
          <StatusBadge :tone="statusView.tone">{{
            statusView.label
          }}</StatusBadge>
        </div>
        <p>{{ statusView.description }}</p>
      </div>
      <div
        v-if="hasProductionCapability && production?.enabled"
        class="production-overview-actions"
      >
        <a
          v-if="productionUrl"
          class="secondary-button"
          :href="productionUrl"
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir produção
          <ArrowTopRightOnSquareIcon aria-hidden="true" />
        </a>
        <button
          v-if="needsSudoAuthorization"
          class="primary-button"
          type="button"
          :disabled="Boolean(operation)"
          @click="sudoModalOpen = true"
        >
          <ShieldExclamationIcon aria-hidden="true" />
          Autorizar sudo
        </button>
        <button
          v-if="canRetryLatestVerify"
          class="primary-button"
          type="button"
          :disabled="Boolean(operation)"
          @click="retryLatestVerify"
        >
          <ArrowPathIcon
            :class="{ 'production-spin': operation === 'verifying' }"
            aria-hidden="true"
          />
          {{
            operation === 'verifying' ? 'Verificando' : 'Verificar novamente'
          }}
        </button>
        <button
          v-if="
            canExecuteDeployment &&
            !hasActiveDeployment &&
            !canRetryLatestVerify
          "
          :class="
            needsSudoAuthorization ? 'secondary-button' : 'primary-button'
          "
          type="button"
          :disabled="
            Boolean(operation) ||
            (isGitManaged &&
              providerStatus?.providerAvailability !== 'available')
          "
          @click="preparePlan"
        >
          <ArrowPathIcon
            v-if="operation === 'planning'"
            class="production-spin"
            aria-hidden="true"
          />
          <PlayIcon v-else aria-hidden="true" />
          {{
            operation === 'planning'
              ? 'Gerando plano'
              : needsSudoAuthorization
                ? 'Preparar novamente'
                : 'Preparar deployment'
          }}
        </button>
        <button
          v-if="canExecuteDeployment && hasActiveDeployment"
          class="secondary-button production-danger-button"
          type="button"
          :disabled="Boolean(operation)"
          @click="cancelActiveDeployment"
        >
          <ArrowPathIcon
            v-if="operation === 'cancelling'"
            class="production-spin"
            aria-hidden="true"
          />
          <StopIcon v-else aria-hidden="true" />
          {{ operation === 'cancelling' ? 'Cancelando' : 'Cancelar' }}
        </button>
        <button
          v-if="isGitManaged"
          class="secondary-button"
          type="button"
          :disabled="Boolean(operation)"
          @click="refresh"
        >
          <ArrowPathIcon
            :class="{ 'production-spin': operation === 'refreshing' }"
            aria-hidden="true"
          />
          Atualizar status
        </button>
      </div>
    </article>

    <div v-if="errorMessage" class="production-alert" role="alert">
      <ExclamationTriangleIcon aria-hidden="true" />
      <div>
        <strong>Não foi possível concluir a operação</strong>
        <span>{{ errorMessage }}</span>
      </div>
    </div>

    <div v-if="initialLoading" class="production-loading" role="status">
      <ArrowPathIcon class="production-spin" aria-hidden="true" />
      <span>Consultando o estado real de produção…</span>
    </div>

    <template v-if="hasProductionCapability && production">
      <section class="production-summary-grid" aria-label="Resumo de produção">
        <article class="production-card production-revisions">
          <header>
            <div>
              <span class="production-eyebrow">Revisions</span>
              <h4>Local → origin → produção</h4>
            </div>
            <StatusBadge
              v-if="providerStatus"
              :tone="
                providerStatus.drift === 'in-sync'
                  ? 'success'
                  : providerStatus.drift === 'drift'
                    ? 'warning'
                    : 'neutral'
              "
            >
              {{
                providerStatus.drift === 'in-sync'
                  ? 'Alinhada'
                  : providerStatus.drift === 'drift'
                    ? 'Diferente'
                    : 'Desconhecida'
              }}
            </StatusBadge>
          </header>
          <div class="production-revision-flow">
            <div>
              <span>Local</span
              ><code :title="localRevision">{{
                shortRevision(localRevision)
              }}</code>
            </div>
            <span aria-hidden="true">→</span>
            <div>
              <span>origin/{{ branch }}</span
              ><code :title="originRevision">{{
                shortRevision(originRevision)
              }}</code>
            </div>
            <span aria-hidden="true">→</span>
            <div>
              <span>Produção</span
              ><code :title="productionRevision">{{
                shortRevision(productionRevision)
              }}</code>
            </div>
          </div>
          <p v-if="isCommand" class="production-note">
            Em contratos command, a revision de produção é a última execução
            concluída registrada pelo domínio.
          </p>
          <p v-else class="production-note">
            O snapshot Vercel consulta a revisão remota e não altera o working
            tree local.
          </p>
        </article>

        <article class="production-card production-signals">
          <header>
            <div>
              <span class="production-eyebrow">Sinais</span>
              <h4>Readiness e health</h4>
            </div>
          </header>
          <dl>
            <div>
              <dt>Readiness</dt>
              <dd>{{ readinessCopy }}</dd>
            </div>
            <div>
              <dt>Health</dt>
              <dd>{{ healthCopy }}</dd>
            </div>
            <div>
              <dt>{{ isCommand ? 'Runtime' : 'Provider' }}</dt>
              <dd>{{ production.provider }}</dd>
            </div>
            <div>
              <dt>Estratégia</dt>
              <dd>{{ production.strategy }}</dd>
            </div>
          </dl>
          <p v-if="production.health" class="production-health-url">
            <span>Health declarado</span
            ><code>{{ production.health.url }}</code>
          </p>
        </article>
      </section>

      <article
        v-if="isGitManaged && providerStatus"
        class="production-card production-provider"
      >
        <header>
          <div>
            <span class="production-eyebrow">Provider externo</span>
            <h4>
              {{
                providerStatus.providerProjectName ??
                providerStatus.externalProject
              }}
            </h4>
          </div>
          <StatusBadge
            :tone="
              providerStatus.providerAvailability === 'available'
                ? 'success'
                : 'warning'
            "
          >
            {{ providerAvailabilityLabel(providerStatus.providerAvailability) }}
          </StatusBadge>
        </header>
        <div
          v-if="providerStatus.deployment"
          class="production-provider-deployment"
        >
          <div>
            <span>Último deployment</span>
            <strong>{{ providerStatus.deployment.state }}</strong>
            <small>{{ formatDate(providerStatus.deployment.createdAt) }}</small>
          </div>
          <a
            :href="deploymentInspectorUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir deployment <ArrowTopRightOnSquareIcon aria-hidden="true" />
          </a>
        </div>
        <div
          v-if="providerStatus.localOperations.length"
          class="production-local-operations"
        >
          <span>Operações locais declaradas</span>
          <div>
            <code v-for="item in providerStatus.localOperations" :key="item">{{
              commandScript(item)
            }}</code>
          </div>
          <small>
            Check, migration e verify entram no plano conforme o contrato; a
            promoção é executada pela API da Vercel.
          </small>
        </div>
      </article>

      <article v-if="plan" class="production-card production-plan">
        <header>
          <div>
            <span class="production-eyebrow">Confirmação</span>
            <h4 ref="planHeading" tabindex="-1">
              Revise o plano antes de executar
            </h4>
          </div>
          <StatusBadge tone="warning">Ação de produção</StatusBadge>
        </header>
        <div class="production-plan-target">
          <div>
            <span>Projeto</span><strong>{{ plan.projectName }}</strong>
          </div>
          <div>
            <span>Branch</span><strong>{{ plan.branch }}</strong>
          </div>
          <div>
            <span>Revision alvo</span
            ><code :title="plan.revision">{{
              shortRevision(plan.revision)
            }}</code>
          </div>
        </div>
        <ol class="production-timeline production-plan-steps">
          <li v-for="step in plan.steps" :key="step.id">
            <span class="production-step-marker" aria-hidden="true"></span>
            <div>
              <strong>{{ stepLabels[step.id] }}</strong
              ><code>{{ stepScript(step) }}</code>
            </div>
            <div class="production-step-flags">
              <StatusBadge v-if="step.mutating" tone="warning"
                >Muda estado</StatusBadge
              >
              <StatusBadge v-if="step.irreversible" tone="danger"
                >Irreversível</StatusBadge
              >
              <StatusBadge v-if="!step.mutating" tone="neutral"
                >Leitura/validação</StatusBadge
              >
            </div>
          </li>
        </ol>
        <div class="production-plan-warning">
          <ShieldExclamationIcon aria-hidden="true" />
          <p>
            A confirmação fica vinculada a este projeto, revision e planHash. Se
            branch, working tree ou revision mudar, o backend recusa a execução.
          </p>
        </div>
        <footer class="production-plan-actions">
          <button
            class="secondary-button"
            type="button"
            :disabled="Boolean(operation)"
            @click="plan = null"
          >
            Descartar plano
          </button>
          <button
            class="primary-button"
            type="button"
            :disabled="Boolean(operation)"
            @click="confirmAndStart"
          >
            <ArrowPathIcon
              v-if="operation === 'starting'"
              class="production-spin"
              aria-hidden="true"
            />
            <PlayIcon v-else aria-hidden="true" />
            {{
              operation === 'starting'
                ? 'Iniciando'
                : 'Confirmar e iniciar deployment'
            }}
          </button>
        </footer>
      </article>

      <article
        v-if="canExecuteDeployment && latestDeployment"
        class="production-card production-execution"
      >
        <header>
          <div>
            <span class="production-eyebrow">Execução</span>
            <h4>Timeline do deployment</h4>
          </div>
          <div class="production-execution-meta">
            <StatusBadge :tone="deploymentTone(latestDeployment.status)">{{
              deploymentStatusLabel(latestDeployment.status)
            }}</StatusBadge>
            <span>{{
              formatDate(
                latestDeployment.startedAt ?? latestDeployment.createdAt,
              )
            }}</span>
          </div>
        </header>
        <ol class="production-timeline">
          <li v-for="step in visibleCommandTimeline" :key="step.id">
            <span
              class="production-step-marker"
              :class="`is-${step.status}`"
              aria-hidden="true"
            ></span>
            <div>
              <strong>{{ stepLabels[step.id] }}</strong>
              <code>{{ stepScript(step) }}</code>
              <small v-if="step.startedAt"
                >{{ formatDate(step.startedAt)
                }}<template v-if="step.finishedAt">
                  → {{ formatDate(step.finishedAt) }}</template
                ></small
              >
            </div>
            <StatusBadge :tone="stepTone(step.status)">{{
              stepStatusLabels[step.status]
            }}</StatusBadge>
          </li>
        </ol>
        <div
          v-if="latestDeployment.status === 'recovery_required'"
          class="production-recovery"
        >
          <ShieldExclamationIcon aria-hidden="true" />
          <div v-if="canRetryLatestVerify">
            <strong>O deploy terminou; não repita a mutação</strong>
            <p>
              Apenas o verify falhou. Use “Verificar novamente” para repetir
              somente a validação de leitura.
            </p>
          </div>
          <div v-else>
            <strong>Não faça rollback cego</strong>
            <p>
              A execução passou por uma etapa irreversível. Confira log, schema,
              backup e a política do projeto antes de qualquer recuperação
              manual.
            </p>
          </div>
        </div>
        <DeploymentLogViewer
          v-if="deploymentLog"
          :log="deploymentLog"
          :active="hasActiveDeployment"
          :open="
            hasActiveDeployment ||
            latestDeployment.status === 'recovery_required'
          "
        />
      </article>

      <article
        v-if="
          isGitManaged && !latestDeployment && visibleProviderTimeline.length
        "
        class="production-card production-execution"
      >
        <header>
          <div>
            <span class="production-eyebrow">Timeline externa</span>
            <h4>Deployment do provider</h4>
          </div>
        </header>
        <ol class="production-timeline">
          <li v-for="step in visibleProviderTimeline" :key="step.id">
            <span
              class="production-step-marker"
              :class="`is-${step.status}`"
              aria-hidden="true"
            ></span>
            <div>
              <strong>Provider deploy</strong
              ><small v-if="step.startedAt">{{
                formatDate(step.startedAt)
              }}</small>
            </div>
            <StatusBadge :tone="stepTone(step.status)">{{
              stepStatusLabels[step.status]
            }}</StatusBadge>
          </li>
        </ol>
      </article>

      <article
        v-if="canExecuteDeployment && history.length > 0"
        class="production-card production-history"
      >
        <header>
          <div>
            <span class="production-eyebrow">Histórico</span>
            <h4>Execuções recentes</h4>
          </div>
        </header>
        <ul>
          <li v-for="item in history" :key="item.id">
            <div>
              <code :title="item.revision">{{
                shortRevision(item.revision)
              }}</code
              ><span>{{ formatDate(item.startedAt ?? item.createdAt) }}</span>
            </div>
            <StatusBadge :tone="deploymentTone(item.status)">{{
              deploymentStatusLabel(item.status)
            }}</StatusBadge>
          </li>
        </ul>
      </article>
    </template>

    <ProductionSudoModal
      :open="sudoModalOpen"
      :project-id="project.id"
      @close="sudoModalOpen = false"
      @authorized="handleSudoAuthorized"
    />
  </section>
</template>

<style scoped src="./ProjectProductionPanel.css"></style>
