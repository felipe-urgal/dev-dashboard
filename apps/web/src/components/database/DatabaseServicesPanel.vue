<script setup lang="ts">
import { computed } from 'vue';
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

type PendingDatabaseServiceAction = {
  serviceId: string;
  action: DatabaseServiceAction | 'install' | 'uninstall';
} | null;

const props = defineProps<{
  services: MachineDatabaseService[];
  loading: boolean;
  errorMessage: string;
  successMessage: string;
  lastUpdatedAt: Date | null;
  expandedServiceId: string | null;
  details: Record<string, MachineDatabaseServiceDetails>;
  detailsErrors: Record<string, string>;
  detailsLoading: string | null;
  pending: PendingDatabaseServiceAction;
}>();

const emit = defineEmits<{
  refresh: [];
  'run-action': [
    service: MachineDatabaseService,
    action: DatabaseServiceAction,
  ];
  'toggle-details': [serviceId: string];
  'reload-details': [serviceId: string];
  install: [service: MachineDatabaseService];
  uninstall: [service: MachineDatabaseService];
}>();

const installedServices = computed(() =>
  props.services.filter((service) => service.installed),
);
const uninstalledServices = computed(() =>
  props.services.filter((service) => !service.installed),
);
const activeServices = computed(() =>
  installedServices.value.filter((service) => service.active),
);

function serviceDetails(
  serviceId: string,
): MachineDatabaseServiceDetails | undefined {
  return props.details[serviceId];
}

function reachabilityLabel(
  value: MachineDatabaseServiceDetails['reachability'],
): string {
  return {
    reachable: 'Porta acessível',
    unreachable: 'Porta indisponível',
    unknown: 'Não testada',
  }[value];
}

function isPending(
  service: MachineDatabaseService,
  action: DatabaseServiceAction | 'install' | 'uninstall',
): boolean {
  return (
    props.pending?.serviceId === service.id && props.pending.action === action
  );
}
</script>

<template>
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
      @click="emit('refresh')"
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
          <h2>Serviços da máquina</h2>
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
        :data-service-id="service.id"
        :aria-busy="pending?.serviceId === service.id"
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
        <div class="database-machine-actions">
          <button
            v-if="!service.active"
            type="button"
            :disabled="pending !== null"
            @click="emit('run-action', service, 'start')"
          >
            <PlayIcon aria-hidden="true" />
            {{ isPending(service, 'start') ? 'Iniciando…' : 'Iniciar' }}
          </button>
          <template v-else>
            <button
              type="button"
              :disabled="pending !== null"
              @click="emit('run-action', service, 'restart')"
            >
              <ArrowPathIcon aria-hidden="true" />
              {{ isPending(service, 'restart') ? 'Reiniciando…' : 'Reiniciar' }}
            </button>
            <button
              type="button"
              class="danger"
              :disabled="pending !== null"
              @click="emit('run-action', service, 'stop')"
            >
              <PauseIcon aria-hidden="true" />
              {{ isPending(service, 'stop') ? 'Parando…' : 'Parar' }}
            </button>
          </template>
          <button
            type="button"
            class="database-machine-details-toggle"
            :disabled="detailsLoading !== null && detailsLoading !== service.id"
            :aria-expanded="expandedServiceId === service.id"
            :aria-controls="`database-details-${service.id}`"
            @click="emit('toggle-details', service.id)"
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
            @click="emit('uninstall', service)"
          >
            <TrashIcon aria-hidden="true" />
            {{
              isPending(service, 'uninstall') ? 'Desinstalando…' : 'Desinstalar'
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
                @click="emit('reload-details', service.id)"
              >
                <ArrowPathIcon aria-hidden="true" />
                {{
                  detailsLoading === service.id ? 'Testando…' : 'Testar conexão'
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
        :data-service-id="service.id"
        :aria-busy="pending?.serviceId === service.id"
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
            @click="emit('install', service)"
          >
            <PlayIcon aria-hidden="true" />
            {{ isPending(service, 'install') ? 'Instalando…' : 'Instalar' }}
          </button>
        </div>
      </article>
    </div>
  </template>
</template>
