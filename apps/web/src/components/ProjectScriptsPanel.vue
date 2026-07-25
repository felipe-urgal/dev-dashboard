<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Project, ProjectScriptCatalog, ProjectScriptOrigin, ProjectScriptRisk } from '@dev-dashboard/contracts';
import { fetchProjectScripts } from '../api';

const props = defineProps<{ project: Project }>();
const catalog = ref<ProjectScriptCatalog | null>(null);
const loading = ref(false);
const errorMessage = ref('');
const search = ref('');
const origin = ref<ProjectScriptOrigin | ''>('');
const risk = ref<ProjectScriptRisk | ''>('');
const page = ref(1);
let generation = 0;
let searchTimer: ReturnType<typeof setTimeout> | null = null;

const originLabels: Record<ProjectScriptOrigin, string> = { 'package-script': 'package.json', 'rails-task': 'Tarefa Rails', bin: 'Executável bin/' };
const riskLabels: Record<ProjectScriptRisk, string> = { 'read-only': 'Somente leitura', mutable: 'Mutável', destructive: 'Destrutivo' };

async function load(): Promise<void> {
  const current = generation; const projectId = props.project.id;
  loading.value = true; errorMessage.value = '';
  const query = new URLSearchParams({ page: String(page.value), pageSize: '12' });
  if (search.value.trim()) query.set('search', search.value.trim());
  if (origin.value) query.set('origin', origin.value);
  if (risk.value) query.set('risk', risk.value);
  try {
    const result = await fetchProjectScripts(projectId, query);
    if (current === generation && projectId === props.project.id) catalog.value = result;
  } catch (error) {
    if (current === generation && projectId === props.project.id) errorMessage.value = error instanceof Error ? error.message : 'Não foi possível carregar o catálogo.';
  } finally { if (current === generation) loading.value = false; }
}

watch(() => props.project.id, () => { generation += 1; catalog.value = null; page.value = 1; void load(); }, { immediate: true });
watch([origin, risk], () => { page.value = 1; void load(); });
watch(search, () => { page.value = 1; if (searchTimer) clearTimeout(searchTimer); searchTimer = setTimeout(() => void load(), 250); });
</script>

<template>
  <section class="project-scripts-panel">
    <header class="scripts-panel-header"><div><span class="section-kicker">Catálogo seguro</span><h3>Scripts e tarefas</h3><p>Inspecione ações reconhecidas. A execução ainda não está disponível.</p></div><button class="secondary-button" type="button" :disabled="loading" @click="load">Atualizar</button></header>
    <div class="scripts-filters">
      <input v-model="search" type="search" placeholder="Buscar por nome, descrição ou comando" aria-label="Buscar scripts">
      <select v-model="origin" aria-label="Filtrar por origem"><option value="">Todas as origens</option><option value="package-script">package.json</option><option value="rails-task">Tarefas Rails</option><option value="bin">Executáveis bin/</option></select>
      <select v-model="risk" aria-label="Filtrar por risco"><option value="">Todos os riscos</option><option value="read-only">Somente leitura</option><option value="mutable">Mutável</option><option value="destructive">Destrutivo</option></select>
    </div>
    <p v-if="errorMessage" class="inline-error">{{ errorMessage }}</p>
    <div v-if="loading && !catalog" class="scripts-empty">Carregando catálogo…</div>
    <div v-else-if="catalog?.items.length === 0" class="scripts-empty"><strong>Nenhuma ação encontrada</strong><span>Ajuste os filtros ou confirme se o projeto possui scripts reconhecidos.</span></div>
    <div v-else class="scripts-list">
      <article v-for="item in catalog?.items" :key="item.id" class="script-card">
        <header><div><span>{{ originLabels[item.origin] }}</span><h4>{{ item.name }}</h4></div><span class="script-risk" :class="`script-risk-${item.risk}`">{{ riskLabels[item.risk] }}</span></header>
        <p>{{ item.description }}</p><code>{{ item.command }}</code>
        <footer><small v-if="!item.enabled">Ação destrutiva bloqueada</small><button class="secondary-button" type="button" disabled>Executar</button></footer>
      </article>
    </div>
    <nav v-if="catalog && catalog.totalPages > 1" class="scripts-pagination"><button class="secondary-button" :disabled="page <= 1" @click="page -= 1; load()">Anterior</button><span>Página {{ catalog.page }} de {{ catalog.totalPages }} · {{ catalog.total }} itens</span><button class="secondary-button" :disabled="page >= catalog.totalPages" @click="page += 1; load()">Próxima</button></nav>
  </section>
</template>
