<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  ArrowPathIcon,
  CircleStackIcon,
  PauseIcon,
  PlayIcon,
} from '@heroicons/vue/24/outline';
import type {
  DatabaseServiceAction,
  MachineDatabaseService,
} from '@dev-dashboard/contracts';

import {
  fetchMachineDatabaseServices,
  installMachineDatabaseService,
  runMachineDatabaseServiceAction,
} from '../api/rails';
import { confirmDialog } from '../stores/app-dialog';

const services = ref<MachineDatabaseService[]>([]);
const loading = ref(true);
const errorMessage = ref('');
const pending = ref<{
  serviceId: string;
  action: DatabaseServiceAction | 'install';
} | null>(null);
const installedServices = computed(() =>
  services.value.filter((service) => service.installed),
);
const uninstalledServices = computed(() =>
  services.value.filter((service) => !service.installed),
);

async function loadServices(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    services.value = await fetchMachineDatabaseServices();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível consultar os serviços do sistema.';
  } finally {
    loading.value = false;
  }
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
  try {
    await runMachineDatabaseServiceAction(service.id, action);
    await loadServices();
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
  action: DatabaseServiceAction | 'install',
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
  try {
    await installMachineDatabaseService(service.id);
    await loadServices();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível instalar o serviço do sistema.';
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
        @click="loadServices"
      >
        <ArrowPathIcon :class="{ 'is-spinning': loading }" aria-hidden="true" />
        Atualizar
      </button>
    </header>

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
      <h2
        v-if="installedServices.length"
        class="database-machine-section-title"
      >
        Instalados
      </h2>
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
            <h2>{{ service.label }}</h2>
            <p>
              <code>{{ service.unit }}</code>
            </p>
            <span
              :class="['database-machine-status', { active: service.active }]"
            >
              {{
                !service.installed
                  ? 'Não instalado'
                  : service.active
                    ? 'Em execução'
                    : 'Parado'
              }}
            </span>
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
          </div>
        </article>
      </div>

      <h2
        v-if="uninstalledServices.length"
        class="database-machine-section-title"
      >
        Não instalados
      </h2>
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
            <p>
              <code>{{ service.unit }}</code>
            </p>
            <span class="database-machine-status">Não instalado</span>
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
.database-machine-list {
  display: grid;
  gap: 12px;
  max-width: 900px;
}
.database-machine-section-title {
  max-width: 900px;
  margin: 20px 0 10px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
}
.database-machine-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--card-bg);
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
  margin: 0 0 3px;
  font-size: 17px;
}
.database-machine-card-copy p {
  margin: 0 0 7px;
  color: var(--muted-text);
  font-size: 12px;
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
.database-machine-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
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
}
</style>
