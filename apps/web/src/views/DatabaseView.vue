<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleStackIcon,
  InformationCircleIcon,
  PauseIcon,
  PlayIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';
import type {
  DatabaseServiceAction,
  MachineDatabaseService,
  MachineDatabaseServiceDetails,
} from '@dev-dashboard/contracts';

import {
  fetchMachineDatabaseServices,
  fetchMachineDatabaseServiceDetails,
  installMachineDatabaseService,
  runMachineDatabaseServiceAction,
  uninstallMachineDatabaseService,
} from '../api/rails';
import { confirmDialog } from '../stores/app-dialog';

const services = ref<MachineDatabaseService[]>([]);
const loading = ref(true);
const errorMessage = ref('');
const successMessage = ref('');
const lastUpdatedAt = ref<Date | null>(null);
const expandedServiceId = ref<string | null>(null);
const details = ref<Record<string, MachineDatabaseServiceDetails>>({});
const detailsErrors = ref<Record<string, string>>({});
const detailsLoading = ref<string | null>(null);
const pending = ref<{
  serviceId: string;
  action: DatabaseServiceAction | 'install' | 'uninstall';
} | null>(null);
const installedServices = computed(() =>
  services.value.filter((service) => service.installed),
);
const uninstalledServices = computed(() =>
  services.value.filter((service) => !service.installed),
);
const activeServices = computed(() =>
  installedServices.value.filter((service) => service.active),
);

async function loadServices(
  options: { clearSuccess?: boolean } = {},
): Promise<boolean> {
  loading.value = true;
  errorMessage.value = '';
  if (options.clearSuccess) successMessage.value = '';
  try {
    services.value = await fetchMachineDatabaseServices();
    lastUpdatedAt.value = new Date();
    return true;
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível consultar os serviços do sistema.';
    return false;
  } finally {
    loading.value = false;
  }
}

function refreshServices(): void {
  void loadServices({ clearSuccess: true });
}

function serviceDetails(
  serviceId: string,
): MachineDatabaseServiceDetails | undefined {
  return details.value[serviceId];
}

function reachabilityLabel(
  value: MachineDatabaseServiceDetails['reachability'],
) {
  return {
    reachable: 'Porta acessível',
    unreachable: 'Porta indisponível',
    unknown: 'Não testada',
  }[value];
}

async function loadDetails(serviceId: string): Promise<void> {
  detailsLoading.value = serviceId;
  detailsErrors.value = { ...detailsErrors.value, [serviceId]: '' };
  try {
    details.value = {
      ...details.value,
      [serviceId]: await fetchMachineDatabaseServiceDetails(serviceId),
    };
  } catch (error) {
    detailsErrors.value = {
      ...detailsErrors.value,
      [serviceId]:
        error instanceof Error
          ? error.message
          : 'Não foi possível consultar os detalhes do serviço.',
    };
  } finally {
    detailsLoading.value = null;
  }
}

async function toggleDetails(serviceId: string): Promise<void> {
  if (expandedServiceId.value === serviceId) {
    expandedServiceId.value = null;
    return;
  }
  expandedServiceId.value = serviceId;
  if (!serviceDetails(serviceId)) await loadDetails(serviceId);
}

function actionLabel(action: DatabaseServiceAction | 'install' | 'uninstall') {
  return {
    start: 'iniciado',
    stop: 'parado',
    restart: 'reiniciado',
    install: 'instalado',
    uninstall: 'desinstalado',
  }[action];
}

async function runAction(
  service: MachineDatabaseService,
  action: DatabaseServiceAction,
): Promise<void> {
  if (!service.installed || pending.value) return;
  if (action === 'stop' || action === 'restart') {
    const actionLabel = action === 'stop' ? 'parar' : 'reiniciar';
    const confirmed = await confirmDialog({
      title: `${action === 'stop' ? 'Parar' : 'Reiniciar'} ${service.label}?`,
      message: `O serviço ${service.label} será ${actionLabel}. Aplicações que dependem dele podem ficar indisponíveis durante a operação.`,
      confirmLabel: action === 'stop' ? 'Parar serviço' : 'Reiniciar serviço',
      tone: 'warning',
    });
    if (!confirmed) return;
  }
  pending.value = { serviceId: service.id, action };
  errorMessage.value = '';
  successMessage.value = '';
  try {
    await runMachineDatabaseServiceAction(service.id, action);
    const refreshed = await loadServices();
    if (refreshed) {
      successMessage.value = `${service.label} ${actionLabel(action)} com sucesso.`;
      details.value = {};
    } else if (!errorMessage.value) {
      errorMessage.value = `${service.label} foi ${actionLabel(action)}, mas não foi possível atualizar o status.`;
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível alterar o serviço do sistema.';
  } finally {
    pending.value = null;
  }
}

function isPending(
  service: MachineDatabaseService,
  action: DatabaseServiceAction | 'install' | 'uninstall',
) {
  return (
    pending.value?.serviceId === service.id && pending.value?.action === action
  );
}

async function installService(service: MachineDatabaseService): Promise<void> {
  if (service.installed || pending.value) return;
  const confirmed = await confirmDialog({
    title: `Instalar ${service.label}?`,
    message: `A instalação de ${service.label} altera os pacotes do sistema e pode solicitar sua senha.`,
    confirmLabel: 'Instalar serviço',
    tone: 'warning',
  });
  if (!confirmed) return;
  pending.value = { serviceId: service.id, action: 'install' };
  errorMessage.value = '';
  successMessage.value = '';
  try {
    await installMachineDatabaseService(service.id);
    const refreshed = await loadServices();
    if (refreshed) {
      successMessage.value = `${service.label} instalado com sucesso.`;
      details.value = {};
    } else if (!errorMessage.value) {
      errorMessage.value = `${service.label} foi instalado, mas não foi possível atualizar o status.`;
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível instalar o serviço do sistema.';
  } finally {
    pending.value = null;
  }
}

async function uninstallService(
  service: MachineDatabaseService,
): Promise<void> {
  if (!service.installed || pending.value) return;
  const confirmed = await confirmDialog({
    title: `Desinstalar ${service.label}?`,
    message: `O pacote de ${service.label} será removido do sistema. Os dados do banco podem permanecer no disco e o serviço ficará indisponível.`,
    confirmLabel: 'Desinstalar serviço',
    tone: 'danger',
  });
  if (!confirmed) return;
  pending.value = { serviceId: service.id, action: 'uninstall' };
  errorMessage.value = '';
  successMessage.value = '';
  try {
    await uninstallMachineDatabaseService(service.id);
    const refreshed = await loadServices();
    if (refreshed) {
      successMessage.value = `${service.label} desinstalado com sucesso.`;
      details.value = {};
    } else if (!errorMessage.value) {
      errorMessage.value = `${service.label} foi desinstalado, mas não foi possível atualizar o status.`;
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível desinstalar o serviço do sistema.';
  } finally {
    pending.value = null;
  }
}

onMounted(() => void loadServices());
</script>

<template>
  <section
    class="content database-machine-page"
    aria-labelledby="database-page-title"
    :aria-busy="loading"
  >
    <header class="database-machine-header">
      <div>
        <span class="database-machine-eyebrow">Serviços da máquina</span>
        <h1 id="database-page-title">Banco de dados</h1>
        <p>
          Gerencie os bancos instalados no sistema, independentemente do
          workspace.
        </p>
      </div>
      <button
        type="button"
        class="database-machine-refresh"
        :disabled="loading"
        @click="refreshServices"
      >
        <ArrowPathIcon :class="{ 'is-spinning': loading }" aria-hidden="true" />
        {{ loading ? 'Atualizando…' : 'Atualizar' }}
      </button>
    </header>

    <p v-if="successMessage" class="database-machine-success" role="status">
      {{ successMessage }}
      <span v-if="lastUpdatedAt">
        Status atualizado às
        {{
          lastUpdatedAt.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })
        }}.
      </span>
    </p>
    <p v-if="errorMessage" class="activity-error" role="alert">
      {{ errorMessage }}
    </p>
    <div
      v-if="loading && services.length === 0"
      class="activity-empty"
      role="status"
    >
      Consultando os serviços do sistema…
    </div>
    <template v-else>
      <div class="database-machine-overview" aria-label="Resumo dos serviços">
        <div class="database-machine-overview-item">
          <span>Instalados</span>
          <strong>{{ installedServices.length }}</strong>
        </div>
        <div class="database-machine-overview-item">
          <span>Em execução</span>
          <strong class="is-success">{{ activeServices.length }}</strong>
        </div>
        <div class="database-machine-overview-item">
          <span>Disponíveis</span>
          <strong>{{ uninstalledServices.length }}</strong>
        </div>
      </div>

      <div v-if="installedServices.length" class="database-machine-section">
        <div class="database-machine-section-heading">
          <div>
            <h2>Serviços instalados</h2>
            <p>Gerencie os serviços disponíveis nesta máquina.</p>
          </div>
          <span class="database-machine-count"
            >{{ installedServices.length }} serviços</span
          >
        </div>
      </div>
      <div v-if="installedServices.length" class="database-machine-list">
        <article
          v-for="service in installedServices"
          :key="service.id"
          class="database-machine-card"
        >
          <div class="database-machine-card-icon">
            <CircleStackIcon aria-hidden="true" />
          </div>
          <div class="database-machine-card-copy">
            <div class="database-machine-title-line">
              <h2>{{ service.label }}</h2>
              <span
                :class="['database-machine-status', { active: service.active }]"
              >
                {{ service.active ? 'Em execução' : 'Parado' }}
              </span>
            </div>
            <div class="database-machine-meta">
              <code>{{ service.unit }}</code>
              <span>systemd</span>
            </div>
          </div>
          <div v-if="service.installed" class="database-machine-actions">
            <button
              v-if="!service.active"
              type="button"
              :disabled="pending !== null"
              @click="runAction(service, 'start')"
            >
              <PlayIcon aria-hidden="true" />
              {{ isPending(service, 'start') ? 'Iniciando…' : 'Iniciar' }}
            </button>
            <template v-else>
              <button
                type="button"
                :disabled="pending !== null"
                @click="runAction(service, 'restart')"
              >
                <ArrowPathIcon aria-hidden="true" />
                {{
                  isPending(service, 'restart') ? 'Reiniciando…' : 'Reiniciar'
                }}
              </button>
              <button
                type="button"
                class="danger"
                :disabled="pending !== null"
                @click="runAction(service, 'stop')"
              >
                <PauseIcon aria-hidden="true" />
                {{ isPending(service, 'stop') ? 'Parando…' : 'Parar' }}
              </button>
            </template>
            <button
              type="button"
              class="database-machine-details-toggle"
              :aria-expanded="expandedServiceId === service.id"
              :aria-controls="`database-details-${service.id}`"
              @click="toggleDetails(service.id)"
            >
              <InformationCircleIcon aria-hidden="true" />
              {{
                expandedServiceId === service.id
                  ? 'Ocultar detalhes'
                  : 'Ver detalhes'
              }}
              <ChevronUpIcon
                v-if="expandedServiceId === service.id"
                aria-hidden="true"
              />
              <ChevronDownIcon v-else aria-hidden="true" />
            </button>
            <button
              type="button"
              class="danger"
              :disabled="pending !== null"
              @click="uninstallService(service)"
            >
              <TrashIcon aria-hidden="true" />
              {{
                isPending(service, 'uninstall')
                  ? 'Desinstalando…'
                  : 'Desinstalar'
              }}
            </button>
          </div>
          <div
            v-if="expandedServiceId === service.id"
            :id="`database-details-${service.id}`"
            class="database-machine-details"
          >
            <div v-if="detailsLoading === service.id" role="status">
              Consultando detalhes…
            </div>
            <template v-else-if="serviceDetails(service.id)">
              <div class="database-machine-details-grid">
                <div>
                  <span>Porta</span>
                  <strong>{{ serviceDetails(service.id)?.port ?? '—' }}</strong>
                </div>
                <div>
                  <span>PID</span>
                  <strong>{{ serviceDetails(service.id)?.pid ?? '—' }}</strong>
                </div>
                <div>
                  <span>Versão</span>
                  <strong>{{
                    serviceDetails(service.id)?.version ?? '—'
                  }}</strong>
                </div>
                <div>
                  <span>Conexão</span>
                  <strong
                    :class="`database-machine-reachability-${serviceDetails(service.id)?.reachability}`"
                  >
                    {{
                      reachabilityLabel(
                        serviceDetails(service.id)?.reachability ?? 'unknown',
                      )
                    }}
                  </strong>
                </div>
              </div>
              <div class="database-machine-details-toolbar">
                <span v-if="serviceDetails(service.id)?.startedAt">
                  Iniciado em {{ serviceDetails(service.id)?.startedAt }}
                </span>
                <button
                  type="button"
                  :disabled="detailsLoading !== null"
                  @click="loadDetails(service.id)"
                >
                  <ArrowPathIcon aria-hidden="true" />
                  {{
                    detailsLoading === service.id
                      ? 'Testando…'
                      : 'Testar conexão'
                  }}
                </button>
              </div>
              <p
                v-if="detailsErrors[service.id]"
                class="database-machine-details-error"
                role="alert"
              >
                {{ detailsErrors[service.id] }}
              </p>
              <div class="database-machine-log">
                <div class="database-machine-log-heading">
                  <span>Logs recentes</span>
                  <small>últimas 40 linhas</small>
                </div>
                <pre v-if="serviceDetails(service.id)?.logs.length">{{
                  serviceDetails(service.id)?.logs.join('\n')
                }}</pre>
                <p v-else>Não há logs recentes disponíveis.</p>
              </div>
            </template>
          </div>
        </article>
      </div>

      <div
        v-if="uninstalledServices.length"
        class="database-machine-section database-machine-section-available"
      >
        <div class="database-machine-section-heading">
          <div>
            <h2>Disponíveis para instalar</h2>
            <p>Instale um serviço quando precisar dele nesta máquina.</p>
          </div>
          <span class="database-machine-count"
            >{{ uninstalledServices.length }} disponíveis</span
          >
        </div>
      </div>
      <div v-if="uninstalledServices.length" class="database-machine-list">
        <article
          v-for="service in uninstalledServices"
          :key="service.id"
          class="database-machine-card database-machine-card-uninstalled"
        >
          <div class="database-machine-card-icon">
            <CircleStackIcon aria-hidden="true" />
          </div>
          <div class="database-machine-card-copy">
            <h2>{{ service.label }}</h2>
            <div class="database-machine-meta">
              <code>{{ service.unit }}</code>
              <span>Não instalado</span>
            </div>
          </div>
          <div class="database-machine-actions">
            <button
              type="button"
              :disabled="pending !== null"
              @click="installService(service)"
            >
              <PlayIcon aria-hidden="true" />
              {{ isPending(service, 'install') ? 'Instalando…' : 'Instalar' }}
            </button>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>

<style scoped>
.database-machine-page {
  padding: 28px;
}
.database-machine-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 24px;
}
.database-machine-eyebrow {
  color: var(--accent-strong);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.database-machine-header h1 {
  margin: 6px 0 4px;
}
.database-machine-header p {
  margin: 0;
  color: var(--muted-text);
}
.database-machine-refresh,
.database-machine-actions button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.database-machine-refresh svg,
.database-machine-actions svg {
  width: 16px;
  height: 16px;
}
.database-machine-refresh .is-spinning {
  animation: database-machine-spin 900ms linear infinite;
}
.database-machine-success {
  margin: -6px 0 0;
  padding: 10px 12px;
  border: 1px solid var(--success-text);
  border-radius: 8px;
  color: var(--success-text);
  background: color-mix(in srgb, var(--success-text) 10%, transparent);
  font-size: 11px;
}
.database-machine-success span {
  margin-left: 6px;
  color: var(--muted-text);
}
.database-machine-list {
  display: grid;
  gap: 12px;
  max-width: 1120px;
}
.database-machine-overview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  max-width: 1120px;
  margin: 28px 0 30px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--card-bg);
  overflow: hidden;
}
.database-machine-overview-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-right: 1px solid var(--border-color);
}
.database-machine-overview-item:last-child {
  border-right: 0;
}
.database-machine-overview-item span {
  color: var(--muted-text);
  font-size: 12px;
  font-weight: 600;
}
.database-machine-overview-item strong {
  color: var(--text);
  font-size: 22px;
  line-height: 1;
}
.database-machine-overview-item strong.is-success {
  color: var(--success-text);
}
.database-machine-section {
  max-width: 1120px;
  margin-bottom: 10px;
}
.database-machine-section-available {
  margin-top: 34px;
}
.database-machine-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.database-machine-section-heading h2 {
  margin: 0;
  color: var(--text);
  font-size: 15px;
}
.database-machine-section-heading p {
  margin: 4px 0 0;
  color: var(--muted-text);
  font-size: 12px;
}
.database-machine-count {
  flex: 0 0 auto;
  color: var(--muted-text);
  font-size: 12px;
}
.database-machine-card {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  min-height: 78px;
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--card-bg);
}
.database-machine-card-uninstalled {
  background: color-mix(in srgb, var(--card-bg) 72%, var(--accent-soft));
}
.database-machine-card-icon {
  display: grid;
  place-items: center;
  flex: 0 0 42px;
  height: 42px;
  border-radius: 10px;
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.database-machine-card-icon svg {
  width: 22px;
  height: 22px;
}
.database-machine-card-copy {
  min-width: 0;
  flex: 1;
}
.database-machine-card-copy h2 {
  margin: 0;
  font-size: 15px;
}
.database-machine-title-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.database-machine-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 5px;
  color: var(--muted-text);
  font-size: 12px;
}
.database-machine-meta span {
  padding-left: 8px;
  border-left: 1px solid var(--border-color);
}
.database-machine-status {
  color: var(--muted-text);
  font-size: 12px;
}
.database-machine-status::before {
  content: '';
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--muted-text);
}
.database-machine-status.active {
  color: var(--success-text);
}
.database-machine-status.active::before {
  background: var(--success-text);
}
.database-machine-title-line .database-machine-status {
  padding: 3px 8px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  font-size: 11px;
  line-height: 1;
}
.database-machine-title-line .database-machine-status::before {
  width: 6px;
  height: 6px;
}
.database-machine-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.database-machine-details-toggle svg,
.database-machine-details-toolbar svg {
  width: 15px;
  height: 15px;
}
.database-machine-details-toggle svg:last-child {
  margin-left: -2px;
}
.database-machine-details {
  flex: 0 0 100%;
  margin: 2px 0 0 58px;
  padding: 14px 0 0;
  border-top: 1px solid var(--border-color);
}
.database-machine-details-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.database-machine-details-grid div {
  display: grid;
  gap: 4px;
}
.database-machine-details-grid span,
.database-machine-log-heading small {
  color: var(--muted-text);
  font-size: 11px;
}
.database-machine-details-grid strong {
  overflow: hidden;
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.database-machine-reachability-reachable {
  color: var(--success-text) !important;
}
.database-machine-reachability-unreachable {
  color: var(--error-text) !important;
}
.database-machine-details-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  color: var(--muted-text);
  font-size: 11px;
}
.database-machine-details-toolbar button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.database-machine-details-error {
  margin: 10px 0 0;
  color: var(--error-text);
  font-size: 11px;
}
.database-machine-log {
  margin-top: 14px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--surface-2);
}
.database-machine-log-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text);
  font-size: 11px;
  font-weight: 600;
}
.database-machine-log pre {
  max-height: 220px;
  margin: 0;
  overflow: auto;
  padding: 10px;
  color: var(--text-muted);
  font:
    11px/1.5 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
  white-space: pre-wrap;
  word-break: break-word;
}
.database-machine-log > p {
  margin: 0;
  padding: 12px 10px;
  color: var(--muted-text);
  font-size: 11px;
}
.database-machine-actions .danger {
  color: var(--error-text);
}
@keyframes database-machine-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 680px) {
  .database-machine-header,
  .database-machine-card {
    align-items: stretch;
    flex-direction: column;
  }
  .database-machine-actions {
    justify-content: flex-start;
  }
  .database-machine-details {
    margin-left: 0;
  }
  .database-machine-details-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .database-machine-overview {
    grid-template-columns: 1fr;
  }
  .database-machine-overview-item {
    border-right: 0;
    border-bottom: 1px solid var(--border-color);
  }
  .database-machine-overview-item:last-child {
    border-bottom: 0;
  }
  .database-machine-section-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }
}
</style>
