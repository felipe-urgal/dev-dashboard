<script setup lang="ts">
import {
  ArrowPathIcon,
  CubeTransparentIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/vue/24/outline';
import { computed, ref, watch } from 'vue';

import type { Project } from '@dev-dashboard/contracts';

import {
  fetchDevContainerLifecyclePreflight,
  type DevContainerConfigurationKind,
  type DevContainerLifecycleLimitation,
  type DevContainerLifecyclePreflight,
} from '../api/dev-container';
import Card from './Card.vue';
import StatusBadge from './StatusBadge.vue';
import type { StatusBadgeTone } from './status-badge-types';

const props = defineProps<{
  project: Project;
  environmentInstanceId?: string | undefined;
}>();

const preflight = ref<DevContainerLifecyclePreflight | null>(null);
const loading = ref(false);
const errorMessage = ref('');
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
              Preflight somente leitura. Nenhum container ou lifecycle hook é
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

      <div v-if="loading && !preflight" class="devcontainer-message">
        <ArrowPathIcon class="is-spinning" aria-hidden="true" />
        <span>Validando configuração, ambiente e lifecycle…</span>
      </div>

      <div
        v-else-if="errorMessage"
        class="devcontainer-message is-error"
        role="alert"
      >
        <ExclamationTriangleIcon aria-hidden="true" />
        <span>{{ errorMessage }}</span>
      </div>

      <template v-else-if="preflight && stateCopy">
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
            <strong>{{ runtimeLabel }}</strong>
          </div>
          <div>
            <span class="devcontainer-label">Tipo</span>
            <strong>{{ kindLabel }}</strong>
          </div>
          <div>
            <span class="devcontainer-label">CLI</span>
            <strong>{{ preflight.cliVersion ?? '—' }}</strong>
          </div>
        </div>

        <div
          class="devcontainer-note"
          :class="{ 'is-blocked': preflight.state === 'blocked' }"
        >
          <ExclamationTriangleIcon
            v-if="preflight.state === 'blocked'"
            aria-hidden="true"
          />
          <InformationCircleIcon v-else aria-hidden="true" />
          <div>
            <strong>{{ preflight.diagnostic }}</strong>
            <span>
              Execução desabilitada · observado em
              {{ formatDate(preflight.observedAt) }}
            </span>
            <span v-if="preflight.requiresConfirmation">
              Uma futura criação exigirá confirmação explícita após revalidação.
            </span>
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

        <div
          v-if="preflight.limitations.length > 0"
          class="devcontainer-limitations"
        >
          <InformationCircleIcon aria-hidden="true" />
          <div>
            <strong>Limitações atuais</strong>
            <span v-for="limitation in preflight.limitations" :key="limitation">
              {{ limitationLabels[limitation] }}
            </span>
          </div>
        </div>

        <div v-if="hooks.length > 0" class="devcontainer-hooks">
          <ExclamationTriangleIcon aria-hidden="true" />
          <div>
            <strong>Hooks declarados · {{ hooks.length }}</strong>
            <p>
              {{ hooks.join(' · ') }}
            </p>
            <span>
              Apenas os nomes são exibidos; os comandos não são retornados nem
              executados pelo preflight.
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
.devcontainer-limitations span,
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
.devcontainer-limitations svg,
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
.devcontainer-limitations,
.devcontainer-hooks {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  margin-top: var(--space-5);
}

.devcontainer-message.is-error,
.devcontainer-note.is-blocked {
  color: var(--danger-text);
}

.devcontainer-note div,
.devcontainer-limitations div,
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

.devcontainer-limitations,
.devcontainer-hooks {
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}

@media (max-width: 760px) {
  .devcontainer-summary,
  .devcontainer-details {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
