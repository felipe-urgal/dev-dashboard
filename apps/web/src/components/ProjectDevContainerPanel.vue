<script setup lang="ts">
import {
  ArrowPathIcon,
  CheckCircleIcon,
  CubeTransparentIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LockClosedIcon,
} from '@heroicons/vue/24/outline';
import { computed, ref, watch } from 'vue';

import type { Project } from '@dev-dashboard/contracts';

import {
  fetchDevContainerInspection,
  fetchDevContainerLifecyclePreflight,
  type DevContainerConfigurationKind,
  type DevContainerInspection,
  type DevContainerInspectionState,
  type DevContainerLifecycleLimitation,
  type DevContainerLifecyclePreflight,
  type DevContainerLifecyclePreflightState,
} from '../api/dev-container';
import Card from './Card.vue';
import StatusBadge from './StatusBadge.vue';
import type { StatusBadgeTone } from './status-badge-types';

const props = defineProps<{
  project: Project;
  environmentInstanceId?: string;
}>();

const inspection = ref<DevContainerInspection | null>(null);
const preflight = ref<DevContainerLifecyclePreflight | null>(null);
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
      detail:
        'A configuração existe, mas a Dev Container CLI não está disponível.',
      tone: 'warning',
    },
    unavailable: {
      label: 'Indisponível',
      detail: 'A configuração não pôde ser inspecionada com segurança.',
      tone: 'warning',
    },
    'invalid-output': {
      label: 'Saída inválida',
      detail:
        'A CLI respondeu, mas o resultado estruturado não pôde ser validado.',
      tone: 'danger',
    },
  };
  return state ? values[state] : null;
});

const lifecycleCopy = computed(() => {
  const state = preflight.value?.state;
  const values: Record<
    DevContainerLifecyclePreflightState,
    { label: string; tone: StatusBadgeTone; icon: typeof InformationCircleIcon }
  > = {
    review: {
      label: 'Revisão necessária',
      tone: 'warning',
      icon: InformationCircleIcon,
    },
    blocked: {
      label: 'Bloqueado',
      tone: 'danger',
      icon: LockClosedIcon,
    },
    unavailable: {
      label: 'Indisponível',
      tone: 'warning',
      icon: ExclamationTriangleIcon,
    },
  };
  return state ? values[state] : null;
});

const effectiveConfiguration = computed(
  () => preflight.value?.configuration ?? inspection.value?.configuration,
);

const kindLabel = computed(() => {
  const values: Record<DevContainerConfigurationKind, string> = {
    image: 'Imagem',
    dockerfile: 'Dockerfile',
    compose: 'Docker Compose',
    unknown: 'Não identificado',
  };
  return effectiveConfiguration.value
    ? values[effectiveConfiguration.value.kind]
    : '—';
});

const hooks = computed(
  () => effectiveConfiguration.value?.lifecycleHooks ?? [],
);

const runtimeLabel = computed(() =>
  preflight.value?.runtime === 'devcontainer' ? 'Dev Container' : 'Host',
);

const limitationLabels: Record<DevContainerLifecycleLimitation, string> = {
  'cleanup-adapter-pending': 'Cleanup seguro ainda não disponível',
  'post-create-hooks-deferred':
    'Hooks pós-criação permanecem fora da execução automática',
};

const visibleConfigSource = computed(
  () => preflight.value?.configSource ?? inspection.value?.configSource,
);

const visibleCliVersion = computed(
  () => preflight.value?.cliVersion ?? inspection.value?.cliVersion,
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
    const [inspectionResult, preflightResult] = await Promise.all([
      fetchDevContainerInspection(props.project.id),
      fetchDevContainerLifecyclePreflight(
        props.project.id,
        props.environmentInstanceId,
      ),
    ]);
    if (current !== generation) return;
    inspection.value = inspectionResult;
    preflight.value = preflightResult;
  } catch (error) {
    if (current === generation) {
      inspection.value = null;
      preflight.value = null;
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
  [() => props.project.id, () => props.environmentInstanceId],
  () => {
    inspection.value = null;
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
              Discovery e preflight somente leitura. Nenhum container ou
              lifecycle hook é executado nesta tela.
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
        <span>Inspecionando configuração, CLI e lifecycle…</span>
      </div>

      <div
        v-else-if="errorMessage"
        class="devcontainer-message is-error"
        role="alert"
      >
        <ExclamationTriangleIcon aria-hidden="true" />
        <span>{{ errorMessage }}</span>
      </div>

      <template v-else-if="inspection && stateCopy">
        <div class="devcontainer-summary">
          <div>
            <span class="devcontainer-label">Discovery</span>
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
            <strong>{{ visibleCliVersion ?? '—' }}</strong>
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
            <span v-if="inspection.diagnostic">{{
              inspection.diagnostic
            }}</span>
            <span v-else>
              Observado em {{ formatDate(inspection.observedAt) }}
            </span>
          </div>
        </div>

        <dl
          v-if="visibleConfigSource || inspection.configuration?.service"
          class="devcontainer-details"
        >
          <div v-if="visibleConfigSource">
            <dt>Configuração</dt>
            <dd>{{ visibleConfigSource }}</dd>
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
            <p>{{ hooks.join(' · ') }}</p>
            <span>
              Apenas os nomes são exibidos; os comandos não são retornados nem
              executados pelo discovery.
            </span>
          </div>
        </div>

        <section
          v-if="preflight && lifecycleCopy"
          class="devcontainer-lifecycle"
          aria-labelledby="devcontainer-lifecycle-title"
        >
          <div class="devcontainer-lifecycle-heading">
            <component :is="lifecycleCopy.icon" aria-hidden="true" />
            <div>
              <span class="devcontainer-label">Lifecycle</span>
              <div class="devcontainer-lifecycle-title-row">
                <h4 id="devcontainer-lifecycle-title">Criação do runtime</h4>
                <StatusBadge :tone="lifecycleCopy.tone">
                  {{ lifecycleCopy.label }}
                </StatusBadge>
              </div>
            </div>
          </div>

          <p>{{ preflight.diagnostic }}</p>

          <ul v-if="preflight.limitations.length > 0">
            <li v-for="limitation in preflight.limitations" :key="limitation">
              {{ limitationLabels[limitation] }}
            </li>
          </ul>

          <span class="devcontainer-lifecycle-footnote">
            Execução desabilitada neste estágio
            <template v-if="preflight.requiresConfirmation">
              · confirmação explícita será obrigatória
            </template>
          </span>
        </section>
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
.devcontainer-hooks p,
.devcontainer-lifecycle h4,
.devcontainer-lifecycle p,
.devcontainer-lifecycle ul {
  margin: 0;
}

.devcontainer-heading p,
.devcontainer-note span,
.devcontainer-hooks span,
.devcontainer-lifecycle p,
.devcontainer-lifecycle li,
.devcontainer-lifecycle-footnote {
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
.devcontainer-hooks svg,
.devcontainer-lifecycle-heading > svg {
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
.devcontainer-hooks,
.devcontainer-lifecycle {
  margin-top: var(--space-5);
}

.devcontainer-message,
.devcontainer-note,
.devcontainer-hooks,
.devcontainer-lifecycle-heading {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.devcontainer-message.is-error {
  color: var(--danger-text);
}

.devcontainer-note div,
.devcontainer-hooks div,
.devcontainer-lifecycle-heading div {
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

.devcontainer-hooks,
.devcontainer-lifecycle {
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}

.devcontainer-lifecycle {
  display: grid;
  gap: var(--space-3);
}

.devcontainer-lifecycle-title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.devcontainer-lifecycle ul {
  padding-left: 20px;
}

.devcontainer-lifecycle-footnote {
  font-size: var(--font-xs);
}

@media (max-width: 760px) {
  .devcontainer-summary,
  .devcontainer-details {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
