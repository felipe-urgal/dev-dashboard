<script setup lang="ts">
import {
  ArrowPathIcon,
  CheckCircleIcon,
  CubeTransparentIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/vue/24/outline';
import { computed, ref, watch } from 'vue';

import type { Project } from '@dev-dashboard/contracts';

import {
  fetchDevContainerInspection,
  type DevContainerConfigurationKind,
  type DevContainerInspection,
  type DevContainerInspectionState,
} from '../api/dev-container';
import Card from './Card.vue';
import StatusBadge from './StatusBadge.vue';
import type { StatusBadgeTone } from './status-badge-types';

const props = defineProps<{ project: Project }>();

const inspection = ref<DevContainerInspection | null>(null);
const loading = ref(false);
const errorMessage = ref('');
let generation = 0;

const stateCopy = computed(() => {
  const state = inspection.value?.state;
  const values: Record<
    DevContainerInspectionState,
    { label: string; detail: string; tone: StatusBadgeTone }
  > = {
    available: {
      label: 'Disponível',
      detail: 'Configuração resolvida pela Dev Container CLI.',
      tone: 'success',
    },
    'not-configured': {
      label: 'Não configurado',
      detail: 'Este projeto não declara uma configuração Dev Container padrão.',
      tone: 'neutral',
    },
    'cli-missing': {
      label: 'CLI ausente',
      detail: 'A configuração existe, mas a Dev Container CLI não está disponível.',
      tone: 'warning',
    },
    unavailable: {
      label: 'Indisponível',
      detail: 'A configuração não pôde ser inspecionada com segurança.',
      tone: 'warning',
    },
    'invalid-output': {
      label: 'Saída inválida',
      detail: 'A CLI respondeu, mas o resultado estruturado não pôde ser validado.',
      tone: 'danger',
    },
  };
  return state ? values[state] : null;
});

const kindLabel = computed(() => {
  const values: Record<DevContainerConfigurationKind, string> = {
    image: 'Imagem',
    dockerfile: 'Dockerfile',
    compose: 'Docker Compose',
    unknown: 'Não identificado',
  };
  return inspection.value?.configuration
    ? values[inspection.value.configuration.kind]
    : '—';
});

const hooks = computed(
  () => inspection.value?.configuration?.lifecycleHooks ?? [],
);

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

async function load(): Promise<void> {
  const current = ++generation;
  loading.value = true;
  errorMessage.value = '';

  try {
    const result = await fetchDevContainerInspection(props.project.id);
    if (current === generation) inspection.value = result;
  } catch (error) {
    if (current === generation) {
      inspection.value = null;
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível inspecionar o Dev Container.';
    }
  } finally {
    if (current === generation) loading.value = false;
  }
}

watch(
  () => props.project.id,
  () => {
    inspection.value = null;
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <section class="devcontainer-panel" aria-labelledby="devcontainer-title">
    <Card>
      <template #header>
        <div class="devcontainer-heading">
          <span class="devcontainer-icon">
            <CubeTransparentIcon aria-hidden="true" />
          </span>
          <div>
            <h3 id="devcontainer-title">Dev Container</h3>
            <p>
              Discovery somente leitura. Nenhum container ou lifecycle hook é
              executado nesta tela.
            </p>
          </div>
        </div>
      </template>
      <template #actions>
        <button
          class="secondary-button devcontainer-refresh"
          type="button"
          :disabled="loading"
          @click="load"
        >
          <ArrowPathIcon
            aria-hidden="true"
            :class="{ 'is-spinning': loading }"
          />
          Atualizar
        </button>
      </template>

      <div v-if="loading && !inspection" class="devcontainer-message">
        <ArrowPathIcon class="is-spinning" aria-hidden="true" />
        <span>Inspecionando configuração e Dev Container CLI…</span>
      </div>

      <div v-else-if="errorMessage" class="devcontainer-message is-error" role="alert">
        <ExclamationTriangleIcon aria-hidden="true" />
        <span>{{ errorMessage }}</span>
      </div>

      <template v-else-if="inspection && stateCopy">
        <div class="devcontainer-summary">
          <div>
            <span class="devcontainer-label">Estado</span>
            <div class="devcontainer-value">
              <StatusBadge :tone="stateCopy.tone">
                {{ stateCopy.label }}
              </StatusBadge>
            </div>
          </div>
          <div>
            <span class="devcontainer-label">Runtime atual</span>
            <strong>Host</strong>
          </div>
          <div>
            <span class="devcontainer-label">Tipo</span>
            <strong>{{ kindLabel }}</strong>
          </div>
          <div>
            <span class="devcontainer-label">CLI</span>
            <strong>{{ inspection.cliVersion ?? '—' }}</strong>
          </div>
        </div>

        <div class="devcontainer-note">
          <CheckCircleIcon
            v-if="inspection.state === 'available'"
            aria-hidden="true"
          />
          <InformationCircleIcon v-else aria-hidden="true" />
          <div>
            <strong>{{ stateCopy.detail }}</strong>
            <span v-if="inspection.diagnostic">{{ inspection.diagnostic }}</span>
            <span v-else>
              Observado em {{ formatDate(inspection.observedAt) }}
            </span>
          </div>
        </div>

        <dl
          v-if="inspection.configSource || inspection.configuration?.service"
          class="devcontainer-details"
        >
          <div v-if="inspection.configSource">
            <dt>Configuração</dt>
            <dd>{{ inspection.configSource }}</dd>
          </div>
          <div v-if="inspection.configuration?.name">
            <dt>Nome</dt>
            <dd>{{ inspection.configuration.name }}</dd>
          </div>
          <div v-if="inspection.configuration?.service">
            <dt>Serviço Compose</dt>
            <dd>{{ inspection.configuration.service }}</dd>
          </div>
        </dl>

        <div v-if="hooks.length > 0" class="devcontainer-hooks">
          <ExclamationTriangleIcon aria-hidden="true" />
          <div>
            <strong>Hooks declarados · {{ hooks.length }}</strong>
            <p>
              {{ hooks.join(' · ') }}
            </p>
            <span>
              Apenas os nomes são exibidos; os comandos não são retornados nem
              executados pelo discovery.
            </span>
          </div>
        </div>
      </template>
    </Card>
  </section>
</template>

<style scoped>
.devcontainer-panel {
  max-width: 960px;
  margin: 0 auto;
}

.devcontainer-heading {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.devcontainer-heading h3,
.devcontainer-heading p,
.devcontainer-hooks p {
  margin: 0;
}

.devcontainer-heading p,
.devcontainer-note span,
.devcontainer-hooks span {
  color: var(--text-muted);
}

.devcontainer-icon {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
}

.devcontainer-icon svg,
.devcontainer-refresh svg,
.devcontainer-message svg,
.devcontainer-note svg,
.devcontainer-hooks svg {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

.devcontainer-refresh {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.devcontainer-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-5);
}

.devcontainer-summary > div,
.devcontainer-details > div {
  min-width: 0;
}

.devcontainer-label,
.devcontainer-details dt {
  display: block;
  margin-bottom: var(--space-1);
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.devcontainer-value {
  min-height: 24px;
  display: flex;
  align-items: center;
}

.devcontainer-message,
.devcontainer-note,
.devcontainer-hooks {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  margin-top: var(--space-5);
}

.devcontainer-message.is-error {
  color: var(--danger-text);
}

.devcontainer-note div,
.devcontainer-hooks div {
  display: grid;
  gap: var(--space-1);
}

.devcontainer-details {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
  margin: var(--space-5) 0 0;
}

.devcontainer-details dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.devcontainer-hooks {
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-subtle);
}

@media (max-width: 760px) {
  .devcontainer-summary,
  .devcontainer-details {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
