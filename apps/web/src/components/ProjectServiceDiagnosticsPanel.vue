<script setup lang="ts">
import type {
  ProjectServiceBindingView,
  ServiceDiagnosticsSnapshot,
} from '@dev-dashboard/contracts';
import { computed, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import {
  fetchProjectServiceBindings,
  fetchServiceDiagnostics,
} from '../api/service-diagnostics';

const props = defineProps<{
  projectId: string;
  environmentInstanceId?: string | undefined;
}>();
const route = useRoute();
const bindings = ref<ProjectServiceBindingView[]>([]);
const loading = ref(false);
const loadingLogs = ref(false);
const partial = ref(false);
const selectedRef = ref('');
const snapshot = ref<ServiceDiagnosticsSnapshot | null>(null);
const error = ref('');
let generation = 0;
let readGeneration = 0;
const scopedEnvironment = computed(
  () => props.environmentInstanceId ?? 'environment:primary:' + props.projectId,
);

const visible = computed(() =>
  bindings.value.filter(
    (b) => b.enabled && b.environmentInstanceId === scopedEnvironment.value,
  ),
);

watch(
  () => [props.projectId, props.environmentInstanceId],
  () => {
    void loadBindings();
  },
  { immediate: true },
);

async function loadBindings(): Promise<void> {
  const current = ++generation;
  readGeneration++;
  loading.value = true;
  loadingLogs.value = false;
  bindings.value = [];
  selectedRef.value = '';
  snapshot.value = null;
  error.value = '';
  try {
    const response = await fetchProjectServiceBindings(props.projectId);
    if (current !== generation) return;
    bindings.value = response.bindings;
    partial.value = response.partial;
    const requested =
      typeof route.query.serviceRef === 'string' ? route.query.serviceRef : '';
    const scoped = response.bindings.filter(
      (b) => b.enabled && b.environmentInstanceId === scopedEnvironment.value,
    );
    const requestedBinding = scoped.find((b) => b.serviceRef === requested);
    // Never silently switch an Activity deep link to a different unit.
    selectedRef.value = requested
      ? (requestedBinding?.serviceRef ?? '')
      : (scoped[0]?.serviceRef ?? '');
    if (requested && !requestedBinding) {
      error.value = 'Serviço do link não está vinculado a este ambiente.';
    }
  } catch {
    if (current === generation)
      error.value = 'Não foi possível consultar os vínculos de serviço.';
  } finally {
    if (current === generation) loading.value = false;
  }
}

async function loadDiagnostics(): Promise<void> {
  if (!selectedRef.value || loadingLogs.value) return;
  const current = generation;
  const read = ++readGeneration;
  const serviceRef = selectedRef.value;
  loadingLogs.value = true;
  snapshot.value = null;
  error.value = '';
  try {
    const response = await fetchServiceDiagnostics(
      props.projectId,
      serviceRef,
      props.environmentInstanceId,
    );
    if (
      generation === current &&
      read === readGeneration &&
      selectedRef.value === serviceRef
    ) {
      snapshot.value = response;
    }
  } catch {
    if (generation === current && read === readGeneration)
      error.value =
        'Leitura indisponível. Atualize os vínculos e tente novamente.';
  } finally {
    if (generation === current && read === readGeneration)
      loadingLogs.value = false;
  }
}

// Activity deep links can change the resource on an already-mounted Doctor tab.
watch(
  () => route.query.serviceRef,
  (value) => {
    if (typeof value !== 'string' || !value || selectedRef.value === value)
      return;
    const exists = visible.value.some(
      (binding) => binding.serviceRef === value,
    );
    selectedRef.value = exists ? value : '';
    changeSelection();
    if (!exists)
      error.value = 'Serviço do link não está vinculado a este ambiente.';
  },
);

function changeSelection(): void {
  readGeneration++;
  loadingLogs.value = false;
  snapshot.value = null;
  error.value = '';
}

function providerRoute(provider: string) {
  // Neither systemd nor unmanaged Docker has a Dashboard lifecycle owner.
  if (provider !== 'compose' && provider !== 'managed-process') return null;
  return {
    name: provider === 'compose' ? 'project-compose' : 'project-server',
    params: { projectId: props.projectId },
    query: props.environmentInstanceId
      ? { environmentInstanceId: props.environmentInstanceId }
      : {},
  };
}
</script>

<template>
  <section
    class="service-diagnostics"
    aria-labelledby="service-diagnostics-title"
  >
    <header class="service-diagnostics-heading">
      <div>
        <h3 id="service-diagnostics-title">
          Diagnóstico de serviços vinculados
        </h3>
        <p>
          Consulta sob demanda dos logs existentes e dos eventos do Activity.
          Nenhum serviço é alterado.
        </p>
      </div>
      <button type="button" :disabled="loading" @click="loadBindings">
        Atualizar vínculos
      </button>
    </header>
    <p v-if="loading" role="status">Carregando vínculos…</p>
    <p v-else-if="visible.length === 0">
      Nenhum serviço vinculado ao ambiente. O catálogo e a gestão de vínculos
      pertencem ao painel de Serviços.
    </p>
    <template v-else>
      <p v-if="partial" role="status">
        Inventário parcial: serviços ausentes podem não ter sido observados.
      </p>
      <div class="service-diagnostics-actions">
        <label for="diagnostic-service">Serviço</label>
        <select
          id="diagnostic-service"
          v-model="selectedRef"
          @change="changeSelection"
        >
          <option
            v-for="item in visible"
            :key="item.id"
            :value="item.serviceRef"
          >
            {{ item.role ?? item.serviceRef }} · {{ item.relation }}
          </option>
        </select>
        <button
          type="button"
          :disabled="loadingLogs || !selectedRef"
          @click="loadDiagnostics"
        >
          {{ loadingLogs ? 'Consultando…' : 'Consultar diagnóstico e logs' }}
        </button>
      </div>
    </template>
    <p v-if="error" role="alert">{{ error }}</p>
    <article
      v-if="snapshot"
      class="service-diagnostics-result"
      aria-live="polite"
    >
      <div class="service-diagnostics-summary">
        <strong>{{ snapshot.serviceRef }}</strong>
        <span
          >{{ snapshot.provider }} · {{ snapshot.state }} · readiness
          {{ snapshot.readiness }}</span
        >
        <span>Logs: {{ snapshot.status }} · {{ snapshot.source }}</span>
        <span v-if="snapshot.observedAt">
          Última observação:
          <time :datetime="snapshot.observedAt">{{
            new Date(snapshot.observedAt).toLocaleString('pt-BR')
          }}</time>
          {{ snapshot.stale ? '(desatualizada)' : '' }}
        </span>
        <span v-if="snapshot.partial"
          >Evidência parcial; estado não confirmado.</span
        >
        <span v-if="snapshot.masked">Dados sensíveis mascarados.</span>
        <span v-if="snapshot.truncated"
          >Logs truncados para proteger a resposta.</span
        >
      </div>
      <p v-if="snapshot.diagnostic" role="status">{{ snapshot.diagnostic }}</p>
      <pre v-if="snapshot.content" class="service-diagnostics-log">{{
        snapshot.content
      }}</pre>
      <p v-else>
        Nenhuma saída exibível. Uma falha de permissão não significa log vazio.
      </p>
      <div class="service-diagnostics-links">
        <RouterLink
          v-if="providerRoute(snapshot.provider)"
          :to="providerRoute(snapshot.provider)!"
          >Abrir ferramenta do provider</RouterLink
        >
        <span v-else
          >Provider apenas observável; controle não disponível nesta tela.</span
        >
        <RouterLink :to="{ name: 'activity', query: { projectId } }"
          >Ver Activity e Jobs</RouterLink
        >
      </div>
      <div
        v-if="snapshot.events.length || snapshot.jobs.length"
        class="service-diagnostics-summary"
      >
        <strong>Atividade relacionada</strong>
        <ul>
          <li v-for="event in snapshot.events" :key="event.id">
            {{ event.type }} · {{ event.status ?? 'sem status' }} ·
            {{ event.occurredAt }}
          </li>
          <li v-for="job in snapshot.jobs" :key="job.id">
            Job {{ job.action }} · {{ job.status }}
          </li>
        </ul>
      </div>
    </article>
  </section>
</template>

<style scoped>
.service-diagnostics {
  margin-block-start: 1.5rem;
  padding: 1.25rem;
  border: 1px solid var(--border-color, #64748b);
  border-radius: 0.75rem;
}
.service-diagnostics-heading,
.service-diagnostics-actions,
.service-diagnostics-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}
.service-diagnostics-heading {
  justify-content: space-between;
}
.service-diagnostics-heading h3 {
  margin: 0;
}
.service-diagnostics-heading p {
  margin: 0.35rem 0;
}
.service-diagnostics-actions {
  margin-block: 1rem;
}
.service-diagnostics-actions select {
  min-width: min(100%, 22rem);
  padding: 0.4rem;
}
.service-diagnostics-result {
  display: grid;
  gap: 0.75rem;
}
.service-diagnostics-summary {
  display: grid;
  gap: 0.25rem;
  overflow-wrap: anywhere;
}
.service-diagnostics-log {
  padding: 1rem;
  max-height: 22rem;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--surface-muted, rgba(100, 116, 139, 0.12));
  border-radius: 0.5rem;
}
</style>
