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
import { computed, ref, watch } from 'vue';

import type { Project } from '@dev-dashboard/contracts';

import {
  fetchDockerComposeLogs,
  fetchDockerComposeSnapshot,
  restartDockerCompose,
  startDockerCompose,
  stopDockerCompose,
  type DockerComposeInspectionState,
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
const errorMessage = ref('');
const snapshot = ref<DockerComposeSnapshot | null>(null);
const logs = ref<DockerComposeLogSnapshot | null>(null);
const logsService = ref('');
const serviceSearch = ref('');
let generation = 0;

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
const canStart = computed(
  () =>
    Boolean(config.value) &&
    snapshot.value?.inspection.state === 'available' &&
    !hasActiveServices.value &&
    !action.value,
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
  ].filter((message): message is string => Boolean(message));
});
const hasProblems = computed(
  () =>
    problemDiagnostics.value.length > 0 ||
    Boolean(snapshot.value?.preflight?.conflicts.length),
);

const inspectionSummary = computed(() => {
  const state = snapshot.value?.inspection.state;
  const summary: Record<
    DockerComposeInspectionState,
    {
      title: string;
      detail: string;
      tone: 'success' | 'warning' | 'danger' | 'neutral';
      icon: typeof CheckCircleIcon;
    }
  > = {
    available: {
      title: 'Compose disponível',
      detail: 'Configuração e runtime estruturados',
      tone: 'success',
      icon: CheckCircleIcon,
    },
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

  return state ? summary[state] : summary['invalid-output'];
});

const ownershipSummary = computed(() =>
  owned.value
    ? {
        title: 'Ownership ativo',
        detail: 'Ações de serviço disponíveis',
        tone: 'success' as const,
        icon: CheckCircleIcon,
      }
    : {
        title: 'Somente leitura',
        detail: 'Ações de serviço não estão disponíveis',
        tone: 'warning' as const,
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

async function load(): Promise<void> {
  const requestGeneration = ++generation;
  loading.value = true;
  errorMessage.value = '';

  try {
    const result = await fetchDockerComposeSnapshot(
      props.project.id,
      props.environmentInstanceId,
    );
    if (requestGeneration === generation) snapshot.value = result;
  } catch (error) {
    if (requestGeneration === generation) {
      snapshot.value = null;
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível inspecionar o Docker Compose.';
    }
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}

async function mutate(
  name: string,
  operation: () => Promise<{ snapshot: DockerComposeSnapshot }>,
): Promise<void> {
  if (action.value) return;
  action.value = name;
  errorMessage.value = '';

  try {
    const response = await operation();
    snapshot.value = response.snapshot;
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'A operação do Docker Compose não pôde ser concluída.';
  } finally {
    action.value = '';
  }
}

async function openLogs(service: string): Promise<void> {
  if (!owned.value || action.value) return;
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
    logs.value = null;
    logsService.value = '';
    serviceSearch.value = '';
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <section class="compose-panel" aria-labelledby="compose-title">
    <header class="compose-header">
      <div class="compose-title">
        <svg class="compose-docker-mark" viewBox="0 0 32 32" aria-hidden="true">
          <path
            d="M3 15.5h25c-.7 6.6-4.8 10.5-11.4 10.5h-6C6 26 3 22.8 3 18.5v-3Z"
          />
          <path d="M27 13.5c1.9 0 3.1-1 4-2.8.2 2.7-.9 4.7-3.5 5.4" />
          <rect x="6" y="10" width="4" height="4" rx=".7" />
          <rect x="11" y="10" width="4" height="4" rx=".7" />
          <rect x="16" y="10" width="4" height="4" rx=".7" />
          <rect x="11" y="5" width="4" height="4" rx=".7" />
          <rect x="16" y="5" width="4" height="4" rx=".7" />
          <rect x="21" y="10" width="4" height="4" rx=".7" />
        </svg>
        <div>
          <h3 id="compose-title">Docker Compose</h3>
          <p>
            Serviços, health, portas e lifecycle controlado do Compose associado
            a este projeto.
          </p>
        </div>
      </div>

      <div class="compose-header-actions">
        <button
          class="compose-button"
          type="button"
          :disabled="loading || Boolean(action)"
          @click="load"
        >
          <ArrowPathIcon
            :class="{ 'is-spinning': loading }"
            aria-hidden="true"
          />
          Atualizar
        </button>
        <button
          class="compose-button compose-button--primary"
          type="button"
          :disabled="!canStart"
          @click="
            mutate('start', () =>
              startDockerCompose(project.id, environmentInstanceId),
            )
          "
        >
          <PlayIcon aria-hidden="true" />
          {{ action === 'start' ? 'Iniciando…' : 'Iniciar stack' }}
        </button>
        <button
          v-if="owned"
          class="compose-button"
          type="button"
          :disabled="Boolean(action) || !hasActiveServices"
          @click="
            mutate('restart', () =>
              restartDockerCompose(
                project.id,
                undefined,
                environmentInstanceId,
              ),
            )
          "
        >
          {{ action === 'restart' ? 'Reiniciando…' : 'Reiniciar stack' }}
        </button>
        <button
          v-if="owned"
          class="compose-button compose-button--danger"
          type="button"
          :disabled="Boolean(action) || !hasActiveServices"
          @click="
            mutate('stop', () =>
              stopDockerCompose(project.id, undefined, environmentInstanceId),
            )
          "
        >
          {{ action === 'stop' ? 'Parando…' : 'Parar stack' }}
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
                        :disabled="Boolean(action)"
                        @click="
                          mutate('restart-' + service.name, () =>
                            restartDockerCompose(
                              project.id,
                              service.name,
                              environmentInstanceId,
                            ),
                          )
                        "
                      >
                        {{
                          action === 'restart-' + service.name
                            ? 'Reiniciando…'
                            : 'Reiniciar'
                        }}
                      </button>
                      <button
                        type="button"
                        :disabled="Boolean(action)"
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
                        :disabled="Boolean(action)"
                        @click="
                          mutate('stop-' + service.name, () =>
                            stopDockerCompose(
                              project.id,
                              service.name,
                              environmentInstanceId,
                            ),
                          )
                        "
                      >
                        {{
                          action === 'stop-' + service.name
                            ? 'Parando…'
                            : 'Parar'
                        }}
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
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
}

.compose-header,
.compose-header-actions,
.compose-title,
.compose-services-heading,
.compose-services-title,
.compose-badges,
.compose-logs-heading {
  display: flex;
  align-items: center;
}

.compose-header {
  justify-content: space-between;
  gap: var(--space-5);
}

.compose-title {
  min-width: 0;
  gap: var(--space-3);
}

.compose-title > div {
  min-width: 0;
}

.compose-title h3,
.compose-title p,
.compose-services-title h4,
.compose-problem-panel h4,
.compose-problem-diagnostic,
.compose-logs-heading h4,
.compose-logs-heading p,
.compose-error {
  margin: 0;
}

.compose-title h3 {
  color: var(--text);
  font-size: var(--font-xl);
}

.compose-title p {
  margin-top: var(--space-1);
  color: var(--text-muted);
  font-size: var(--font-control);
}

.compose-docker-mark {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  fill: var(--accent);
  stroke: var(--accent);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.2;
}

.compose-header-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--space-2);
}

.compose-button {
  display: inline-flex;
  min-height: var(--control-height-lg);
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  color: var(--text);
  background: var(--surface-1);
  cursor: pointer;
  font: inherit;
  font-size: var(--font-control);
  font-weight: var(--font-weight-strong);
  transition:
    border-color var(--motion-duration-fast) var(--motion-easing-standard),
    background var(--motion-duration-fast) var(--motion-easing-standard);
}

.compose-button svg {
  width: 17px;
  height: 17px;
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

.compose-button--primary {
  border-color: var(--accent-strong);
  color: #fff;
  background: var(--accent-strong);
}

.compose-button--primary:hover:not(:disabled),
.compose-button--primary:focus-visible {
  border-color: var(--accent);
  background: var(--accent);
}

.compose-button--danger {
  color: var(--danger-text);
}

.compose-status-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
}

.compose-status-item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
}

.compose-status-item + .compose-status-item {
  border-left: 1px solid var(--border);
}

.compose-status-icon {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  place-items: center;
  border-radius: 10px;
  background: var(--surface-2);
}

.compose-status-icon svg {
  width: 20px;
  height: 20px;
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
  font-size: var(--font-control);
}

.compose-status-item > div > span {
  color: var(--text-muted);
  font-size: var(--font-label);
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
  grid-template-columns: minmax(0, 1fr) minmax(280px, 0.42fr);
  overflow: hidden;
  border: 1px solid var(--danger-text);
  border-radius: var(--radius-lg);
  background:
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--danger-surface) 44%, transparent),
      transparent 65%
    ),
    var(--surface-1);
}

.compose-problem-main {
  display: flex;
  min-width: 0;
  gap: var(--space-3);
  padding: var(--space-4);
}

.compose-problem-icon {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  color: var(--danger-text);
}

.compose-problem-panel h4 {
  margin-bottom: var(--space-2);
  color: var(--danger-text);
  font-size: var(--font-lg);
}

.compose-problem-diagnostic {
  color: var(--text);
  font-size: var(--font-control);
  line-height: 1.6;
}

.compose-conflicts {
  display: grid;
  gap: var(--space-2);
  margin: var(--space-3) 0 0;
  padding: 0;
  list-style: none;
}

.compose-conflicts li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  color: var(--text);
  font-size: var(--font-control);
}

.compose-conflicts li > span:first-child {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 999px;
  background: var(--danger-text);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--danger-text) 10%, transparent);
}

.compose-readonly-message {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: var(--space-4) 0;
  padding: 0 var(--space-5);
  border-left: 1px solid var(--border);
}

.compose-readonly-message > svg {
  width: 21px;
  height: 21px;
  flex: 0 0 21px;
  color: var(--info-text);
}

.compose-readonly-message > div {
  display: grid;
  gap: var(--space-1);
}

.compose-readonly-message strong {
  color: var(--text);
  font-size: var(--font-control);
}

.compose-readonly-message span {
  color: var(--text-muted);
  font-size: var(--font-label);
  line-height: 1.5;
}

.compose-services-heading {
  justify-content: space-between;
  gap: var(--space-4);
  padding-top: var(--space-1);
}

.compose-services-title {
  gap: var(--space-2);
}

.compose-services-title svg {
  width: 22px;
  height: 22px;
  color: var(--info-text);
}

.compose-services-title h4 {
  color: var(--text);
  font-size: var(--font-lg);
}

.compose-search {
  display: flex;
  width: min(280px, 100%);
  min-height: var(--control-height-lg);
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
}

.compose-search:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.compose-search svg {
  width: 17px;
  height: 17px;
  flex: 0 0 17px;
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
  font-size: var(--font-control);
}

.compose-search input::placeholder {
  color: var(--text-dim);
}

.compose-table-shell {
  position: relative;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
}

.compose-service-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.compose-service-table th {
  padding: 10px var(--space-3);
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: left;
  text-transform: uppercase;
}

.compose-service-table td {
  min-width: 0;
  padding: 10px var(--space-3);
  border-top: 1px solid var(--border);
  color: var(--text);
  font-size: var(--font-control);
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
  font-size: var(--font-label);
}

.compose-service-name {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
}

.compose-service-name svg {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  color: var(--info-text);
}

.compose-service-name strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compose-badges {
  min-width: 0;
  flex-wrap: wrap;
  gap: var(--space-2);
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
  width: 30px;
  height: 30px;
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
  width: 18px;
  height: 18px;
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
  border-radius: var(--radius-md);
  background: var(--surface-2);
  box-shadow: var(--shadow-1);
}

.compose-row-menu-popover button {
  padding: 9px var(--space-3);
  border: 0;
  color: var(--text);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: var(--font-control);
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
  padding: var(--space-5);
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: var(--font-control);
  text-align: center;
}

.compose-error {
  padding: var(--space-3);
  border: 1px solid var(--danger-text);
  border-radius: var(--radius-md);
  color: var(--danger-text);
  background: var(--danger-surface);
}

.compose-logs {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
}

.compose-logs-heading {
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4);
}

.compose-logs-heading h4 {
  color: var(--text);
  font-size: var(--font-lg);
}

.compose-logs-heading p,
.compose-logs-heading > span {
  color: var(--text-muted);
  font-size: var(--font-label);
}

.compose-logs pre {
  max-height: 420px;
  margin: 0;
  overflow: auto;
  border-top: 1px solid var(--border);
  padding: var(--space-4);
  color: var(--text);
  background: var(--surface-0);
  font-family: var(--font-family-mono);
  font-size: var(--font-label);
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

@media (max-width: 1100px) {
  .compose-problem-panel {
    grid-template-columns: 1fr;
  }

  .compose-readonly-message {
    margin: 0 var(--space-4) var(--space-4);
    padding: var(--space-4) 0 0;
    border-top: 1px solid var(--border);
    border-left: 0;
  }

  .compose-table-shell {
    overflow-x: auto;
  }

  .compose-service-table {
    min-width: 940px;
  }
}

@media (max-width: 760px) {
  .compose-panel {
    padding: var(--space-4);
  }

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
</style>
