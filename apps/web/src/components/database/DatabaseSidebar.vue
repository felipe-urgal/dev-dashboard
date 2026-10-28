<script setup lang="ts">
import { computed } from 'vue';
import { NDropdown } from 'naive-ui';
import {
  ChevronDownIcon,
  EllipsisVerticalIcon,
} from '@heroicons/vue/24/outline';
import { dangerMenuLabel } from '../../utils/ui-menu';
import UiButton from '../ui/UiButton.vue';
import UiSearchField from '../ui/UiSearchField.vue';
import type {
  DatabaseServiceAction,
  MachineDatabaseService,
  MachineDatabaseServiceDetails,
  MachineDatabaseTable,
} from '@dev-dashboard/contracts';

type PendingAction = {
  serviceId: string;
  action: DatabaseServiceAction | 'install' | 'uninstall';
} | null;

const props = defineProps<{
  services: MachineDatabaseService[];
  details: Record<string, MachineDatabaseServiceDetails>;
  pending: PendingAction;
  activeServiceId: string | null;
  databases: { name: string }[];
  tables: MachineDatabaseTable[];
  filteredTableCount: number;
  page: number;
  pageCount: number;
  selectedDatabase: string;
  selectedTable: string;
  tableSearch: string;
  loading: boolean;
}>();

const emit = defineEmits<{
  explore: [service: MachineDatabaseService];
  'run-action': [
    service: MachineDatabaseService,
    action: DatabaseServiceAction,
  ];
  'show-details': [service: MachineDatabaseService];
  uninstall: [service: MachineDatabaseService];
  disconnect: [];
  'select-database': [name: string];
  'select-table': [table: MachineDatabaseTable];
  'search-table': [value: string];
  'previous-page': [];
  'next-page': [];
}>();

const explorableDrivers = new Set(['postgresql', 'mysql', 'mariadb', 'redis']);

function canExplore(service: MachineDatabaseService): boolean {
  return service.active && explorableDrivers.has(service.driver);
}

function metaFor(service: MachineDatabaseService): string {
  if (props.pending?.serviceId === service.id) {
    const label = {
      start: 'iniciando…',
      stop: 'parando…',
      restart: 'reiniciando…',
      install: 'instalando…',
      uninstall: 'desinstalando…',
    }[props.pending.action];
    return label;
  }
  const port = props.details[service.id]?.port;
  const state = service.active ? 'em execução' : 'parado';
  return port ? `:${port} · ${state}` : state;
}

function menuOptions(service: MachineDatabaseService) {
  return [
    service.active
      ? { key: 'restart', label: 'Reiniciar' }
      : { key: 'start', label: 'Iniciar' },
    ...(service.active ? [{ key: 'stop', label: 'Parar' }] : []),
    { key: 'details', label: 'Ver detalhes e logs' },
    { key: 'divider', type: 'divider' as const },
    {
      key: 'uninstall',
      label: dangerMenuLabel('Desinstalar…'),
    },
  ];
}

function handleMenu(service: MachineDatabaseService, key: string): void {
  if (key === 'start' || key === 'stop' || key === 'restart') {
    emit('run-action', service, key);
  } else if (key === 'details') emit('show-details', service);
  else if (key === 'uninstall') emit('uninstall', service);
}

const databaseOptions = computed(() =>
  props.databases.map((database) => ({
    key: database.name,
    label: database.name,
  })),
);

function itemLabel(table: MachineDatabaseTable): string {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

function isRedis(service: MachineDatabaseService): boolean {
  return service.driver === 'redis';
}
</script>

<template>
  <aside class="database-sidebar" aria-label="Serviços e bancos">
    <h2 class="database-sidebar-title">Serviços da máquina</h2>

    <p v-if="services.length === 0" class="database-sidebar-empty">
      Nenhum banco instalado nesta máquina.
    </p>

    <div v-for="service in services" :key="service.id" class="database-service">
      <div
        class="database-service-row"
        :data-active="service.id === activeServiceId"
        :aria-busy="pending?.serviceId === service.id"
      >
        <button
          type="button"
          class="database-service-main"
          :disabled="!canExplore(service) || pending !== null"
          :title="
            canExplore(service)
              ? `Explorar ${service.label}`
              : service.active
                ? 'O explorador não suporta este banco'
                : 'Inicie o serviço para explorar'
          "
          @click="emit('explore', service)"
        >
          <span class="database-service-dot" :data-on="service.active" />
          <span class="database-service-copy">
            <strong>{{ service.label }}</strong>
            <span>{{ metaFor(service) }}</span>
          </span>
        </button>
        <n-dropdown
          trigger="click"
          placement="bottom-end"
          :options="menuOptions(service)"
          :disabled="pending !== null"
          @select="(key: string) => handleMenu(service, key)"
        >
          <UiButton
            icon
            size="sm"
            variant="ghost"
            :aria-label="`Ações de ${service.label}`"
            aria-haspopup="menu"
          >
            <EllipsisVerticalIcon aria-hidden="true" />
          </UiButton>
        </n-dropdown>
      </div>

      <div v-if="service.id === activeServiceId" class="database-tree">
        <n-dropdown
          trigger="click"
          placement="bottom-start"
          :options="databaseOptions"
          @select="(name: string) => emit('select-database', name)"
        >
          <button
            type="button"
            class="database-tree-database"
            :disabled="loading"
          >
            <span>{{ selectedDatabase || 'Selecione um banco' }}</span>
            <ChevronDownIcon aria-hidden="true" />
          </button>
        </n-dropdown>

        <template v-if="selectedDatabase">
          <UiSearchField
            :model-value="tableSearch"
            :label="isRedis(service) ? 'Buscar chave' : 'Buscar tabela'"
            :placeholder="isRedis(service) ? 'Buscar chave' : 'Buscar tabela'"
            @update:model-value="(value: string) => emit('search-table', value)"
          />
          <p
            v-if="!loading && filteredTableCount === 0"
            class="database-tree-empty"
          >
            {{ isRedis(service) ? 'Nenhuma chave.' : 'Nenhuma tabela.' }}
          </p>
          <ul class="database-tree-list">
            <li v-for="table in tables" :key="itemLabel(table)">
              <button
                type="button"
                class="database-tree-table"
                :data-active="table.name === selectedTable"
                :title="itemLabel(table)"
                @click="emit('select-table', table)"
              >
                {{ itemLabel(table) }}
              </button>
            </li>
          </ul>
          <div v-if="pageCount > 1" class="database-tree-pages">
            <UiButton
              icon
              size="sm"
              variant="ghost"
              aria-label="Página anterior"
              :disabled="page <= 1"
              @click="emit('previous-page')"
            >
              ‹
            </UiButton>
            <span>{{ page }} / {{ pageCount }}</span>
            <UiButton
              icon
              size="sm"
              variant="ghost"
              aria-label="Próxima página"
              :disabled="page >= pageCount"
              @click="emit('next-page')"
            >
              ›
            </UiButton>
          </div>
        </template>
        <UiButton
          class="database-tree-disconnect"
          size="sm"
          variant="ghost"
          :disabled="loading"
          @click="emit('disconnect')"
        >
          Desconectar
        </UiButton>
      </div>
    </div>

    <p class="database-sidebar-note">
      Somente leitura. Senhas ficam apenas na memória do servidor.
    </p>
  </aside>
</template>

<style scoped>
.database-sidebar {
  display: flex;
  flex: 0 0 320px;
  flex-direction: column;
  gap: 6px;
  padding: 16px 12px;
  overflow-y: auto;
  border-right: 1px solid var(--border);
  background: var(--surface-1);
}

.database-sidebar-title {
  margin: 0;
  padding: 4px 8px 8px;
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 650;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.database-sidebar-empty,
.database-tree-empty,
.database-sidebar-note {
  margin: 0;
  padding: 6px 8px;
  color: var(--text-dim);
  font-size: 12px;
}

.database-sidebar-note {
  margin-top: auto;
  padding-top: 16px;
}

.database-service-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: 4px;
  border-radius: 12px;
}

.database-service-row:hover {
  background: var(--surface-2);
}

.database-service-row[data-active='true'] {
  background: var(--accent-soft);
}

.database-service-main {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border: 0;
  border-radius: 12px;
  color: inherit;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.database-service-main:disabled {
  cursor: default;
}

.database-service-dot {
  width: 9px;
  height: 9px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--border-strong);
}

.database-service-dot[data-on='true'] {
  background: var(--success-text);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--success-text) 22%, transparent);
}

.database-service-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.database-service-copy strong {
  color: var(--text);
  font-size: 14px;
  font-weight: 650;
}

.database-service-copy span {
  color: var(--text-dim);
  font-family: var(--font-family-mono);
  font-size: 12px;
}

.database-tree {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 4px 0 10px 18px;
  padding-left: 12px;
  border-left: 1px solid var(--border);
}

.database-tree-database {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text);
  background: transparent;
  font-family: var(--font-family-mono);
  font-size: 12px;
  cursor: pointer;
}

.database-tree-database svg {
  width: 14px;
  height: 14px;
  color: var(--text-muted);
}

.database-tree-list {
  display: flex;
  max-height: 46vh;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.database-tree-table {
  display: block;
  width: 100%;
  padding: 6px 8px;
  overflow: hidden;
  border: 0;
  border-radius: 8px;
  color: var(--text-muted);
  background: transparent;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.database-tree-table:hover {
  color: var(--text);
  background: var(--surface-2);
}

.database-tree-table[data-active='true'] {
  color: var(--text);
  background: var(--surface-3);
}

.database-tree-pages {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-dim);
  font-size: 12px;
}

.database-tree-disconnect {
  align-self: flex-start;
}

button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

button:disabled {
  opacity: 0.5;
}

@media (max-width: 900px) {
  .database-sidebar {
    flex-basis: auto;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
}
</style>
