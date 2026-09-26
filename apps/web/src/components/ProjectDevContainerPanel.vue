<script setup lang="ts">
import {
  ArrowPathIcon,
  CubeTransparentIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  PlayIcon,
  StopIcon,
} from '@heroicons/vue/24/outline';
import { computed, ref, watch } from 'vue';

import type { Project } from '@dev-dashboard/contracts';

import {
  fetchDevContainerLifecyclePreflight,
  prepareDevContainerLifecycleConfirmation,
  prepareDevContainerStopConfirmation,
  rebuildDevContainer,
  startDevContainer,
  stopDevContainer,
  type DevContainerConfigurationKind,
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
const loading = ref(false);
const creating = ref(false);
const rebuilding = ref(false);
const stopping = ref(false);
const createConfirmationVisible = ref(false);
const rebuildConfirmationVisible = ref(false);
const stopConfirmationVisible = ref(false);
const errorMessage = ref('');
const mutationErrorMessage = ref('');
let generation = 0;

const stateCopy = computed(() => {
  const value = preflight.value;
  if (!value) return null;

  if (value.state === 'review') {
    return {
      label: 'Revisão necessária',
      tone: 'warning' as StatusBadgeTone,
    };
  }

  if (value.state === 'blocked') {
    return {
      label: 'Bloqueado',
      tone: 'danger' as StatusBadgeTone,
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

  return {
    label: 'Indisponível',
    tone: 'warning' as StatusBadgeTone,
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

const hooks = computed(
  () => preflight.value?.configuration?.lifecycleHooks ?? [],
);

const canCreate = computed(() => {
  const value = preflight.value;
  return (
    value?.operation === 'create' &&
    value.state === 'review' &&
    value.runtime === 'host' &&
    value.requiresConfirmation === true &&
    (value.configuration?.kind === 'image' ||
      value.configuration?.kind === 'dockerfile')
  );
});

const canRebuild = computed(() => {
  const value = preflight.value;
  return (
    value?.operation === 'rebuild' &&
    value.state === 'review' &&
    value.runtime === 'devcontainer' &&
    value.requiresConfirmation === true &&
    (value.configuration?.kind === 'image' ||
      value.configuration?.kind === 'dockerfile')
  );
});

const canStop = computed(() => preflight.value?.runtime === 'devcontainer');

const busy = computed(
  () => loading.value || creating.value || rebuilding.value || stopping.value,
);

const limitationLabels: Record<DevContainerLifecycleLimitation, string> = {
  'post-create-hooks-deferred':
    'Hooks pós-criação permanecem diferidos neste lifecycle.',
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function openCreateConfirmation(): void {
  if (!canCreate.value || busy.value) return;
  mutationErrorMessage.value = '';
  createConfirmationVisible.value = true;
}

function cancelCreateConfirmation(): void {
  if (creating.value) return;
  mutationErrorMessage.value = '';
  createConfirmationVisible.value = false;
}

async function createDevContainer(): Promise<void> {
  const currentPreflight = preflight.value;
  if (!currentPreflight || !canCreate.value || creating.value) return;

  const currentGeneration = generation;
  const environmentInstanceId = currentPreflight.environmentInstanceId;
  creating.value = true;
  mutationErrorMessage.value = '';

  try {
    const confirmation = await prepareDevContainerLifecycleConfirmation(
      props.project.id,
      environmentInstanceId,
    );
    if (confirmation.environmentInstanceId !== environmentInstanceId) {
      throw new Error(
        'A confirmação retornada não corresponde ao ambiente selecionado.',
      );
    }

    await startDevContainer(
      props.project.id,
      confirmation.token,
      environmentInstanceId,
    );

    if (currentGeneration === generation) {
      createConfirmationVisible.value = false;
      await load();
    }
  } catch (error) {
    if (currentGeneration === generation) {
      mutationErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível criar o Dev Container.';
    }
  } finally {
    creating.value = false;
  }
}

function openRebuildConfirmation(): void {
  if (!canRebuild.value || busy.value) return;
  mutationErrorMessage.value = '';
  rebuildConfirmationVisible.value = true;
}

function cancelRebuildConfirmation(): void {
  if (rebuilding.value) return;
  mutationErrorMessage.value = '';
  rebuildConfirmationVisible.value = false;
}

async function rebuildCurrentDevContainer(): Promise<void> {
  const currentPreflight = preflight.value;
  if (!currentPreflight || !canRebuild.value || rebuilding.value) return;

  const currentGeneration = generation;
  const environmentInstanceId = currentPreflight.environmentInstanceId;
  rebuilding.value = true;
  mutationErrorMessage.value = '';

  try {
    const confirmation = await prepareDevContainerLifecycleConfirmation(
      props.project.id,
      environmentInstanceId,
    );
    if (
      confirmation.environmentInstanceId !== environmentInstanceId ||
      confirmation.operation !== 'rebuild'
    ) {
      throw new Error(
        'A confirmação retornada não corresponde ao rebuild do ambiente selecionado.',
      );
    }

    await rebuildDevContainer(
      props.project.id,
      confirmation.token,
      environmentInstanceId,
    );

    if (currentGeneration === generation) {
      rebuildConfirmationVisible.value = false;
      await load();
    }
  } catch (error) {
    if (currentGeneration === generation) {
      mutationErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível reconstruir o Dev Container.';
    }
  } finally {
    rebuilding.value = false;
  }
}

function openStopConfirmation(): void {
  if (!canStop.value || busy.value) return;
  mutationErrorMessage.value = '';
  stopConfirmationVisible.value = true;
}

function cancelStopConfirmation(): void {
  if (stopping.value) return;
  mutationErrorMessage.value = '';
  stopConfirmationVisible.value = false;
}

async function stopCurrentDevContainer(): Promise<void> {
  const currentPreflight = preflight.value;
  if (!currentPreflight || !canStop.value || stopping.value) return;

  const currentGeneration = generation;
  const environmentInstanceId = currentPreflight.environmentInstanceId;
  stopping.value = true;
  mutationErrorMessage.value = '';

  try {
    const confirmation = await prepareDevContainerStopConfirmation(
      props.project.id,
      environmentInstanceId,
    );
    if (confirmation.environmentInstanceId !== environmentInstanceId) {
      throw new Error(
        'A confirmação retornada não corresponde ao ambiente selecionado.',
      );
    }

    await stopDevContainer(
      props.project.id,
      confirmation.token,
      environmentInstanceId,
    );

    if (currentGeneration === generation) {
      stopConfirmationVisible.value = false;
      await load();
    }
  } catch (error) {
    if (currentGeneration === generation) {
      mutationErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível parar o Dev Container.';
    }
  } finally {
    stopping.value = false;
  }
}

async function load(): Promise<void> {
  const current = ++generation;
  loading.value = true;
  errorMessage.value = '';

  try {
    const result = await fetchDevContainerLifecyclePreflight(
      props.project.id,
      props.environmentInstanceId,
    );
    if (current === generation) preflight.value = result;
  } catch (error) {
    if (current === generation) {
      preflight.value = null;
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o preflight do Dev Container.';
    }
  } finally {
    if (current === generation) loading.value = false;
  }
}

watch(
  [() => props.project.id, () => props.environmentInstanceId],
  () => {
    preflight.value = null;
    createConfirmationVisible.value = false;
    rebuildConfirmationVisible.value = false;
    stopConfirmationVisible.value = false;
    mutationErrorMessage.value = '';
    void load();
  },
  { immediate: true },
);
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
            v-if="
              canCreate &&
              !createConfirmationVisible &&
              !rebuildConfirmationVisible &&
              !stopConfirmationVisible
            "
            class="primary-button devcontainer-create"
            type="button"
            :disabled="busy"
            @click="openCreateConfirmation"
          >
            <PlayIcon aria-hidden="true" />
            Criar
          </button>

          <button
            v-if="
              canRebuild &&
              !rebuildConfirmationVisible &&
              !createConfirmationVisible &&
              !stopConfirmationVisible
            "
            class="primary-button devcontainer-rebuild"
            type="button"
            :disabled="busy"
            @click="openRebuildConfirmation"
          >
            <ArrowPathIcon aria-hidden="true" />
            Rebuild
          </button>

          <button
            v-if="
              canStop &&
              !stopConfirmationVisible &&
              !createConfirmationVisible &&
              !rebuildConfirmationVisible
            "
            class="secondary-button devcontainer-stop"
            type="button"
            :disabled="busy"
            @click="openStopConfirmation"
          >
            <StopIcon aria-hidden="true" />
            Parar
          </button>

          <button
            class="secondary-button devcontainer-refresh"
            type="button"
            :disabled="busy"
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
                  ? 'O rebuild exige confirmação explícita e nova revalidação no backend.'
                  : 'A criação exige confirmação explícita e nova revalidação no backend.'
              }}
            </span>
          </div>
        </section>

        <div
          v-if="createConfirmationVisible && canCreate"
          class="devcontainer-confirmation"
        >
          <ExclamationTriangleIcon aria-hidden="true" />
          <div>
            <strong>Criar este Dev Container?</strong>
            <span>
              O Dashboard revalidará o preflight, emitirá uma confirmação de uso
              único e executará somente o lifecycle já aprovado para esta
              Environment Instance.
            </span>
            <span
              v-if="
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
                :disabled="creating"
                @click="cancelCreateConfirmation"
              >
                Cancelar
              </button>
              <button
                class="primary-button devcontainer-confirm-action"
                type="button"
                :disabled="creating"
                @click="createDevContainer"
              >
                <ArrowPathIcon
                  v-if="creating"
                  class="is-spinning"
                  aria-hidden="true"
                />
                <PlayIcon v-else aria-hidden="true" />
                {{ creating ? 'Criando…' : 'Confirmar criação' }}
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="rebuildConfirmationVisible && canRebuild"
          class="devcontainer-confirmation"
        >
          <ExclamationTriangleIcon aria-hidden="true" />
          <div>
            <strong>Reconstruir este Dev Container?</strong>
            <span>
              O runtime owned atual será removido somente após a revalidação do
              ownership e da configuração. Em seguida, o Dashboard recriará o
              ambiente usando o snapshot confirmado.
            </span>
            <span>
              Volumes não são removidos implicitamente e uma falha na nova
              criação aciona o rollback scoped já protegido pelo backend.
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
                :disabled="rebuilding"
                @click="cancelRebuildConfirmation"
              >
                Cancelar
              </button>
              <button
                class="primary-button devcontainer-confirm-action"
                type="button"
                :disabled="rebuilding"
                @click="rebuildCurrentDevContainer"
              >
                <ArrowPathIcon
                  :class="{ 'is-spinning': rebuilding }"
                  aria-hidden="true"
                />
                {{ rebuilding ? 'Reconstruindo…' : 'Confirmar rebuild' }}
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="stopConfirmationVisible && canStop"
          class="devcontainer-confirmation"
        >
          <ExclamationTriangleIcon aria-hidden="true" />
          <div>
            <strong>Parar este Dev Container?</strong>
            <span>
              O Dashboard revalidará o ownership atual antes do stop e removerá
              somente o container owned desta Environment Instance.
            </span>
            <span>
              Volumes não são removidos. Se o ownership mudar após esta
              confirmação, a operação falha fechado.
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
                :disabled="stopping"
                @click="cancelStopConfirmation"
              >
                Cancelar
              </button>
              <button
                class="primary-button devcontainer-confirm-action"
                type="button"
                :disabled="stopping"
                @click="stopCurrentDevContainer"
              >
                <ArrowPathIcon
                  v-if="stopping"
                  class="is-spinning"
                  aria-hidden="true"
                />
                <StopIcon v-else aria-hidden="true" />
                {{ stopping ? 'Parando…' : 'Confirmar parada' }}
              </button>
            </div>
          </div>
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
  grid-template-columns: repeat(4, minmax(110px, 1fr));
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

.devcontainer-actions button,
.devcontainer-confirmation-actions button {
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
.devcontainer-confirmation > svg {
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
.devcontainer-confirmation {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
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

.devcontainer-confirmation-error {
  margin-top: 4px;
  color: var(--danger-text);
  font-size: 10px;
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

@media (max-width: 900px) {
  .devcontainer-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .devcontainer-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    row-gap: 10px;
  }

  .devcontainer-summary > div:nth-child(3) {
    padding-left: 0;
    border-left: 0;
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
}
</style>
