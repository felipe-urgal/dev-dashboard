<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import type { Project } from '@dev-dashboard/contracts';

import {
  fetchDockerComposeLogs,
  fetchDockerComposeSnapshot,
  restartDockerCompose,
  startDockerCompose,
  stopDockerCompose,
  type DockerComposeLogSnapshot,
  type DockerComposePortBinding,
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

const inspectionTone = computed<StatusBadgeTone>(() => {
  if (snapshot.value?.inspection.state === 'available') return 'success';
  if (snapshot.value?.inspection.state === 'runtime-unavailable')
    return 'warning';
  return 'neutral';
});

const preflightTone = computed<StatusBadgeTone>(() => {
  if (snapshot.value?.preflight?.state === 'ready') return 'success';
  if (snapshot.value?.preflight?.state === 'blocked') return 'danger';
  return 'warning';
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
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <section class="compose-panel" aria-labelledby="compose-title">
    <header class="compose-header">
      <div>
        <span class="compose-eyebrow">Runtime local</span>
        <h3 id="compose-title">Docker Compose</h3>
        <p>
          Serviços, health, portas e lifecycle controlado do Compose associado a
          este projeto.
        </p>
      </div>
      <div class="compose-header-actions">
        <button
          class="compose-button"
          type="button"
          :disabled="loading || Boolean(action)"
          @click="load"
        >
          Atualizar
        </button>
        <button
          class="compose-button compose-button--primary"
          type="button"
          :disabled="!canStart"
          @click="mutate('start', () => startDockerCompose(project.id, environmentInstanceId))"
        >
          {{ action === 'start' ? 'Iniciando…' : 'Iniciar stack' }}
        </button>
        <button
          v-if="owned"
          class="compose-button"
          type="button"
          :disabled="Boolean(action) || !hasActiveServices"
          @click="mutate('restart', () => restartDockerCompose(project.id, undefined, environmentInstanceId))"
        >
          {{ action === 'restart' ? 'Reiniciando…' : 'Reiniciar stack' }}
        </button>
        <button
          v-if="owned"
          class="compose-button compose-button--danger"
          type="button"
          :disabled="Boolean(action) || !hasActiveServices"
          @click="mutate('stop', () => stopDockerCompose(project.id, undefined, environmentInstanceId))"
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

      <div class="compose-summary">
        <section class="compose-summary-card">
          <span>Compose</span>
          <StatusBadge :tone="inspectionTone" size="md">
            {{ snapshot.inspection.state }}
          </StatusBadge>
          <small>{{ formatDate(snapshot.inspection.observedAt) }}</small>
        </section>
        <section class="compose-summary-card">
          <span>Ownership</span>
          <StatusBadge :tone="owned ? 'success' : 'neutral'" size="md">
            {{ owned ? 'Owned' : 'Somente leitura' }}
          </StatusBadge>
          <small v-if="snapshot.ownership.startedAt">
            Desde {{ formatDate(snapshot.ownership.startedAt) }}
          </small>
        </section>
        <section v-if="snapshot.preflight" class="compose-summary-card">
          <span>Portas</span>
          <StatusBadge :tone="preflightTone" size="md">
            {{ snapshot.preflight.state }}
          </StatusBadge>
          <small>{{ snapshot.preflight.conflicts.length }} conflito(s)</small>
        </section>
      </div>

      <p
        v-if="snapshot.inspection.diagnostic"
        class="compose-diagnostic"
        role="note"
      >
        {{ snapshot.inspection.diagnostic }}
      </p>

      <p
        v-if="snapshot.preflight?.diagnostic"
        class="compose-diagnostic"
        role="note"
      >
        {{ snapshot.preflight.diagnostic }}
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
          Porta {{ conflict.port }} · {{ conflict.reason }} ·
          {{ conflict.services.join(', ') }}
          <template v-if="conflict.suggestedPort">
            · sugestão {{ conflict.suggestedPort }}
          </template>
        </li>
      </ul>

      <EmptyState
        v-if="!config"
        icon="—"
        title="Configuração Compose não comprovada"
        description="A API não encontrou uma configuração estruturada segura para este projeto."
      />

      <template v-else>
        <div class="compose-section-heading">
          <div>
            <h4>Serviços</h4>
            <p>
              {{ config.projectName ?? 'Projeto Compose' }} ·
              {{ config.services.length }} serviço(s)
            </p>
          </div>
          <span v-if="!owned" class="compose-readonly-note">
            Stop, restart e logs exigem ownership do Dashboard.
          </span>
        </div>

        <div class="compose-services">
          <article
            v-for="service in config.services"
            :key="service.name"
            class="compose-service"
          >
            <div class="compose-service-heading">
              <div>
                <h5>{{ service.name }}</h5>
                <code v-if="service.image">{{ service.image }}</code>
              </div>
              <div class="compose-badges">
                <StatusBadge
                  :tone="
                    stateTone(runtimeFor(service.name)?.state ?? 'unknown')
                  "
                >
                  {{ stateLabel(runtimeFor(service.name)?.state ?? 'unknown') }}
                </StatusBadge>
                <StatusBadge
                  :tone="
                    healthTone(runtimeFor(service.name)?.health ?? 'unknown')
                  "
                >
                  {{
                    healthLabel(runtimeFor(service.name)?.health ?? 'unknown')
                  }}
                </StatusBadge>
              </div>
            </div>

            <dl class="compose-service-meta">
              <div>
                <dt>Portas</dt>
                <dd>
                  <template v-if="service.ports.length">
                    {{ service.ports.map(portLabel).join(', ') }}
                  </template>
                  <template v-else>—</template>
                </dd>
              </div>
              <div>
                <dt>Depende de</dt>
                <dd>
                  {{
                    service.dependsOn.length
                      ? service.dependsOn.join(', ')
                      : '—'
                  }}
                </dd>
              </div>
              <div>
                <dt>Profiles</dt>
                <dd>
                  {{
                    service.profiles.length ? service.profiles.join(', ') : '—'
                  }}
                </dd>
              </div>
              <div v-if="runtimeFor(service.name)?.exitCode !== undefined">
                <dt>Exit code</dt>
                <dd>{{ runtimeFor(service.name)?.exitCode }}</dd>
              </div>
            </dl>

            <div class="compose-service-actions">
              <button
                class="compose-button"
                type="button"
                :disabled="!owned || Boolean(action)"
                @click="
                  mutate('restart-' + service.name, () =>
                    restartDockerCompose(project.id, service.name, environmentInstanceId),
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
                class="compose-button"
                type="button"
                :disabled="!owned || Boolean(action)"
                @click="openLogs(service.name)"
              >
                {{ action === 'logs-' + service.name ? 'Lendo…' : 'Ver logs' }}
              </button>
              <button
                class="compose-button compose-button--danger"
                type="button"
                :disabled="!owned || Boolean(action)"
                @click="
                  mutate('stop-' + service.name, () =>
                    stopDockerCompose(project.id, service.name, environmentInstanceId),
                  )
                "
              >
                {{ action === 'stop-' + service.name ? 'Parando…' : 'Parar' }}
              </button>
            </div>
          </article>
        </div>
      </template>

      <section
        v-if="logs"
        class="compose-logs"
        aria-labelledby="compose-logs-title"
      >
        <div class="compose-section-heading">
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
  gap: var(--space-5);
  padding: var(--space-5);
}

.compose-header,
.compose-section-heading,
.compose-service-heading,
.compose-service-actions,
.compose-header-actions,
.compose-badges {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.compose-header,
.compose-section-heading,
.compose-service-heading {
  justify-content: space-between;
}

.compose-header {
  align-items: flex-start;
}

.compose-header h3,
.compose-header p,
.compose-section-heading h4,
.compose-section-heading p,
.compose-service h5,
.compose-diagnostic,
.compose-error {
  margin: 0;
}

.compose-eyebrow,
.compose-summary-card > span,
.compose-service-meta dt {
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.compose-header-actions,
.compose-service-actions,
.compose-badges {
  flex-wrap: wrap;
}

.compose-button {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--surface-secondary);
  color: var(--text-primary);
  cursor: pointer;
  padding: 0.55rem 0.8rem;
}

.compose-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.compose-button--primary {
  border-color: var(--accent);
}

.compose-button--danger {
  color: var(--danger);
}

.compose-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.compose-summary-card,
.compose-service,
.compose-logs {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--surface-primary);
}

.compose-summary-card {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-4);
}

.compose-summary-card small,
.compose-readonly-note,
.compose-section-heading span {
  color: var(--text-muted);
}

.compose-diagnostic,
.compose-error,
.compose-conflicts {
  border-radius: var(--radius-md);
  padding: var(--space-3);
}

.compose-diagnostic {
  background: var(--surface-secondary);
}

.compose-error {
  color: var(--danger);
}

.compose-conflicts {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding-left: calc(var(--space-3) + 1rem);
}

.compose-services {
  display: grid;
  gap: var(--space-3);
}

.compose-service {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
}

.compose-service h5 {
  font-size: 1rem;
}

.compose-service code {
  color: var(--text-muted);
}

.compose-service-meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
  margin: 0;
}

.compose-service-meta div {
  min-width: 0;
}

.compose-service-meta dd {
  margin: var(--space-1) 0 0;
  overflow-wrap: anywhere;
}

.compose-logs {
  overflow: hidden;
}

.compose-logs .compose-section-heading {
  padding: var(--space-4);
}

.compose-logs pre {
  max-height: 420px;
  margin: 0;
  overflow: auto;
  border-top: 1px solid var(--border-color);
  padding: var(--space-4);
  white-space: pre-wrap;
}

@media (max-width: 900px) {
  .compose-header,
  .compose-section-heading,
  .compose-service-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .compose-summary,
  .compose-service-meta {
    grid-template-columns: 1fr;
  }
}
</style>
