<script setup lang="ts">
import {
  ArrowPathIcon,
  CheckCircleIcon,
  CircleStackIcon,
  CommandLineIcon,
  CubeIcon,
  EllipsisVerticalIcon,
  EnvelopeIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  GlobeAltIcon,
  InformationCircleIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  QueueListIcon,
} from '@heroicons/vue/24/outline';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import type { Project } from '@dev-dashboard/contracts';

import {
  fetchDockerComposeLifecycleExecution,
  fetchDockerComposeLogs,
  fetchDockerComposeSnapshot,
  prepareDockerComposeLifecycleConfirmation,
  startDockerComposeLifecycleExecution,
  type DockerComposeInspectionState,
  type DockerComposeLifecycleExecution,
  type DockerComposeLifecycleOperation,
  type DockerComposeLogSnapshot,
  type DockerComposePortBinding,
  type DockerComposePreflightConflict,
  type DockerComposeRuntimeService,
  type DockerComposeServiceHealth,
  type DockerComposeServiceState,
  type DockerComposeSnapshot,
} from '../api/docker-compose';
import EmptyState from './EmptyState.vue';
import StatusBadge from './StatusBadge.vue';
import type { StatusBadgeTone } from './status-badge-types';

const props = defineProps<{
  project: Project;
  environmentInstanceId?: string;
}>();

const loading = ref(false);
const action = ref('');
const submitting = ref(false);
const errorMessage = ref('');
const snapshot = ref<DockerComposeSnapshot | null>(null);
const execution = ref<DockerComposeLifecycleExecution | null>(null);
const logs = ref<DockerComposeLogSnapshot | null>(null);
const logsService = ref('');
const serviceSearch = ref('');
const confirmationOperation = ref<DockerComposeLifecycleOperation | null>(null);
const confirmationService = ref<string | undefined>();
let generation = 0;
let pollTimer: ReturnType<typeof setTimeout> | undefined;

const config = computed(() => snapshot.value?.inspection.config);
const runtimeServices = computed(
  () => snapshot.value?.inspection.runtime?.services ?? [],
);
const runtimeByService = computed(
  () =>
    new Map<string, DockerComposeRuntimeService>(
      runtimeServices.value.map((service) => [service.service, service]),
    ),
);
const hasActiveServices = computed(() =>
  runtimeServices.value.some((service) =>
    ['running', 'restarting', 'paused'].includes(service.state),
  ),
);
const owned = computed(() => snapshot.value?.ownership.owned === true);
const hasExternalRuntime = computed(
  () => runtimeServices.value.length > 0 && !owned.value,
);
const executionActive = computed(
  () =>
    execution.value?.status === 'queued' ||
    execution.value?.status === 'running',
);
const busy = computed(
  () => Boolean(action.value) || submitting.value || executionActive.value,
);
const canStart = computed(
  () =>
    Boolean(config.value) &&
    snapshot.value?.inspection.state === 'available' &&
    snapshot.value?.preflight?.state === 'ready' &&
    !hasActiveServices.value &&
    !hasExternalRuntime.value &&
    !busy.value,
);
const visibleServices = computed(() => {
  const services = config.value?.services ?? [];
  const query = serviceSearch.value.trim().toLowerCase();
  if (!query) return services;

  return services.filter((service) => {
    const searchable = [
      service.name,
      service.image ?? '',
      service.ports.map(portLabel).join(' '),
      service.dependsOn.join(' '),
    ]
      .join(' ')
      .toLowerCase();

    return searchable.includes(query);
  });
});
const problemDiagnostics = computed(() => {
  if (!snapshot.value) return [];

  return [
    snapshot.value.inspection.diagnostic,
    snapshot.value.preflight?.diagnostic,
    snapshot.value.ownership.reconciliation.diagnostic,
    hasExternalRuntime.value
      ? 'Existe runtime Docker Compose sem ownership comprovado do Dashboard; mutações permanecem bloqueadas.'
      : undefined,
    execution.value?.resultState?.endsWith('-unverified')
      ? execution.value.diagnostic
      : undefined,
  ].filter((message): message is string => Boolean(message));
});
const hasProblems = computed(
  () =>
    problemDiagnostics.value.length > 0 ||
    Boolean(snapshot.value?.preflight?.conflicts.length),
);

const inspectionSummary = computed(() => {
  const state = snapshot.value?.inspection.state;
  if (state === 'available') {
    const services = runtimeServices.value;
    if (services.length === 0) {
      return {
        title: 'Stack parada',
        detail: 'Nenhum container observado',
        tone: 'neutral' as const,
        icon: InformationCircleIcon,
      };
    }
    if (
      services.some(
        (service) =>
          service.state === 'dead' || service.health === 'unhealthy',
      )
    ) {
      return {
        title: 'Stack degradada',
        detail: 'Há serviço com falha ou healthcheck unhealthy',
        tone: 'danger' as const,
        icon: ExclamationCircleIcon,
      };
    }
    const active = services.filter((service) =>
      ['running', 'restarting', 'paused'].includes(service.state),
    );
    if (active.length === services.length) {
      const transitional = services.some(
        (service) =>
          service.state !== 'running' || service.health === 'starting',
      );
      return {
        title: transitional ? 'Stack convergindo' : 'Stack rodando',
        detail: transitional
          ? 'Serviços ativos com estado transitório'
          : 'Todos os serviços observados estão ativos',
        tone: transitional ? ('warning' as const) : ('success' as const),
        icon: transitional ? ArrowPathIcon : CheckCircleIcon,
      };
    }
    if (active.length > 0) {
      return {
        title: 'Stack parcial',
        detail: 'Apenas parte dos serviços está ativa',
        tone: 'warning' as const,
        icon: ExclamationTriangleIcon,
      };
    }
    return {
      title: 'Stack parada',
      detail: 'Containers presentes, sem serviço ativo',
      tone: 'neutral' as const,
      icon: InformationCircleIcon,
    };
  }

  const summary: Record<
    Exclude<DockerComposeInspectionState, 'available'>,
    {
      title: string;
      detail: string;
      tone: 'warning' | 'danger';
      icon: typeof CheckCircleIcon;
    }
  > = {
    'runtime-unavailable': {
      title: 'Runtime indisponível',
      detail: 'Configuração disponível, runtime indisponível',
      tone: 'warning',
      icon: ExclamationCircleIcon,
    },
    'docker-missing': {
      title: 'Docker indisponível',
      detail: 'Docker não está disponível neste ambiente',
      tone: 'danger',
      icon: ExclamationCircleIcon,
    },
    'compose-unavailable': {
      title: 'Compose indisponível',
      detail: 'Docker Compose não está disponível',
      tone: 'danger',
      icon: ExclamationCircleIcon,
    },
    'invalid-output': {
      title: 'Compose inválido',
      detail: 'Estado de runtime estruturado inválido',
      tone: 'danger',
      icon: ExclamationCircleIcon,
    },
  };

  return state && state !== 'available'
    ? summary[state]
    : summary['invalid-output'];
});

const ownershipSummary = computed(() =>
  owned.value
    ? {
        title: 'Ownership ativo',
        detail: 'Ações de serviço disponíveis',
        tone: 'success' as const,
        icon: CheckCircleIcon,
      }
    : hasExternalRuntime.value
      ? {
          title: 'Stack externa',
          detail: 'Runtime detectado sem ownership do Dashboard',
          tone: 'warning' as const,
          icon: LockClosedIcon,
        }
      : {
          title: 'Sem ownership',
          detail: 'O Dashboard ainda não iniciou esta stack',
          tone: 'neutral' as const,
          icon: LockClosedIcon,
        },
);

const preflightSummary = computed(() => {
  const preflight = snapshot.value?.preflight;
  if (!preflight) {
    return {
      title: 'Portas não avaliadas',
      detail: 'Preflight não disponível',
      tone: 'neutral' as const,
      icon: InformationCircleIcon,
    };
  }

  if (preflight.state === 'blocked') {
    const count = preflight.conflicts.length;
    return {
      title:
        count + (count === 1 ? ' conflito de porta' : ' conflitos de porta'),
      detail: 'Portas publicadas não disponíveis',
      tone: 'danger' as const,
      icon: ExclamationTriangleIcon,
    };
  }

  if (preflight.state === 'ready') {
    return {
      title: 'Portas disponíveis',
      detail: 'Preflight sem conflitos',
      tone: 'success' as const,
      icon: CheckCircleIcon,
    };
  }

  return {
    title: 'Portas não verificadas',
    detail: 'Preflight indisponível',
    tone: 'warning' as const,
    icon: ExclamationCircleIcon,
  };
});

function runtimeFor(service: string): DockerComposeRuntimeService | undefined {
  return runtimeByService.value.get(service);
}

function stateTone(state: DockerComposeServiceState): StatusBadgeTone {
  if (state === 'running') return 'success';
  if (state === 'restarting' || state === 'paused' || state === 'created')
    return 'warning';
  if (state === 'dead') return 'danger';
  return 'neutral';
}

function healthTone(health: DockerComposeServiceHealth): StatusBadgeTone {
  if (health === 'healthy') return 'success';
  if (health === 'unhealthy') return 'danger';
  if (health === 'starting') return 'warning';
  return 'neutral';
}

function stateLabel(state: DockerComposeServiceState): string {
  const labels: Record<DockerComposeServiceState, string> = {
    running: 'Rodando',
    exited: 'Parado',
    restarting: 'Reiniciando',
    created: 'Criado',
    paused: 'Pausado',
    dead: 'Falhou',
    unknown: 'Desconhecido',
  };
  return labels[state];
}

function healthLabel(health: DockerComposeServiceHealth): string {
  const labels: Record<DockerComposeServiceHealth, string> = {
    healthy: 'Healthy',
    unhealthy: 'Unhealthy',
    starting: 'Starting',
    none: 'Sem healthcheck',
    unknown: 'Health desconhecido',
  };
  return labels[health];
}

function portLabel(port: DockerComposePortBinding): string {
  const target = String(port.targetPort);
  const published =
    port.publishedPort === undefined ? target : String(port.publishedPort);
  return published + ':' + target + '/' + port.protocol;
}

function conflictReasonLabel(
  reason: DockerComposePreflightConflict['reason'],
): string {
  const labels: Record<DockerComposePreflightConflict['reason'], string> = {
    occupied: 'Porta ocupada',
    reserved: 'Porta reservada',
    'duplicate-declaration': 'Porta declarada em duplicidade',
  };
  return labels[reason];
}

function serviceIcon(service: string) {
  const normalized = service.toLowerCase();
  if (normalized === 'db' || normalized.includes('postgres'))
    return CircleStackIcon;
  if (normalized.includes('mail')) return EnvelopeIcon;
  if (normalized.includes('redis')) return QueueListIcon;
  if (normalized === 'web' || normalized.includes('app')) return GlobeAltIcon;
  if (normalized.includes('webpack')) return CubeIcon;
  if (normalized.includes('wrk') || normalized.includes('worker'))
    return CommandLineIcon;
  return CubeIcon;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function clearPoll(): void {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = undefined;
}

function schedulePoll(currentGeneration: number): void {
  clearPoll();
  if (!executionActive.value || currentGeneration !== generation) return;
  pollTimer = setTimeout(() => {
    void pollExecution(currentGeneration);
  }, 750);
}

async function refreshSnapshot(currentGeneration = generation): Promise<void> {
  const result = await fetchDockerComposeSnapshot(
    props.project.id,
    props.environmentInstanceId,
  );
  if (currentGeneration === generation) snapshot.value = result;
}

async function pollExecution(currentGeneration: number): Promise<void> {
  try {
    const result = await fetchDockerComposeLifecycleExecution(
      props.project.id,
      props.environmentInstanceId,
    );
    if (currentGeneration !== generation) return;
    const wasActive = executionActive.value;
    execution.value = result;
    if (executionActive.value) {
      schedulePoll(currentGeneration);
      return;
    }
    if (wasActive || result) await refreshSnapshot(currentGeneration);
  } catch (error) {
    if (currentGeneration === generation) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível acompanhar o lifecycle do Docker Compose.';
    }
  }
}

async function load(): Promise<void> {
  const requestGeneration = ++generation;
  clearPoll();
  loading.value = true;
  errorMessage.value = '';

  const [snapshotResult, executionResult] = await Promise.allSettled([
    fetchDockerComposeSnapshot(props.project.id, props.environmentInstanceId),
    fetchDockerComposeLifecycleExecution(
      props.project.id,
      props.environmentInstanceId,
    ),
  ]);

  if (requestGeneration !== generation) return;

  if (snapshotResult.status === 'fulfilled') {
    snapshot.value = snapshotResult.value;
  } else {
    snapshot.value = null;
    errorMessage.value =
      snapshotResult.reason instanceof Error
        ? snapshotResult.reason.message
        : 'Não foi possível inspecionar o Docker Compose.';
  }
  execution.value =
    executionResult.status === 'fulfilled' ? executionResult.value : null;
  loading.value = false;
  schedulePoll(requestGeneration);
}

function openConfirmation(
  operation: DockerComposeLifecycleOperation,
  service?: string,
): void {
  if (busy.value) return;
  errorMessage.value = '';
  confirmationOperation.value = operation;
  confirmationService.value = service;
}

function closeConfirmation(): void {
  if (submitting.value) return;
  confirmationOperation.value = null;
  confirmationService.value = undefined;
}

async function submitLifecycleOperation(): Promise<void> {
  const operation = confirmationOperation.value;
  if (!operation || submitting.value) return;
  const currentGeneration = generation;
  submitting.value = true;
  errorMessage.value = '';

  try {
    const confirmation = await prepareDockerComposeLifecycleConfirmation(
      props.project.id,
      operation,
      confirmationService.value,
      props.environmentInstanceId,
    );
    const nextExecution = await startDockerComposeLifecycleExecution(
      props.project.id,
      operation,
      confirmation.token,
      confirmationService.value,
      props.environmentInstanceId,
    );
    if (currentGeneration === generation) {
      execution.value = nextExecution;
      confirmationOperation.value = null;
      confirmationService.value = undefined;
      schedulePoll(currentGeneration);
    }
  } catch (error) {
    if (currentGeneration === generation) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'A operação do Docker Compose não pôde ser iniciada.';
    }
  } finally {
    submitting.value = false;
  }
}

const confirmationTitle = computed(() => {
  const target = confirmationService.value
    ? ` o serviço ${confirmationService.value}`
    : ' a stack';
  if (confirmationOperation.value === 'start') return `Iniciar${target}?`;
  if (confirmationOperation.value === 'stop') return `Parar${target}?`;
  return `Reiniciar${target}?`;
});

const executionLabel = computed(() => {
  if (!execution.value) return '';
  const target = execution.value.service ? ` · ${execution.value.service}` : '';
  if (execution.value.operation === 'start') return `Iniciando stack${target}`;
  if (execution.value.operation === 'stop') return `Parando stack${target}`;
  return `Reiniciando stack${target}`;
});

async function openLogs(service: string): Promise<void> {
  if (!owned.value || busy.value) return;
  action.value = 'logs-' + service;
  errorMessage.value = '';

  try {
    logs.value = await fetchDockerComposeLogs(
      props.project.id,
      service,
      200,
      props.environmentInstanceId,
    );
    logsService.value = service;
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar os logs do serviço.';
  } finally {
    action.value = '';
  }
}

watch(
  [() => props.project.id, () => props.environmentInstanceId],
  () => {
    snapshot.value = null;
    execution.value = null;
    logs.value = null;
    logsService.value = '';
    serviceSearch.value = '';
    confirmationOperation.value = null;
    confirmationService.value = undefined;
    void load();
  },
  { immediate: true },
);

onBeforeUnmount(clearPoll);
</script>

<template>
  <section class="compose-panel" aria-label="Docker Compose">
    <header class="compose-header">
      <div class="compose-header-actions">
        <button
          class="compose-button compose-refresh-button"
          type="button"
          :disabled="loading || busy"
          aria-label="Atualizar Docker Compose"
          title="Atualizar Docker Compose"
          @click="load"
        >
          <ArrowPathIcon
            :class="{ 'is-spinning': loading }"
            aria-hidden="true"
          />
        </button>
        <button
          class="compose-button compose-button--primary"
          type="button"
          :disabled="!canStart"
          @click="openConfirmation('start')"
        >
          <PlayIcon aria-hidden="true" />
          {{ executionActive && execution?.operation === 'start' ? 'Iniciando…' : 'Iniciar stack' }}
        </button>
        <button
          v-if="owned"
          class="compose-button"
          type="button"
          :disabled="busy || !hasActiveServices"
          @click="openConfirmation('restart')"
        >
          {{ executionActive && execution?.operation === 'restart' ? 'Reiniciando…' : 'Reiniciar stack' }}
        </button>
        <button
          v-if="owned"
          class="compose-button compose-button--danger"
          type="button"
          :disabled="busy || !hasActiveServices"
          @click="openConfirmation('stop')"
        >
          {{ executionActive && execution?.operation === 'stop' ? 'Parando…' : 'Parar stack' }}
        </button>
      </div>
    </header>

    <EmptyState
      v-if="loading && !snapshot"
      icon="•••"
      title="Inspecionando Docker Compose"
      description="Lendo configuração resolvida, runtime e preflight de portas."
    />

    <EmptyState
      v-else-if="errorMessage && !snapshot"
      icon="!"
      title="Docker Compose indisponível"
      :description="errorMessage"
    >
      <template #actions>
        <button class="compose-button compose-button--primary" @click="load">
          Tentar novamente
        </button>
      </template>
    </EmptyState>

    <template v-else-if="snapshot">
      <p v-if="errorMessage" class="compose-error" role="alert">
        {{ errorMessage }}
      </p>

      <section
        v-if="execution"
        class="compose-lifecycle"
        :class="{
          'is-running': executionActive,
          'is-warning': execution.resultState?.endsWith('-unverified'),
          'is-failed': execution.status === 'failed',
        }"
        aria-label="Lifecycle Docker Compose"
      >
        <ArrowPathIcon
          :class="{ 'is-spinning': executionActive }"
          aria-hidden="true"
        />
        <div>
          <strong>{{ executionLabel }}</strong>
          <span>
            {{
              execution.status === 'queued'
                ? 'Na fila'
                : execution.status === 'running'
                  ? 'Executando'
                  : execution.status === 'failed'
                    ? 'Falhou'
                    : execution.resultState?.endsWith('-unverified')
                      ? 'Concluído sem verificação completa'
                      : 'Concluído'
            }}
          </span>
          <span v-if="execution.diagnostic">{{ execution.diagnostic }}</span>
        </div>
      </section>

      <section
        v-if="confirmationOperation"
        class="compose-confirmation"
        aria-label="Confirmar operação Docker Compose"
      >
        <ExclamationTriangleIcon aria-hidden="true" />
        <div>
          <strong>{{ confirmationTitle }}</strong>
          <span>
            O backend revalidará ownership, catálogo e preflight antes da
            mutação. A confirmação é de uso único e vinculada a esta
            Environment Instance.
          </span>
          <div class="compose-confirmation-actions">
            <button
              class="compose-button"
              type="button"
              :disabled="submitting"
              @click="closeConfirmation"
            >
              Cancelar
            </button>
            <button
              class="compose-button compose-button--primary"
              type="button"
              :disabled="submitting"
              @click="submitLifecycleOperation"
            >
              <ArrowPathIcon
                v-if="submitting"
                class="is-spinning"
                aria-hidden="true"
              />
              {{ submitting ? 'Validando…' : 'Confirmar' }}
            </button>
          </div>
        </div>
      </section>

      <div class="compose-status-strip" aria-label="Status do Docker Compose">
        <div
          class="compose-status-item"
          :class="'compose-status-item--' + inspectionSummary.tone"
        >
          <span class="compose-status-icon">
            <component :is="inspectionSummary.icon" aria-hidden="true" />
          </span>
          <div>
            <strong>{{ inspectionSummary.title }}</strong>
            <span>{{ inspectionSummary.detail }}</span>
          </div>
        </div>

        <div
          class="compose-status-item"
          :class="'compose-status-item--' + ownershipSummary.tone"
        >
          <span class="compose-status-icon">
            <component :is="ownershipSummary.icon" aria-hidden="true" />
          </span>
          <div>
            <strong>{{ ownershipSummary.title }}</strong>
            <span>{{ ownershipSummary.detail }}</span>
          </div>
        </div>

        <div
          class="compose-status-item"
          :class="'compose-status-item--' + preflightSummary.tone"
        >
          <span class="compose-status-icon">
            <component :is="preflightSummary.icon" aria-hidden="true" />
          </span>
          <div>
            <strong>{{ preflightSummary.title }}</strong>
            <span>{{ preflightSummary.detail }}</span>
          </div>
        </div>
      </div>

      <section
        v-if="hasProblems"
        class="compose-problem-panel"
        aria-labelledby="compose-problems-title"
      >
        <div class="compose-problem-main">
          <ExclamationTriangleIcon
            class="compose-problem-icon"
            aria-hidden="true"
          />
          <div>
            <h4 id="compose-problems-title">Problemas detectados</h4>
            <p
              v-for="diagnostic in problemDiagnostics"
              :key="diagnostic"
              class="compose-problem-diagnostic"
            >
              {{ diagnostic }}
            </p>
            <ul
              v-if="snapshot.preflight?.conflicts.length"
              class="compose-conflicts"
              aria-label="Conflitos de portas"
            >
              <li
                v-for="conflict in snapshot.preflight.conflicts"
                :key="conflict.port + '-' + conflict.reason"
              >
                <span aria-hidden="true"></span>
                <strong>{{ conflict.port }}</strong>
                <span>·</span>
                <span>{{ conflict.services.join(', ') }}</span>
                <span>·</span>
                <span>{{ conflictReasonLabel(conflict.reason) }}</span>
              </li>
            </ul>
          </div>
        </div>

        <div v-if="!owned" class="compose-readonly-message">
          <InformationCircleIcon aria-hidden="true" />
          <div>
            <strong>O projeto está em modo somente leitura.</strong>
            <span>
              Ações de serviço (iniciar, parar, reiniciar) não estão disponíveis
              neste modo.
            </span>
          </div>
        </div>
      </section>

      <EmptyState
        v-if="!config"
        icon="—"
        title="Configuração Compose não comprovada"
        description="A API não encontrou uma configuração estruturada segura para este projeto."
      />

      <template v-else>
        <div class="compose-services-heading">
          <div class="compose-services-title">
            <CircleStackIcon aria-hidden="true" />
            <h4>Serviços · {{ config.services.length }}</h4>
          </div>

          <label class="compose-search">
            <MagnifyingGlassIcon aria-hidden="true" />
            <span class="sr-only">Buscar serviço</span>
            <input
              v-model="serviceSearch"
              type="search"
              placeholder="Buscar serviço..."
              autocomplete="off"
            />
          </label>
        </div>

        <div class="compose-table-shell">
          <table class="compose-service-table">
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Imagem</th>
                <th>Portas</th>
                <th>Depende de</th>
                <th>Status</th>
                <th><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="service in visibleServices" :key="service.name">
                <td>
                  <div class="compose-service-name">
                    <component
                      :is="serviceIcon(service.name)"
                      aria-hidden="true"
                    />
                    <strong>{{ service.name }}</strong>
                  </div>
                </td>
                <td>
                  <code>{{ service.image || '—' }}</code>
                </td>
                <td>
                  <span class="compose-cell-wrap">
                    {{
                      service.ports.length
                        ? service.ports.map(portLabel).join(', ')
                        : '—'
                    }}
                  </span>
                </td>
                <td>
                  <span
                    v-if="service.dependsOn.length"
                    class="compose-cell-wrap"
                  >
                    {{ service.dependsOn.join(', ') }}
                  </span>
                </td>
                <td>
                  <div class="compose-badges">
                    <StatusBadge
                      :tone="
                        stateTone(runtimeFor(service.name)?.state ?? 'unknown')
                      "
                    >
                      {{
                        stateLabel(runtimeFor(service.name)?.state ?? 'unknown')
                      }}
                    </StatusBadge>
                    <StatusBadge
                      :tone="
                        healthTone(
                          runtimeFor(service.name)?.health ?? 'unknown',
                        )
                      "
                    >
                      {{
                        healthLabel(
                          runtimeFor(service.name)?.health ?? 'unknown',
                        )
                      }}
                    </StatusBadge>
                  </div>
                </td>
                <td class="compose-actions-cell">
                  <details v-if="owned" class="compose-row-menu">
                    <summary
                      :aria-label="'Ações de ' + service.name"
                      :title="'Ações de ' + service.name"
                    >
                      <EllipsisVerticalIcon aria-hidden="true" />
                    </summary>
                    <div class="compose-row-menu-popover">
                      <button
                        type="button"
                        :disabled="busy"
                        @click="openConfirmation('restart', service.name)"
                      >
                        Reiniciar
                      </button>
                      <button
                        type="button"
                        :disabled="busy"
                        @click="openLogs(service.name)"
                      >
                        {{
                          action === 'logs-' + service.name
                            ? 'Lendo…'
                            : 'Ver logs'
                        }}
                      </button>
                      <button
                        class="compose-row-menu-danger"
                        type="button"
                        :disabled="busy"
                        @click="openConfirmation('stop', service.name)"
                      >
                        Parar
                      </button>
                    </div>
                  </details>
                  <button
                    v-else
                    class="compose-row-menu-disabled"
                    type="button"
                    :aria-label="'Ações indisponíveis para ' + service.name"
                    title="Ações indisponíveis em modo somente leitura"
                    disabled
                  >
                    <EllipsisVerticalIcon aria-hidden="true" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <div v-if="!visibleServices.length" class="compose-no-results">
            Nenhum serviço encontrado.
          </div>
        </div>
      </template>

      <section
        v-if="logs"
        class="compose-logs"
        aria-labelledby="compose-logs-title"
      >
        <div class="compose-logs-heading">
          <div>
            <h4 id="compose-logs-title">Logs · {{ logsService }}</h4>
            <p>{{ formatDate(logs.readAt) }}</p>
          </div>
          <span>
            <template v-if="logs.masked">
              {{ logs.redactionCount }} conteúdo(s) mascarado(s)
            </template>
            <template v-if="logs.truncated"> · saída truncada </template>
          </span>
        </div>
        <pre>{{ logs.content || 'Sem saída recente.' }}</pre>
      </section>
    </template>
  </section>
</template>

<style scoped>
.compose-panel {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: calc(100vh - var(--app-topbar-height, 72px));
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-1);
}

.compose-header,
.compose-header-actions,
.compose-services-heading,
.compose-services-title,
.compose-badges,
.compose-logs-heading {
  display: flex;
  align-items: center;
}

.compose-header {
  min-height: 54px;
  flex: 0 0 auto;
  justify-content: flex-end;
  gap: 12px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-1) 96%, var(--surface-2) 4%);
}

.compose-header-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 7px;
}

.compose-button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 11px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  font-weight: var(--font-weight-strong);
}

.compose-button svg {
  width: 15px;
  height: 15px;
}

.compose-button:hover:not(:disabled),
.compose-button:focus-visible {
  border-color: var(--accent);
  background: var(--surface-2);
}

.compose-button:disabled {
  cursor: not-allowed;
  opacity: var(--disabled-opacity);
}

.compose-refresh-button {
  width: 34px;
  padding: 0;
}

.compose-button--primary {
  border-color: var(--accent);
  color: #fff;
  background: var(--accent);
}

.compose-button--primary:hover:not(:disabled),
.compose-button--primary:focus-visible {
  background: var(--accent-strong);
}

.compose-button--danger {
  color: var(--danger-text);
}

.compose-panel > :deep(.empty-state) {
  min-height: 0;
  flex: 1 1 auto;
  border: 0;
  border-radius: 0;
  background: var(--surface-1);
}

.compose-error {
  flex: 0 0 auto;
  margin: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  color: var(--danger-text);
  background: var(--danger-surface);
  font-size: 10px;
}

.compose-status-strip {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  overflow: hidden;
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
}

.compose-status-item {
  display: flex;
  min-width: 0;
  min-height: 62px;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
}

.compose-status-item + .compose-status-item {
  border-left: 1px solid var(--border);
}

.compose-status-icon {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  place-items: center;
  border-radius: 8px;
  background: var(--surface-2);
}

.compose-status-icon svg {
  width: 16px;
  height: 16px;
}

.compose-status-item > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.compose-status-item strong,
.compose-status-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compose-status-item strong {
  color: var(--text);
  font-size: 10px;
}

.compose-status-item > div > span {
  color: var(--text-muted);
  font-size: 9px;
}

.compose-status-item--success .compose-status-icon,
.compose-status-item--success strong {
  color: var(--success-text);
}

.compose-status-item--success .compose-status-icon {
  background: var(--success-surface);
}

.compose-status-item--warning .compose-status-icon,
.compose-status-item--warning strong {
  color: var(--warning-text);
}

.compose-status-item--warning .compose-status-icon {
  background: var(--warning-surface);
}

.compose-status-item--danger .compose-status-icon,
.compose-status-item--danger strong {
  color: var(--danger-text);
}

.compose-status-item--danger .compose-status-icon {
  background: var(--danger-surface);
}

.compose-status-item--neutral .compose-status-icon,
.compose-status-item--neutral strong {
  color: var(--text-muted);
}

.compose-problem-panel {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 0.38fr);
  overflow: hidden;
  border-bottom: 1px solid
    color-mix(in srgb, var(--danger-text) 48%, var(--border));
  background: var(--danger-surface);
}

.compose-problem-main {
  display: flex;
  min-width: 0;
  gap: 9px;
  padding: 10px 12px;
}

.compose-problem-icon {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  color: var(--danger-text);
}

.compose-problem-panel h4,
.compose-problem-diagnostic,
.compose-logs-heading h4,
.compose-logs-heading p {
  margin: 0;
}

.compose-problem-panel h4 {
  margin-bottom: 4px;
  color: var(--danger-text);
  font-size: 11px;
}

.compose-problem-diagnostic {
  color: var(--text);
  font-size: 10px;
  line-height: 1.45;
}

.compose-conflicts {
  display: grid;
  gap: 5px;
  margin: 7px 0 0;
  padding: 0;
  list-style: none;
}

.compose-conflicts li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  color: var(--text);
  font-size: 10px;
}

.compose-conflicts li > span:first-child {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 999px;
  background: var(--danger-text);
}

.compose-readonly-message {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
  border-left: 1px solid var(--border);
}

.compose-readonly-message > svg {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  color: var(--info-text);
}

.compose-readonly-message > div {
  display: grid;
  gap: 3px;
}

.compose-readonly-message strong {
  color: var(--text);
  font-size: 10px;
}

.compose-readonly-message span {
  color: var(--text-muted);
  font-size: 9px;
  line-height: 1.4;
}

.compose-services-heading {
  min-height: 52px;
  flex: 0 0 auto;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px 8px 14px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-1) 96%, var(--surface-2) 4%);
}

.compose-services-title {
  gap: 7px;
}

.compose-services-title svg {
  width: 16px;
  height: 16px;
  color: var(--accent);
}

.compose-services-title h4 {
  margin: 0;
  color: var(--text);
  font-size: 11px;
}

.compose-search {
  display: flex;
  width: min(240px, 100%);
  min-height: 34px;
  align-items: center;
  gap: 7px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.compose-search:focus-within {
  border-color: var(--accent);
}

.compose-search svg {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
  color: var(--text-muted);
}

.compose-search input {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  outline: 0;
  color: var(--text);
  background: transparent;
  font: inherit;
  font-size: 10px;
}

.compose-search input::placeholder {
  color: var(--text-dim);
}

.compose-table-shell {
  position: relative;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
  background: var(--surface-1);
}

.compose-service-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.compose-service-table thead th {
  position: sticky;
  z-index: 3;
  top: 0;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: 9px;
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.04em;
  text-align: left;
  text-transform: uppercase;
}

.compose-service-table td {
  min-width: 0;
  padding: 9px 10px;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-size: 10px;
  vertical-align: middle;
}

.compose-service-table th:nth-child(1) {
  width: 12%;
}
.compose-service-table th:nth-child(2) {
  width: 17%;
}
.compose-service-table th:nth-child(3) {
  width: 22%;
}
.compose-service-table th:nth-child(4) {
  width: 20%;
}
.compose-service-table th:nth-child(5) {
  width: 25%;
}
.compose-service-table th:nth-child(6) {
  width: 44px;
}

.compose-service-table code,
.compose-cell-wrap {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compose-service-table code {
  color: var(--text-muted);
  font-family: var(--font-family-mono);
  font-size: 9px;
}

.compose-service-name {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
}

.compose-service-name svg {
  width: 15px;
  height: 15px;
  flex: 0 0 15px;
  color: var(--accent);
}

.compose-service-name strong {
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compose-badges {
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
}

.compose-actions-cell {
  position: relative;
  text-align: right;
}

.compose-row-menu {
  position: relative;
  display: inline-block;
}

.compose-row-menu summary,
.compose-row-menu-disabled {
  display: inline-grid;
  width: 28px;
  height: 28px;
  place-items: center;
  margin: 0;
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
  list-style: none;
}

.compose-row-menu summary::-webkit-details-marker {
  display: none;
}

.compose-row-menu summary:hover,
.compose-row-menu summary:focus-visible,
.compose-row-menu[open] summary {
  border-color: var(--border);
  color: var(--text);
  background: var(--surface-2);
}

.compose-row-menu summary svg,
.compose-row-menu-disabled svg {
  width: 16px;
  height: 16px;
}

.compose-row-menu-disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.compose-row-menu-popover {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  right: 0;
  display: grid;
  width: 140px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  box-shadow: var(--shadow-1);
}

.compose-row-menu-popover button {
  padding: 8px 10px;
  border: 0;
  color: var(--text);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  text-align: left;
}

.compose-row-menu-popover button:hover:not(:disabled),
.compose-row-menu-popover button:focus-visible {
  background: var(--surface-3);
}

.compose-row-menu-popover button:disabled {
  cursor: not-allowed;
  opacity: var(--disabled-opacity);
}

.compose-row-menu-popover .compose-row-menu-danger {
  color: var(--danger-text);
}

.compose-no-results {
  padding: 20px;
  color: var(--text-muted);
  font-size: 10px;
  text-align: center;
}

.compose-logs {
  display: flex;
  min-height: 180px;
  max-height: 42vh;
  flex: 0 0 auto;
  flex-direction: column;
  overflow: hidden;
  border-top: 1px solid var(--border);
  background: var(--surface-1);
}

.compose-logs-heading {
  min-height: 44px;
  flex: 0 0 auto;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.compose-logs-heading h4 {
  color: var(--text);
  font-size: 10px;
}

.compose-logs-heading p,
.compose-logs-heading > span {
  color: var(--text-muted);
  font-size: 9px;
}

.compose-logs pre {
  min-height: 0;
  flex: 1 1 auto;
  margin: 0;
  overflow: auto;
  padding: 12px 14px 16px;
  color: var(--text);
  background: var(--surface-0);
  font-family: var(--font-family-mono);
  font-size: 10px;
  white-space: pre-wrap;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  padding: 0;
  border: 0;
  margin: -1px;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.is-spinning {
  animation: compose-spin 0.8s linear infinite;
}

@keyframes compose-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-spinning {
    animation: none;
  }
}

@media (max-width: 1100px) {
  .compose-problem-panel {
    grid-template-columns: 1fr;
  }

  .compose-readonly-message {
    border-top: 1px solid var(--border);
    border-left: 0;
  }

  .compose-service-table {
    min-width: 860px;
  }
}

@media (max-width: 760px) {
  .compose-header,
  .compose-services-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .compose-header-actions {
    justify-content: flex-start;
  }

  .compose-status-strip {
    grid-template-columns: 1fr;
  }

  .compose-status-item + .compose-status-item {
    border-top: 1px solid var(--border);
    border-left: 0;
  }

  .compose-search {
    width: 100%;
  }
}

.compose-lifecycle,
.compose-confirmation {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0 24px 14px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
}

.compose-lifecycle > svg,
.compose-confirmation > svg {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
}

.compose-lifecycle > div,
.compose-confirmation > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.compose-lifecycle span,
.compose-confirmation span {
  color: var(--text-dim);
  font-size: 12px;
}

.compose-lifecycle.is-running {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
}

.compose-lifecycle.is-warning {
  border-color: color-mix(in srgb, var(--warning) 45%, var(--border));
}

.compose-lifecycle.is-failed {
  border-color: color-mix(in srgb, var(--danger) 45%, var(--border));
}

.compose-confirmation-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}
</style>
