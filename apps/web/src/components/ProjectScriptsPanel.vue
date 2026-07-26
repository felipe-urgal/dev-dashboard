<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import type { Project, ProjectScript, ProjectScriptCatalog, ProjectScriptOrigin, ProjectScriptRisk, ScriptExecution, ScriptExecutionHistory, ScriptExecutionStatus } from '@dev-dashboard/contracts';
import { cancelScriptExecution, fetchLatestScriptExecution, fetchProjectScripts, fetchScriptExecution, fetchScriptExecutionHistory, fetchScriptExecutionLog, prepareScriptExecution, startScriptExecution } from '../api';

const props = defineProps<{ project: Project }>();
const catalog = ref<ProjectScriptCatalog | null>(null);
const loading = ref(false);
const errorMessage = ref('');
const search = ref('');
const origin = ref<ProjectScriptOrigin | ''>('');
const risk = ref<ProjectScriptRisk | ''>('');
const page = ref(1);
const execution = ref<ScriptExecution | null>(null);
const history = ref<ScriptExecutionHistory | null>(null);
const executionLog = ref('');
const maskedLogEntries = ref(0);
const startingActionId = ref<string | null>(null);
let generation = 0;
let executionGeneration = 0;
let searchTimer: ReturnType<typeof setTimeout> | null = null;

const originLabels: Record<ProjectScriptOrigin, string> = { 'package-script': 'package.json', 'rails-task': 'Tarefa Rails', bin: 'Executável bin/' };
const riskLabels: Record<ProjectScriptRisk, string> = { 'read-only': 'Somente leitura', mutable: 'Mutável', destructive: 'Destrutivo' };
const executionStatusLabels: Record<ScriptExecutionStatus, string> = { running: 'Em execução', succeeded: 'Concluída', failed: 'Falhou', cancelled: 'Cancelada' };

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

async function run(item: ProjectScript): Promise<void> {
  if (startingActionId.value || execution.value?.status === 'running') return;
  const projectId = props.project.id; const current = generation;
  if (item.risk !== 'read-only' && !window.confirm(`Executar a ação mutável “${item.name}”? O código do projeto será executado localmente.`)) return;
  startingActionId.value = item.id;
  const currentExecution = ++executionGeneration;
  errorMessage.value = '';
  try {
    const confirmation = item.risk === 'read-only' ? undefined : await prepareScriptExecution(projectId, item.id);
    const started = await startScriptExecution(projectId, item.id, confirmation?.token);
    execution.value = started;
    startingActionId.value = null;
    await followExecution(started, projectId, current, currentExecution);
    await loadHistory(projectId, current);
  } catch (error) { if (current === generation && currentExecution === executionGeneration) errorMessage.value = error instanceof Error ? error.message : 'Não foi possível executar a ação.'; }
  finally { if (current === generation && currentExecution === executionGeneration) startingActionId.value = null; }
}

async function followExecution(initial: ScriptExecution, projectId: string, current: number, currentExecutionGeneration: number): Promise<void> {
  let currentExecution = initial;
  while (current === generation && currentExecutionGeneration === executionGeneration && projectId === props.project.id) {
    const log = await fetchScriptExecutionLog(projectId, initial.id);
    if (current !== generation || currentExecutionGeneration !== executionGeneration) return;
    executionLog.value = log.content;
    maskedLogEntries.value = log.redactionCount;
    if (currentExecution.status !== 'running') return;
    await new Promise((resolve) => setTimeout(resolve, 750));
    currentExecution = await fetchScriptExecution(projectId, initial.id);
    if (current !== generation || currentExecutionGeneration !== executionGeneration) return;
    execution.value = currentExecution;
  }
}

async function restoreExecution(projectId: string, current: number): Promise<void> {
  const currentExecution = ++executionGeneration;
  try {
    const latest = await fetchLatestScriptExecution(projectId);
    if (current !== generation || currentExecution !== executionGeneration || projectId !== props.project.id || !latest) return;
    execution.value = latest;
    await followExecution(latest, projectId, current, currentExecution);
  } catch (error) {
    if (current === generation && currentExecution === executionGeneration) errorMessage.value = error instanceof Error ? error.message : 'Não foi possível recuperar a última execução.';
  }
}

async function loadHistory(projectId = props.project.id, current = generation): Promise<void> {
  try {
    const result = await fetchScriptExecutionHistory(projectId);
    if (current === generation && projectId === props.project.id) history.value = result;
  } catch (error) {
    if (current === generation) errorMessage.value = error instanceof Error ? error.message : 'Não foi possível carregar o histórico.';
  }
}

async function selectHistory(item: ScriptExecution): Promise<void> {
  const currentExecution = ++executionGeneration; const current = generation; const projectId = props.project.id;
  execution.value = item; executionLog.value = ''; maskedLogEntries.value = 0;
  await followExecution(item, projectId, current, currentExecution);
}

async function cancel(): Promise<void> {
  if (!execution.value) return;
  try { execution.value = await cancelScriptExecution(props.project.id, execution.value.id); } catch (error) { errorMessage.value = error instanceof Error ? error.message : 'Não foi possível cancelar.'; }
}

watch(() => props.project.id, () => { generation += 1; executionGeneration += 1; const current = generation; const projectId = props.project.id; catalog.value = null; history.value = null; execution.value = null; executionLog.value = ''; maskedLogEntries.value = 0; startingActionId.value = null; page.value = 1; void load(); void loadHistory(projectId, current); void restoreExecution(projectId, current); }, { immediate: true });
watch([origin, risk], () => { page.value = 1; void load(); });
watch(search, () => { page.value = 1; if (searchTimer) clearTimeout(searchTimer); searchTimer = setTimeout(() => void load(), 250); });
onUnmounted(() => { generation += 1; executionGeneration += 1; if (searchTimer) clearTimeout(searchTimer); });
</script>

<template>
  <section class="project-scripts-panel">
    <header class="scripts-panel-header"><div><span class="section-kicker">Catálogo seguro</span><h3>Scripts e tarefas</h3><p>Execute somente ações reconhecidas pela API, com confirmação proporcional ao risco.</p></div><button class="secondary-button" type="button" :disabled="loading" @click="load">Atualizar</button></header>
    <aside v-if="execution" class="scripts-empty" aria-live="polite"><strong>{{ execution.actionName }} · {{ executionStatusLabels[execution.status] }}</strong><button v-if="execution.status === 'running'" class="secondary-button" type="button" @click="cancel">Cancelar</button><span v-if="maskedLogEntries" class="project-log-redaction-warning">{{ maskedLogEntries }} ocorrência(s) sensível(is) mascarada(s).</span><pre v-if="executionLog">{{ executionLog }}</pre></aside>
    <section v-if="history?.items.length" class="scripts-empty" aria-label="Histórico de execuções"><strong>Execuções recentes</strong><button v-for="item in history.items" :key="item.id" class="secondary-button" type="button" @click="selectHistory(item)">{{ item.actionName }} · {{ executionStatusLabels[item.status] }} · {{ new Date(item.startedAt).toLocaleString('pt-BR') }}</button></section>
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
        <footer><small v-if="!item.enabled">Ação destrutiva bloqueada</small><button class="secondary-button" type="button" :disabled="!item.enabled || startingActionId !== null || execution?.status === 'running'" @click="run(item)">{{ startingActionId === item.id ? 'Iniciando…' : 'Executar' }}</button></footer>
      </article>
    </div>
    <nav v-if="catalog && catalog.totalPages > 1" class="scripts-pagination"><button class="secondary-button" :disabled="page <= 1" @click="page -= 1; load()">Anterior</button><span>Página {{ catalog.page }} de {{ catalog.totalPages }} · {{ catalog.total }} itens</span><button class="secondary-button" :disabled="page >= catalog.totalPages" @click="page += 1; load()">Próxima</button></nav>
  </section>
</template>
