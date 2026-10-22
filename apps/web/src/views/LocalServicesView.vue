<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  applyLocalServiceAction,
  fetchLocalServiceLogs,
  fetchLocalServicePlan,
  fetchLocalServices,
  type LocalService,
  type LocalServiceAction,
  type LocalServiceLogs,
} from '../api/local-services';
import { confirmDialog } from '../stores/app-dialog';

const services = ref<LocalService[]>([]);
const loading = ref(false);
const pending = ref(false);
const error = ref('');
// Errors from start/stop/restart must survive automatic status refreshes.
const actionError = ref('');
const notice = ref('');
const logs = ref<LocalServiceLogs | null>(null);
const showingLogs = ref(false);
let poll: ReturnType<typeof setInterval> | undefined;
let requestId = 0;

const service = computed(() => services.value[0]);
const stateLabel = computed(() => {
  switch (service.value?.state) {
    case 'running':
      return 'Executando';
    case 'stopped':
      return 'Parado';
    case 'failed':
      return 'Falhou';
    default:
      return 'Desconhecido';
  }
});
const healthLabel = computed(() => {
  switch (service.value?.readiness) {
    case 'ready':
      return 'Respondendo';
    case 'unhealthy':
      return 'Sem resposta em /ready';
    default:
      return 'Não verificado';
  }
});

async function refresh(): Promise<void> {
  if (pending.value) return;
  const current = ++requestId;
  loading.value = true;
  try {
    const next = await fetchLocalServices();
    if (current !== requestId) return;
    services.value = next;
    error.value = '';
  } catch (cause) {
    if (current === requestId)
      error.value =
        cause instanceof Error ? cause.message : 'Falha ao consultar serviços.';
  } finally {
    if (current === requestId) loading.value = false;
  }
}
async function operate(action: LocalServiceAction): Promise<void> {
  if (pending.value || !service.value?.controllable) return;
  pending.value = true;
  notice.value = '';
  actionError.value = '';
  try {
    const plan = await fetchLocalServicePlan(action);
    const verbs = { start: 'Iniciar', stop: 'Parar', restart: 'Reiniciar' };
    const confirmed = await confirmDialog({
      title: verbs[action] + ' Home Music?',
      message:
        'Ação exclusiva do ciclo de vida de home-music.service. Não executa deploy, build ou migração. Estado observado: ' +
        plan.expectedState +
        '.',
      confirmLabel: verbs[action],
      tone: action === 'stop' ? 'danger' : 'warning',
    });
    if (!confirmed) return;
    const outcome = await applyLocalServiceAction(plan);
    notice.value = outcome.message;
    if (outcome.status === 'unverified') actionError.value = outcome.message;
  } catch (cause) {
    actionError.value =
      cause instanceof Error
        ? cause.message
        : 'Não foi possível controlar o serviço.';
  } finally {
    pending.value = false;
    await refresh();
  }
}
async function loadLogs(): Promise<void> {
  showingLogs.value = true;
  actionError.value = '';
  try {
    logs.value = await fetchLocalServiceLogs();
  } catch (cause) {
    actionError.value =
      cause instanceof Error ? cause.message : 'Logs indisponíveis.';
  }
}
onMounted(() => {
  void refresh();
  poll = setInterval(() => {
    void refresh();
  }, 10_000);
});
onBeforeUnmount(() => {
  if (poll) clearInterval(poll);
  requestId += 1;
});
</script>

<template>
  <section class="content local-services-page">
    <header class="local-services-header">
      <div>
        <h1>Serviços locais</h1>
        <p>Gerencie o ciclo de vida sem executar deploy ou atualizar código.</p>
      </div>
      <button
        type="button"
        class="secondary-button"
        :disabled="pending || loading"
        @click="refresh"
      >
        {{ loading ? 'Consultando…' : 'Atualizar estado' }}
      </button>
    </header>

    <div v-if="actionError || error" role="alert" class="local-service-alert">
      {{ actionError || error }}
    </div>
    <div v-if="notice && !actionError && !error" role="status" class="local-service-notice">
      {{ notice }}
    </div>
    <article v-if="service" class="local-service-card" :aria-busy="pending">
      <header class="local-service-title">
        <div>
          <h2>{{ service.name }}</h2>
          <code>{{ service.unit }} · {{ service.scope }}</code>
        </div>
        <span class="local-service-state" :data-state="service.state">{{
          stateLabel
        }}</span>
      </header>

      <div class="local-service-facts">
        <p>
          <span>Estado</span><strong>{{ stateLabel }}</strong>
        </p>
        <p>
          <span>Saúde HTTP</span><strong>{{ healthLabel }}</strong>
        </p>
        <p>
          <span>Inicialização automática</span
          ><strong>{{ service.bootState }}</strong>
        </p>
        <p>
          <span>Última observação</span
          ><strong>{{
            new Date(service.observedAt).toLocaleTimeString()
          }}</strong>
        </p>
      </div>

      <div class="local-service-actions">
        <button
          class="primary-button"
          type="button"
          :disabled="
            pending || !service.controllable || !['stopped', 'failed'].includes(service.state)
          "
          @click="operate('start')"
        >
          Iniciar
        </button>
        <button
          class="secondary-button"
          type="button"
          :disabled="
            pending || !service.controllable || service.state !== 'running'
          "
          @click="operate('stop')"
        >
          Parar
        </button>
        <button
          class="secondary-button"
          type="button"
          :disabled="
            pending || !service.controllable || service.state !== 'running'
          "
          @click="operate('restart')"
        >
          Reiniciar
        </button>
        <button
          class="secondary-button"
          type="button"
          :disabled="pending"
          @click="loadLogs"
        >
          Consultar logs
        </button>
      </div>
      <p v-if="service.reason" class="local-service-help">
        {{ service.reason }}
      </p>
      <p class="local-service-help">
        Parar não desativa a inicialização no próximo boot. Processo ativo não
        garante saúde HTTP.
      </p>
      <section v-if="showingLogs" class="local-service-logs">
        <h3>Logs recentes · Home Music</h3>
        <p v-if="logs?.diagnostic">{{ logs.diagnostic }}</p>
        <pre v-if="logs?.content">{{ logs.content }}</pre>
        <p v-else-if="logs">Nenhum log acessível.</p>
        <p v-else>Carregando logs…</p>
      </section>
    </article>
    <p v-else-if="loading">Consultando serviços locais…</p>
    <p v-else>Serviço indisponível.</p>
  </section>
</template>

<style scoped>
.local-services-page {
  max-width: 1050px;
  width: 100%;
  padding: 24px;
  margin: 0 auto;
}
.local-services-header,
.local-service-title {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
}
.local-services-header {
  margin-bottom: 24px;
}
.local-services-header p,
.local-service-help {
  opacity: 0.75;
}
.local-service-card {
  border: 1px solid var(--border-color, #7775);
  border-radius: 16px;
  padding: 24px;
}
.local-service-title h2 {
  margin: 0 0 8px;
}
.local-service-title code {
  font-size: 0.8rem;
}
.local-service-state {
  border-radius: 12px;
  padding: 6px 12px;
  border: 1px solid currentColor;
}
.local-service-state[data-state='running'] {
  color: #22a06b;
}
.local-service-state[data-state='failed'] {
  color: #d14c4c;
}
.local-service-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(195px, 1fr));
  gap: 10px;
  margin: 22px 0;
}
.local-service-facts p {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 8px;
  background: var(--surface-muted, #8881);
}
.local-service-facts span {
  font-size: 0.8rem;
  opacity: 0.8;
}
.local-service-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.local-service-actions button {
  min-width: 110px;
}
.local-service-alert {
  color: #cf4646;
  padding: 12px;
}
.local-service-notice {
  padding: 12px;
}
.local-service-logs {
  margin-top: 22px;
}
.local-service-logs pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 330px;
  overflow-y: auto;
  font-size: 0.78rem;
}
@media (max-width: 600px) {
  .local-services-header,
  .local-service-title {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
