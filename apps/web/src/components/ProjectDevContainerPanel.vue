<script setup lang="ts">
import {
  ArrowPathIcon,
  CubeTransparentIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  PlayIcon,
  StopIcon,
} from '@heroicons/vue/24/outline';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import type { Project } from '@dev-dashboard/contracts';

import {
  cancelDevContainerLifecycleExecution,
  fetchDevContainerLifecycleExecution,
  fetchDevContainerLifecyclePreflight,
  prepareDevContainerLifecycleConfirmation,
  prepareDevContainerStopConfirmation,
  startDevContainerLifecycleExecution,
  type DevContainerConfigurationKind,
  type DevContainerLifecycleExecution,
  type DevContainerLifecycleExecutionOperation,
  type DevContainerLifecycleLimitation,
  type DevContainerLifecyclePreflight,
} from '../api/dev-container';
import StatusBadge from './StatusBadge.vue';
import type { StatusBadgeTone } from './status-badge-types';

const props = defineProps<{
  project: Project;
  environmentInstanceId?: string | undefined;
}>();

const preflight = ref<DevContainerLifecyclePreflight | null>(null);
const execution = ref<DevContainerLifecycleExecution | null>(null);
const loading = ref(false);
const submitting = ref(false);
const cancellingExecution = ref(false);
const confirmationOperation =
  ref<DevContainerLifecycleExecutionOperation | null>(null);
const errorMessage = ref('');
const mutationErrorMessage = ref('');
let generation = 0;
let pollTimer: ReturnType<typeof setTimeout> | undefined;

const executionActive = computed(
  () =>
    execution.value?.status === 'queued' ||
    execution.value?.status === 'running',
);

const stateCopy = computed(() => {
  const value = preflight.value;
  if (!value) return null;

  if (executionActive.value) {
    return {
      label:
        execution.value?.operation === 'create'
          ? 'Criando'
          : execution.value?.operation === 'rebuild'
            ? 'Reconstruindo'
            : execution.value?.operation === 'stop'
              ? 'Parando'
              : 'Recuperando',
      tone: 'info' as StatusBadgeTone,
    };
  }

  if (value.reason === 'recovery-required' || value.environmentLifecycle === 'failed') {
    return {
      label: 'Recuperação necessária',
      tone: 'danger' as StatusBadgeTone,
    };
  }

  if (
    value.environmentLifecycle === 'starting' ||
    value.environmentLifecycle === 'stopping'
  ) {
    return {
      label: 'Em transição',
      tone: 'warning' as StatusBadgeTone,
    };
  }

  if (value.runtime === 'devcontainer' && value.environmentLifecycle === 'ready') {
    return {
      label: 'Ativo',
      tone: 'success' as StatusBadgeTone,
    };
  }

  if (value.discoveryState === 'not-configured') {
    return {
      label: 'Não configurado',
      tone: 'neutral' as StatusBadgeTone,
    };
  }
  if (value.discoveryState === 'cli-missing') {
    return {
      label: 'CLI ausente',
      tone: 'warning' as StatusBadgeTone,
    };
  }
  if (value.discoveryState === 'invalid-output') {
    return {
      label: 'Saída inválida',
      tone: 'danger' as StatusBadgeTone,
    };
  }
  if (value.state === 'blocked') {
    return {
      label: 'Bloqueado',
      tone: 'warning' as StatusBadgeTone,
    };
  }
  if (value.state === 'unavailable') {
    return {
      label: 'Indisponível',
      tone: 'warning' as StatusBadgeTone,
    };
  }

  return {
    label: 'Pronto',
    tone: 'neutral' as StatusBadgeTone,
  };
});

const kindLabel = computed(() => {
  const values: Record<DevContainerConfigurationKind, string> = {
    image: 'Imagem',
    dockerfile: 'Dockerfile',
    compose: 'Docker Compose',
    unknown: 'Não identificado',
  };
  return preflight.value?.configuration
    ? values[preflight.value.configuration.kind]
    : '—';
});

const runtimeLabel = computed(() =>
  preflight.value?.runtime === 'devcontainer' ? 'Dev Container' : 'Host',
);

const lifecycleLabel = computed(() => {
  const lifecycle = preflight.value?.environmentLifecycle;
  if (lifecycle === 'ready') return 'Ready';
  if (lifecycle === 'starting') return 'Starting';
  if (lifecycle === 'stopping') return 'Stopping';
  if (lifecycle === 'failed') return 'Failed';
  if (lifecycle === 'degraded') return 'Degraded';
  if (lifecycle === 'stopped') return 'Stopped';
  return '—';
});

const hooks = computed(
  () => preflight.value?.configuration?.lifecycleHooks ?? [],
);

const canCreate = computed(() => {
  const value = preflight.value;
  return (
    !executionActive.value &&
    value?.operation === 'create' &&
    value.state === 'review' &&
    value.runtime === 'host' &&
    value.environmentLifecycle === 'ready' &&
    value.requiresConfirmation === true &&
    (value.configuration?.kind === 'image' ||
      value.configuration?.kind === 'dockerfile')
  );
});

const canRebuild = computed(() => {
  const value = preflight.value;
  return (
    !executionActive.value &&
    value?.operation === 'rebuild' &&
    value.state === 'review' &&
    value.runtime === 'devcontainer' &&
    value.environmentLifecycle === 'ready' &&
    value.requiresConfirmation === true &&
    (value.configuration?.kind === 'image' ||
      value.configuration?.kind === 'dockerfile')
  );
});

const canStop = computed(
  () => !executionActive.value && preflight.value?.stopAvailable === true,
);
const canRecover = computed(
  () => !executionActive.value && preflight.value?.recoveryAvailable === true,
);

const busy = computed(
  () => loading.value || submitting.value || cancellingExecution.value,
);

const limitationLabels: Record<DevContainerLifecycleLimitation, string> = {
  'post-create-hooks-deferred':
    'Hooks pós-criação permanecem diferidos neste lifecycle.',
};

const operationLabel = computed(() => {
  const operation = execution.value?.operation;
  if (operation === 'create') return 'Criação';
  if (operation === 'rebuild') return 'Rebuild';
  if (operation === 'stop') return 'Parada';
  if (operation === 'recover') return 'Recuperação';
  return '';
});

const executionTone = computed<StatusBadgeTone>(() => {
  if (!execution.value) return 'neutral';
  if (execution.value.status === 'failed') return 'danger';
  if (execution.value.status === 'cancelled') return 'neutral';
  if (execution.value.status === 'succeeded') return 'success';
  if (execution.value.status === 'queued') return 'warning';
  return 'info';
});

const executionStatusLabel = computed(() => {
  if (execution.value?.status === 'queued') return 'Aguardando';
  if (execution.value?.status === 'running') return 'Em execução';
  if (execution.value?.status === 'succeeded') return 'Concluído';
  if (execution.value?.status === 'failed') return 'Falhou';
  if (execution.value?.status === 'cancelled') return 'Cancelado';
  return '';
});

const confirmationCopy = computed(() => {
  if (confirmationOperation.value === 'create') {
    return {
      title: 'Criar este Dev Container?',
      description:
        'O Dashboard revalidará o preflight, emitirá uma confirmação de uso único e iniciará um job owned para esta Environment Instance.',
      confirm: 'Confirmar criação',
    };
  }
  if (confirmationOperation.value === 'rebuild') {
    return {
      title: 'Reconstruir este Dev Container?',
      description:
        'O runtime owned atual será removido somente após revalidar ownership e configuração; a recriação continuará como job observável.',
      confirm: 'Confirmar rebuild',
    };
  }
  if (confirmationOperation.value === 'stop') {
    return {
      title: 'Parar este Dev Container?',
      description:
        'O Dashboard revalidará o ownership e removerá somente o container owned desta Environment Instance, sem remover volumes.',
      confirm: 'Confirmar parada',
    };
  }
  return {
    title: 'Limpar runtime parcial?',
    description:
      'O Dashboard revalidará o ownership persistido e limpará somente o runtime parcial owned antes de devolver o ambiente ao Host.',
    confirm: 'Confirmar recuperação',
  };
});

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

async function refreshPreflight(currentGeneration = generation): Promise<void> {
  try {
    const result = await fetchDevContainerLifecyclePreflight(
      props.project.id,
      props.environmentInstanceId,
    );
    if (currentGeneration === generation) preflight.value = result;
  } catch (error) {
    if (currentGeneration === generation) {
      preflight.value = null;
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o preflight do Dev Container.';
    }
  }
}

async function pollExecution(currentGeneration: number): Promise<void> {
  try {
    const result = await fetchDevContainerLifecycleExecution(
      props.project.id,
      props.environmentInstanceId,
    );
    if (currentGeneration !== generation) return;
    execution.value = result;
    if (executionActive.value) {
      schedulePoll(currentGeneration);
      return;
    }
    await refreshPreflight(currentGeneration);
  } catch (error) {
    if (currentGeneration === generation) {
      mutationErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível acompanhar o lifecycle do Dev Container.';
    }
  }
}

async function load(): Promise<void> {
  const current = ++generation;
  clearPoll();
  loading.value = true;
  errorMessage.value = '';

  const [preflightResult, executionResult] = await Promise.allSettled([
    fetchDevContainerLifecyclePreflight(
      props.project.id,
      props.environmentInstanceId,
    ),
    fetchDevContainerLifecycleExecution(
      props.project.id,
      props.environmentInstanceId,
    ),
  ]);

  if (current === generation) {
    if (preflightResult.status === 'fulfilled') {
      preflight.value = preflightResult.value;
    } else {
      preflight.value = null;
      errorMessage.value =
        preflightResult.reason instanceof Error
          ? preflightResult.reason.message
          : 'Não foi possível carregar o preflight do Dev Container.';
    }

    execution.value =
      executionResult.status === 'fulfilled' ? executionResult.value : null;
    loading.value = false;
    schedulePoll(current);
  }
}

function openConfirmation(
  operation: DevContainerLifecycleExecutionOperation,
): void {
  if (busy.value || executionActive.value) return;
  mutationErrorMessage.value = '';
  confirmationOperation.value = operation;
}

function closeConfirmation(): void {
  if (submitting.value) return;
  mutationErrorMessage.value = '';
  confirmationOperation.value = null;
}

async function submitLifecycleOperation(): Promise<void> {
  const operation = confirmationOperation.value;
  const currentPreflight = preflight.value;
  if (!operation || !currentPreflight || submitting.value) return;

  const currentGeneration = generation;
  const environmentInstanceId = currentPreflight.environmentInstanceId;
  submitting.value = true;
  mutationErrorMessage.value = '';

  try {
    let confirmationToken: string;
    if (operation === 'create' || operation === 'rebuild') {
      const confirmation = await prepareDevContainerLifecycleConfirmation(
        props.project.id,
        environmentInstanceId,
      );
      if (
        confirmation.environmentInstanceId !== environmentInstanceId ||
        confirmation.operation !== operation
      ) {
        throw new Error(
          'A confirmação retornada não corresponde à operação e ao ambiente selecionados.',
        );
      }
      confirmationToken = confirmation.token;
    } else {
      const confirmation = await prepareDevContainerStopConfirmation(
        props.project.id,
        environmentInstanceId,
      );
      if (confirmation.environmentInstanceId !== environmentInstanceId) {
        throw new Error(
          'A confirmação retornada não corresponde ao ambiente selecionado.',
        );
      }
      confirmationToken = confirmation.token;
    }

    const nextExecution = await startDevContainerLifecycleExecution(
      props.project.id,
      operation,
      confirmationToken,
      environmentInstanceId,
    );

    if (currentGeneration === generation) {
      execution.value = nextExecution;
      confirmationOperation.value = null;
      schedulePoll(currentGeneration);
    }
  } catch (error) {
    if (currentGeneration === generation) {
      mutationErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível iniciar a operação do Dev Container.';
    }
  } finally {
    submitting.value = false;
  }
}

async function cancelCurrentExecution(): Promise<void> {
  if (!execution.value?.cancelSupported || !executionActive.value) return;
  cancellingExecution.value = true;
  mutationErrorMessage.value = '';
  try {
    await cancelDevContainerLifecycleExecution(
      props.project.id,
      execution.value.environmentInstanceId,
    );
    await pollExecution(generation);
  } catch (error) {
    mutationErrorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível cancelar a operação Dev Container.';
  } finally {
    cancellingExecution.value = false;
  }
}

watch(
  [() => props.project.id, () => props.environmentInstanceId],
  () => {
    preflight.value = null;
    execution.value = null;
    confirmationOperation.value = null;
    mutationErrorMessage.value = '';
    void load();
  },
  { immediate: true },
);

onBeforeUnmount(clearPoll);
</script>

<template>
  <section class="devcontainer-panel" aria-label="Dev Container">
    <div v-if="errorMessage" class="devcontainer-message is-error" role="alert">
      <ExclamationTriangleIcon aria-hidden="true" />
      <span>{{ errorMessage }}</span>
    </div>

    <div
      v-if="loading && !preflight"
      class="devcontainer-loading"
      role="status"
    >
      <ArrowPathIcon class="is-spinning" aria-hidden="true" />
      <span>Validando configuração, ambiente e lifecycle…</span>
    </div>

    <template v-else-if="preflight && stateCopy">
      <header class="devcontainer-toolbar">
        <div class="devcontainer-summary">
          <div>
            <span>Estado</span>
            <StatusBadge :tone="stateCopy.tone">
              {{ stateCopy.label }}
            </StatusBadge>
          </div>
          <div>
            <span>Runtime</span>
            <strong>{{ runtimeLabel }}</strong>
          </div>
          <div>
            <span>Lifecycle</span>
            <strong>{{ lifecycleLabel }}</strong>
          </div>
          <div>
            <span>Tipo</span>
            <strong>{{ kindLabel }}</strong>
          </div>
          <div>
            <span>CLI</span>
            <strong>{{ preflight.cliVersion ?? '—' }}</strong>
          </div>
        </div>

        <div class="devcontainer-actions">
          <button
            v-if="canCreate && !confirmationOperation"
            class="primary-button devcontainer-create"
            type="button"
            :disabled="busy"
            @click="openConfirmation('create')"
          >
            <PlayIcon aria-hidden="true" />
            Criar
          </button>

          <button
            v-if="canRebuild && !confirmationOperation"
            class="primary-button devcontainer-rebuild"
            type="button"
            :disabled="busy"
            @click="openConfirmation('rebuild')"
          >
            <ArrowPathIcon aria-hidden="true" />
            Rebuild
          </button>

          <button
            v-if="canStop && !confirmationOperation"
            class="secondary-button devcontainer-stop"
            type="button"
            :disabled="busy"
            @click="openConfirmation('stop')"
          >
            <StopIcon aria-hidden="true" />
            Parar
          </button>

          <button
            v-if="canRecover && !confirmationOperation"
            class="secondary-button devcontainer-recover"
            type="button"
            :disabled="busy"
            @click="openConfirmation('recover')"
          >
            <ArrowPathIcon aria-hidden="true" />
            Limpar runtime parcial
          </button>

          <button
            class="secondary-button devcontainer-refresh"
            type="button"
            :disabled="submitting"
            aria-label="Atualizar preflight"
            title="Atualizar preflight"
            @click="load"
          >
            <ArrowPathIcon
              aria-hidden="true"
              :class="{ 'is-spinning': loading }"
            />
          </button>
        </div>
      </header>

      <div
        class="devcontainer-content"
        :class="{
          'is-empty':
            preflight.discoveryState === 'not-configured' &&
            !preflight.configSource &&
            !preflight.configuration,
        }"
      >
        <section
          v-if="execution"
          class="devcontainer-execution"
          :class="{ 'is-active': executionActive }"
          aria-label="Lifecycle em execução"
        >
          <ArrowPathIcon
            aria-hidden="true"
            :class="{ 'is-spinning': executionActive }"
          />
          <div>
            <div class="devcontainer-execution-heading">
              <strong>{{ operationLabel }}</strong>
              <StatusBadge :tone="executionTone">
                {{ executionStatusLabel }}
              </StatusBadge>
            </div>
            <span>Etapa: {{ execution.stage }}</span>
            <span>
              Início {{ formatDate(execution.startedAt) }}
              <template v-if="execution.finishedAt">
                · fim {{ formatDate(execution.finishedAt) }}
              </template>
            </span>
            <span v-if="execution.diagnostic">{{ execution.diagnostic }}</span>
          </div>
          <button
            v-if="executionActive && execution.cancelSupported"
            class="secondary-button"
            type="button"
            :disabled="cancellingExecution"
            @click="cancelCurrentExecution"
          >
            <StopIcon aria-hidden="true" />
            {{ cancellingExecution ? 'Cancelando…' : 'Cancelar operação' }}
          </button>
        </section>

        <section
          class="devcontainer-diagnostic"
          :class="{ 'is-blocked': preflight.state === 'blocked' }"
        >
          <span class="devcontainer-diagnostic-icon" aria-hidden="true">
            <ExclamationTriangleIcon v-if="preflight.state === 'blocked'" />
            <CubeTransparentIcon
              v-else-if="preflight.discoveryState === 'not-configured'"
            />
            <InformationCircleIcon v-else />
          </span>

          <div>
            <strong>{{ preflight.diagnostic }}</strong>
            <span>
              Preflight somente leitura · observado em
              {{ formatDate(preflight.observedAt) }}
            </span>
            <span v-if="preflight.requiresConfirmation">
              {{
                preflight.operation === 'rebuild'
                  ? 'Rebuild disponível mediante confirmação explícita.'
                  : 'Criação disponível mediante confirmação explícita.'
              }}
            </span>
          </div>
        </section>

        <div
          v-if="confirmationOperation"
          class="devcontainer-confirmation"
        >
          <ExclamationTriangleIcon aria-hidden="true" />
          <div>
            <strong>{{ confirmationCopy.title }}</strong>
            <span>{{ confirmationCopy.description }}</span>
            <span
              v-if="
                (confirmationOperation === 'create' ||
                  confirmationOperation === 'rebuild') &&
                preflight.limitations.includes('post-create-hooks-deferred')
              "
            >
              Hooks pós-criação continuarão diferidos.
            </span>
            <div
              v-if="mutationErrorMessage"
              class="devcontainer-confirmation-error"
              role="alert"
            >
              {{ mutationErrorMessage }}
            </div>
            <div class="devcontainer-confirmation-actions">
              <button
                class="secondary-button"
                type="button"
                :disabled="submitting"
                @click="closeConfirmation"
              >
                Cancelar
              </button>
              <button
                class="primary-button devcontainer-confirm-action"
                type="button"
                :disabled="submitting"
                @click="submitLifecycleOperation"
              >
                <ArrowPathIcon
                  v-if="submitting"
                  class="is-spinning"
                  aria-hidden="true"
                />
                <PlayIcon v-else-if="confirmationOperation === 'create'" aria-hidden="true" />
                <StopIcon v-else aria-hidden="true" />
                {{ submitting ? 'Iniciando…' : confirmationCopy.confirm }}
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="mutationErrorMessage && !confirmationOperation"
          class="devcontainer-message-inline is-error"
          role="alert"
        >
          {{ mutationErrorMessage }}
        </div>

        <dl
          v-if="
            preflight.configSource ||
            preflight.configuration?.name ||
            preflight.configuration?.service
          "
          class="devcontainer-details"
        >
          <div v-if="preflight.configSource">
            <dt>Configuração</dt>
            <dd>{{ preflight.configSource }}</dd>
          </div>
          <div v-if="preflight.configuration?.name">
            <dt>Nome</dt>
            <dd>{{ preflight.configuration.name }}</dd>
          </div>
          <div v-if="preflight.configuration?.service">
            <dt>Serviço Compose</dt>
            <dd>{{ preflight.configuration.service }}</dd>
          </div>
        </dl>

        <section
          v-if="preflight.limitations.length > 0"
          class="devcontainer-secondary-note"
        >
          <InformationCircleIcon aria-hidden="true" />
          <div>
            <strong>Limitações atuais</strong>
            <span v-for="limitation in preflight.limitations" :key="limitation">
              {{ limitationLabels[limitation] }}
            </span>
          </div>
        </section>

        <section v-if="hooks.length > 0" class="devcontainer-secondary-note">
          <ExclamationTriangleIcon aria-hidden="true" />
          <div>
            <strong>Hooks declarados · {{ hooks.length }}</strong>
            <p>{{ hooks.join(' · ') }}</p>
            <span>
              Apenas os nomes são exibidos; os comandos não são retornados nem
              executados pelo preflight.
            </span>
          </div>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped>
.devcontainer-panel {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: calc(100vh - var(--app-topbar-height, 72px));
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-1);
}

.devcontainer-toolbar {
  display: flex;
  min-height: 62px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 9px 12px 9px 14px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-1) 96%, var(--surface-2) 4%);
}

.devcontainer-summary {
  display: grid;
  min-width: 0;
  flex: 1 1 auto;
  grid-template-columns: repeat(5, minmax(95px, 1fr));
  gap: 1px;
}

.devcontainer-summary > div {
  display: grid;
  min-width: 0;
  gap: 4px;
  padding: 0 12px;
  border-left: 1px solid var(--border);
}

.devcontainer-summary > div:first-child {
  padding-left: 0;
  border-left: 0;
}

.devcontainer-summary span {
  color: var(--text-dim);
  font-size: 8px;
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.devcontainer-summary strong {
  overflow: hidden;
  color: var(--text);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.devcontainer-actions,
.devcontainer-confirmation-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
}

.devcontainer-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.devcontainer-actions button,
.devcontainer-confirmation-actions button,
.devcontainer-execution button {
  min-height: 34px;
  gap: 7px;
  padding-inline: 11px;
  font-size: 10px;
}

.devcontainer-refresh {
  width: 34px;
  padding: 0 !important;
}

.devcontainer-actions svg,
.devcontainer-confirmation-actions svg,
.devcontainer-message svg,
.devcontainer-loading svg,
.devcontainer-diagnostic svg,
.devcontainer-secondary-note svg,
.devcontainer-confirmation > svg,
.devcontainer-execution > svg,
.devcontainer-execution button svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
}

.devcontainer-content {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 14px;
}

.devcontainer-content.is-empty {
  justify-content: center;
  align-items: center;
}

.devcontainer-content.is-empty .devcontainer-diagnostic {
  width: min(620px, 100%);
  border: 0;
  background: transparent;
  text-align: center;
}

.devcontainer-content.is-empty .devcontainer-diagnostic-icon {
  margin: 0 auto 6px;
}

.devcontainer-diagnostic,
.devcontainer-secondary-note,
.devcontainer-confirmation,
.devcontainer-execution {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.devcontainer-execution {
  align-items: center;
}

.devcontainer-execution.is-active {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
}

.devcontainer-execution > div {
  display: grid;
  min-width: 0;
  flex: 1 1 auto;
  gap: 3px;
}

.devcontainer-execution-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.devcontainer-execution strong {
  font-size: 11px;
}

.devcontainer-execution span {
  color: var(--text-muted);
  font-size: 10px;
}

.devcontainer-diagnostic.is-blocked {
  border-color: color-mix(in srgb, var(--danger-text) 38%, var(--border));
  background: var(--danger-surface);
}

.devcontainer-diagnostic-icon {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 8px;
  color: var(--text-muted);
  background: var(--surface-3);
}

.devcontainer-diagnostic > div,
.devcontainer-secondary-note > div,
.devcontainer-confirmation > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.devcontainer-diagnostic strong,
.devcontainer-secondary-note strong,
.devcontainer-confirmation strong {
  color: var(--text);
  font-size: 11px;
  line-height: 1.4;
}

.devcontainer-diagnostic span,
.devcontainer-secondary-note span,
.devcontainer-secondary-note p,
.devcontainer-confirmation span {
  margin: 0;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.45;
}

.devcontainer-confirmation {
  border-color: color-mix(in srgb, var(--warning-text) 42%, var(--border));
  background: var(--warning-surface);
}

.devcontainer-confirmation-actions {
  margin-top: 6px;
}

.devcontainer-confirmation-error,
.devcontainer-message-inline.is-error {
  color: var(--danger-text);
  font-size: 10px;
}

.devcontainer-message-inline {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.devcontainer-details {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  border: 1px solid var(--border);
  background: var(--border);
}

.devcontainer-details > div {
  min-width: 0;
  padding: 10px 12px;
  background: var(--surface-2);
}

.devcontainer-details dt {
  margin-bottom: 4px;
  color: var(--text-dim);
  font-size: 8px;
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.devcontainer-details dd {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--text);
  font-size: 10px;
}

.devcontainer-message,
.devcontainer-loading {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--text-muted);
  font-size: 10px;
}

.devcontainer-message.is-error {
  color: var(--danger-text);
}

.is-spinning {
  animation: devcontainer-spin 0.8s linear infinite;
}

@keyframes devcontainer-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-spinning {
    animation: none;
  }
}

@media (max-width: 1050px) {
  .devcontainer-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .devcontainer-summary {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    row-gap: 10px;
  }

  .devcontainer-actions {
    justify-content: flex-end;
  }
}

@media (max-width: 640px) {
  .devcontainer-summary,
  .devcontainer-details {
    grid-template-columns: 1fr;
  }

  .devcontainer-summary > div {
    padding: 6px 0;
    border-top: 1px solid var(--border);
    border-left: 0;
  }

  .devcontainer-summary > div:first-child {
    border-top: 0;
  }

  .devcontainer-details {
    gap: 0;
  }

  .devcontainer-execution {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
