<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Project, ProjectDatabaseOverview, RailsMigrationsOverview, RailsRoutesOverview } from '@dev-dashboard/contracts';

import { fetchProjectDatabase, fetchProjectRailsMigrations, fetchProjectRailsRoutes, revealProjectDatabaseUrl, startProjectDatabase } from '../api';
import { dbReachabilityToneFor, railsMigrationToneFor } from '../utils/status-tones';
import StatusBadge from './StatusBadge.vue';
import Card from './Card.vue';

const props = defineProps<{ project: Project }>();
const overview = ref<ProjectDatabaseOverview | null>(null);
const loading = ref(false);
const errorMessage = ref('');
const revealed = ref<Record<string, string>>({});
const page = ref(1);
const starting = ref<Record<string, boolean>>({});
let generation = 0;

const migrations = ref<RailsMigrationsOverview | null>(null);
const migrationsLoading = ref(false);
const migrationsErrorMessage = ref('');

const routes = ref<RailsRoutesOverview | null>(null);
const routesLoading = ref(false);
const routesErrorMessage = ref('');
const routeFilter = ref('');

const pages = computed(() => Math.max(1, Math.ceil((overview.value?.total ?? 0) / (overview.value?.pageSize ?? 20))));
const reachabilityLabels = { reachable: 'Acessível', unreachable: 'Indisponível', unknown: 'Não verificado' } as const;
const migrationStatusLabels = { up: 'Aplicada', down: 'Pendente' } as const;

const isRailsProject = computed(() => props.project.type === 'rails');
const pendingMigrationsCount = computed(() => migrations.value?.migrations.filter((item) => item.status === 'down').length ?? 0);

const filteredRoutes = computed(() => {
  const list = routes.value?.routes ?? [];
  const query = routeFilter.value.trim().toLowerCase();
  if (!query) return list;
  return list.filter((route) =>
    route.path.toLowerCase().includes(query) ||
    route.controllerAction.toLowerCase().includes(query) ||
    (route.name ?? '').toLowerCase().includes(query) ||
    route.verb.toLowerCase().includes(query));
});

async function loadDatabase(targetPage = page.value): Promise<void> {
  const current = ++generation; loading.value = true; errorMessage.value = '';
  try { const result = await fetchProjectDatabase(props.project.id, targetPage); if (current === generation) { overview.value = result; page.value = targetPage; } }
  catch (error) { if (current === generation) errorMessage.value = error instanceof Error ? error.message : 'Não foi possível consultar os bancos.'; }
  finally { if (current === generation) loading.value = false; }
}

async function loadMigrations(): Promise<void> {
  if (!isRailsProject.value) return;
  migrationsLoading.value = true; migrationsErrorMessage.value = '';
  try { migrations.value = await fetchProjectRailsMigrations(props.project.id); }
  catch (error) { migrationsErrorMessage.value = error instanceof Error ? error.message : 'Não foi possível consultar as migrations.'; }
  finally { migrationsLoading.value = false; }
}

async function loadRoutes(): Promise<void> {
  if (!isRailsProject.value) return;
  routesLoading.value = true; routesErrorMessage.value = '';
  try { routes.value = await fetchProjectRailsRoutes(props.project.id); }
  catch (error) { routesErrorMessage.value = error instanceof Error ? error.message : 'Não foi possível consultar as rotas.'; }
  finally { routesLoading.value = false; }
}

async function reveal(id: string): Promise<void> {
  if (revealed.value[id]) { const next = { ...revealed.value }; delete next[id]; revealed.value = next; return; }

  const current = generation;
  try {
    const secret = await revealProjectDatabaseUrl(props.project.id, id);
    if (current === generation) revealed.value = { ...revealed.value, [id]: secret.databaseUrl };
  }
  catch (error) { if (current === generation) errorMessage.value = error instanceof Error ? error.message : 'Não foi possível revelar a URL.'; }
}

async function copy(value: string): Promise<void> { await navigator.clipboard.writeText(value); }
async function start(id: string): Promise<void> {
  const current = generation;
  starting.value = { ...starting.value, [id]: true };
  errorMessage.value = '';
  try {
    await startProjectDatabase(props.project.id, id);
    if (current === generation) {
      starting.value = { ...starting.value, [id]: false };
      await loadDatabase();
    }
  } catch (error) {
    if (current === generation) errorMessage.value = error instanceof Error ? error.message : 'Não foi possível iniciar o banco.';
  } finally {
    if (current === generation) starting.value = { ...starting.value, [id]: false };
  }
}
function clientUrl(id: string, driver: string): string { return `dev-dashboard://database/open?projectId=${encodeURIComponent(props.project.id)}&environmentId=${encodeURIComponent(id)}&driver=${encodeURIComponent(driver)}`; }
watch(() => props.project.id, () => {
  generation++; overview.value = null; revealed.value = {}; starting.value = {}; page.value = 1;
  migrations.value = null; routes.value = null; routeFilter.value = '';
  void loadDatabase(1);
  void loadMigrations();
  void loadRoutes();
}, { immediate: true });

</script>

<template>
  <Card padded class="project-detail-card">
    <template #header><div class="project-panel-heading"><span class="section-kicker">Infraestrutura local</span><h3>Banco de dados</h3><p>Configurações reconhecidas, com credenciais mascaradas por padrão.</p></div></template>
    <template #actions><button class="secondary-button" type="button" :disabled="loading" @click="loadDatabase()">{{ loading ? 'Atualizando...' : 'Atualizar' }}</button></template>
    <div v-if="errorMessage" class="project-error" role="alert">{{ errorMessage }}</div>
    <div v-else-if="loading && !overview" class="database-empty-state">Detectando configurações...</div>
    <div v-else-if="overview && !overview.supported" class="database-empty-state"><strong>Nenhuma configuração reconhecida.</strong><span>Procuramos por database.yml, arquivos .env, Prisma e knexfile.</span></div>
    <div v-else-if="overview" class="database-list">
      <article v-for="item in overview.environments" :key="item.id" class="database-card">
        <header><div><span class="database-environment">{{ item.environment }}</span><h4>{{ item.database ?? 'Banco não informado' }}</h4></div><StatusBadge :tone="dbReachabilityToneFor(item.reachability)">{{ reachabilityLabels[item.reachability] }}</StatusBadge></header>
        <dl><div><dt>Driver</dt><dd>{{ item.driver }}</dd></div><div><dt>Servidor</dt><dd>{{ item.host ? `${item.host}${item.port ? `:${item.port}` : ''}` : 'Não informado' }}</dd></div><div><dt>Usuário</dt><dd>{{ item.username ?? 'Não informado' }}</dd></div><div><dt>Origem</dt><dd>{{ item.sourceDetail }}</dd></div></dl>
        <code v-if="item.maskedUrl || revealed[item.id]" class="database-url">{{ revealed[item.id] ?? item.maskedUrl }}</code>
        <footer><button v-if="item.reachability === 'unreachable'" class="primary-button" type="button" :disabled="starting[item.id] || !item.startAvailable" :title="item.startAvailable ? 'Iniciar o serviço local com systemctl' : 'Driver local sem serviço systemd reconhecido'" @click="start(item.id)">{{ starting[item.id] ? 'Iniciando...' : item.startAvailable ? 'Iniciar banco local' : 'Início não configurado' }}</button><button v-if="item.passwordConfigured" class="secondary-button" type="button" @click="reveal(item.id)">{{ revealed[item.id] ? 'Ocultar senha' : 'Revelar senha' }}</button><button v-if="revealed[item.id] || (!item.passwordConfigured && item.maskedUrl)" class="secondary-button" type="button" @click="copy(revealed[item.id] ?? item.maskedUrl ?? '')">Copiar URL</button><a class="secondary-button link-button" :href="clientUrl(item.id, item.driver)">Abrir cliente</a></footer>
      </article>
      <nav v-if="pages > 1" class="database-pagination" aria-label="Paginação dos ambientes"><button class="secondary-button" :disabled="page <= 1 || loading" @click="loadDatabase(page - 1)">Anterior</button><span>Página {{ page }} de {{ pages }}</span><button class="secondary-button" :disabled="page >= pages || loading" @click="loadDatabase(page + 1)">Próxima</button></nav>
    </div>
  </Card>

  <Card v-if="isRailsProject" padded class="project-detail-card rails-migrations-card">
    <template #header><div class="project-panel-heading"><span class="section-kicker">Rails · somente leitura</span><h3>Migrations</h3><p>Status de <code>db:migrate:status</code>, sem executar nenhuma migração.</p></div></template>
    <template #actions><button class="secondary-button" type="button" :disabled="migrationsLoading" @click="loadMigrations">{{ migrationsLoading ? 'Atualizando...' : 'Atualizar' }}</button></template>
    <div v-if="migrationsErrorMessage" class="project-error" role="alert">{{ migrationsErrorMessage }}</div>
    <div v-else-if="migrationsLoading && !migrations" class="database-empty-state">Consultando migrations...</div>
    <div v-else-if="migrations && !migrations.supported" class="database-empty-state"><strong>Status de migrations indisponível.</strong><span>Não encontramos <code>bin/rails</code>/Gemfile com Rails, ou o comando falhou (ex. banco indisponível).</span></div>
    <div v-else-if="migrations" class="migrations-panel">
      <p class="migrations-summary"><strong>{{ pendingMigrationsCount }}</strong> {{ pendingMigrationsCount === 1 ? 'migration pendente' : 'migrations pendentes' }} de {{ migrations.migrations.length }} <span v-if="migrations.database">· banco <code>{{ migrations.database }}</code></span></p>
      <table class="migrations-table">
        <thead><tr><th>Versão</th><th>Nome</th><th>Status</th></tr></thead>
        <tbody>
          <tr v-for="entry in migrations.migrations" :key="entry.version">
            <td><code>{{ entry.version }}</code></td>
            <td>{{ entry.name }}</td>
            <td><StatusBadge :tone="railsMigrationToneFor(entry.status)">{{ migrationStatusLabels[entry.status] }}</StatusBadge></td>
          </tr>
        </tbody>
      </table>
    </div>
  </Card>

  <Card v-if="isRailsProject" padded class="project-detail-card rails-routes-card">
    <template #header><div class="project-panel-heading"><span class="section-kicker">Rails · somente leitura</span><h3>Rotas</h3><p>Saída de <code>bin/rails routes</code>.</p></div></template>
    <template #actions><button class="secondary-button" type="button" :disabled="routesLoading" @click="loadRoutes">{{ routesLoading ? 'Atualizando...' : 'Atualizar' }}</button></template>
    <div v-if="routesErrorMessage" class="project-error" role="alert">{{ routesErrorMessage }}</div>
    <div v-else-if="routesLoading && !routes" class="database-empty-state">Consultando rotas...</div>
    <div v-else-if="routes && !routes.supported" class="database-empty-state"><strong>Rotas indisponíveis.</strong><span>Não encontramos <code>bin/rails</code>/Gemfile com Rails, ou o comando falhou.</span></div>
    <div v-else-if="routes" class="routes-panel">
      <input v-model="routeFilter" class="route-search" type="search" placeholder="Buscar por caminho, controller#action ou nome…" aria-label="Buscar rotas" />
      <p v-if="routes.routes.length === 0" class="database-empty-state">Nenhuma rota declarada foi reconhecida.</p>
      <p v-else-if="filteredRoutes.length === 0" class="database-empty-state">Nenhuma rota corresponde à busca.</p>
      <table v-else class="routes-table">
        <thead><tr><th>Verbo</th><th>Caminho</th><th>Controller#Action</th><th>Nome</th></tr></thead>
        <tbody>
          <tr v-for="(route, index) in filteredRoutes" :key="`${route.verb}-${route.path}-${index}`">
            <td><span class="route-verb" :class="`route-verb-${route.verb.toLowerCase()}`">{{ route.verb }}</span></td>
            <td><code>{{ route.path }}</code></td>
            <td>{{ route.controllerAction }}</td>
            <td><code v-if="route.name">{{ route.name }}</code></td>
          </tr>
        </tbody>
      </table>
    </div>
  </Card>
</template>
