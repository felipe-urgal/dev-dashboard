<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Project, ProjectDatabaseOverview } from '@dev-dashboard/contracts';
import { fetchProjectDatabase, revealProjectDatabaseUrl } from '../api';

const props = defineProps<{ project: Project }>();
const overview = ref<ProjectDatabaseOverview | null>(null);
const loading = ref(false);
const errorMessage = ref('');
const revealed = ref<Record<string, string>>({});
const page = ref(1);
let generation = 0;

const pages = computed(() => Math.max(1, Math.ceil((overview.value?.total ?? 0) / (overview.value?.pageSize ?? 20))));
const reachabilityLabels = { reachable: 'Acessível', unreachable: 'Indisponível', unknown: 'Não verificado' } as const;

async function loadDatabase(targetPage = page.value): Promise<void> {
  const current = ++generation; loading.value = true; errorMessage.value = '';
  try { const result = await fetchProjectDatabase(props.project.id, targetPage); if (current === generation) { overview.value = result; page.value = targetPage; } }
  catch (error) { if (current === generation) errorMessage.value = error instanceof Error ? error.message : 'Não foi possível consultar os bancos.'; }
  finally { if (current === generation) loading.value = false; }
}

async function reveal(id: string): Promise<void> {
  if (revealed.value[id]) { const next = { ...revealed.value }; delete next[id]; revealed.value = next; return; }
  try { const secret = await revealProjectDatabaseUrl(props.project.id, id); revealed.value = { ...revealed.value, [id]: secret.databaseUrl }; }
  catch (error) { errorMessage.value = error instanceof Error ? error.message : 'Não foi possível revelar a URL.'; }
}

async function copy(value: string): Promise<void> { await navigator.clipboard.writeText(value); }
function clientUrl(id: string, driver: string): string { return `dev-dashboard://database/open?projectId=${encodeURIComponent(props.project.id)}&environmentId=${encodeURIComponent(id)}&driver=${encodeURIComponent(driver)}`; }
watch(() => props.project.id, () => { generation++; overview.value = null; revealed.value = {}; page.value = 1; void loadDatabase(1); }, { immediate: true });
</script>

<template>
  <section class="project-database-panel">
    <header class="database-panel-header"><div><span class="section-kicker">Infraestrutura local</span><h3>Banco de dados</h3><p>Configurações reconhecidas, com credenciais mascaradas por padrão.</p></div><button class="secondary-button" type="button" :disabled="loading" @click="loadDatabase()">{{ loading ? 'Atualizando...' : 'Atualizar' }}</button></header>
    <div v-if="errorMessage" class="project-error" role="alert">{{ errorMessage }}</div>
    <div v-else-if="loading && !overview" class="database-empty-state">Detectando configurações...</div>
    <div v-else-if="overview && !overview.supported" class="database-empty-state"><strong>Nenhuma configuração reconhecida.</strong><span>Procuramos por database.yml, arquivos .env, Prisma e knexfile.</span></div>
    <div v-else-if="overview" class="database-list">
      <article v-for="item in overview.environments" :key="item.id" class="database-card">
        <header><div><span class="database-environment">{{ item.environment }}</span><h4>{{ item.database ?? 'Banco não informado' }}</h4></div><span class="database-status" :class="`database-status-${item.reachability}`">{{ reachabilityLabels[item.reachability] }}</span></header>
        <dl><div><dt>Driver</dt><dd>{{ item.driver }}</dd></div><div><dt>Servidor</dt><dd>{{ item.host ? `${item.host}${item.port ? `:${item.port}` : ''}` : 'Não informado' }}</dd></div><div><dt>Usuário</dt><dd>{{ item.username ?? 'Não informado' }}</dd></div><div><dt>Origem</dt><dd>{{ item.sourceDetail }}</dd></div></dl>
        <code v-if="item.maskedUrl || revealed[item.id]" class="database-url">{{ revealed[item.id] ?? item.maskedUrl }}</code>
        <footer><button v-if="item.passwordConfigured" class="secondary-button" type="button" @click="reveal(item.id)">{{ revealed[item.id] ? 'Ocultar senha' : 'Revelar senha' }}</button><button v-if="revealed[item.id] || (!item.passwordConfigured && item.maskedUrl)" class="secondary-button" type="button" @click="copy(revealed[item.id] ?? item.maskedUrl ?? '')">Copiar URL</button><a class="secondary-button link-button" :href="clientUrl(item.id, item.driver)">Abrir cliente</a></footer>
      </article>
      <nav v-if="pages > 1" class="database-pagination" aria-label="Paginação dos ambientes"><button class="secondary-button" :disabled="page <= 1 || loading" @click="loadDatabase(page - 1)">Anterior</button><span>Página {{ page }} de {{ pages }}</span><button class="secondary-button" :disabled="page >= pages || loading" @click="loadDatabase(page + 1)">Próxima</button></nav>
    </div>
  </section>
</template>
