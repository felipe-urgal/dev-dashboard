<script setup lang="ts">
import {
  computed,
  onUnmounted,
  ref,
  watch,
} from 'vue';
import {
  ArrowPathIcon,
  BoltIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  CommandLineIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  QueueListIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  StopCircleIcon,
  WrenchScrewdriverIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';

import type {
  Project,
  ProjectScript,
  ProjectScriptCatalog,
  ProjectScriptOrigin,
  ProjectScriptRisk,
  ScriptExecution,
  ScriptExecutionHistory,
  ScriptExecutionStatus,
} from '@dev-dashboard/contracts';

import {
  cancelScriptExecution,
  fetchLatestScriptExecution,
  fetchProjectScripts,
  fetchScriptExecution,
  fetchScriptExecutionHistory,
  fetchScriptExecutionLog,
  followScriptExecutionEvents,
  prepareScriptExecution,
  startScriptExecution,
} from '../api';
import { useAutoDismiss } from '../composables/useAutoDismiss';
import { noticeCenterStore } from '../stores/notice-center';
import { riskToneFor } from '../utils/status-tones';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project }>();

type ScriptSection = 'overview' | 'catalog' | 'executions';
type ScriptCategory = 'all' | 'build' | 'development' | 'tests' | 'maintenance' | 'deploy' | 'utilities';

const catalog = ref<ProjectScriptCatalog | null>(null);
const loading = ref(false);
const errorMessage = ref('');
const search = ref('');
const origin = ref<ProjectScriptOrigin | ''>('');
const risk = ref<ProjectScriptRisk | ''>('');
const category = ref<ScriptCategory>('all');
const page = ref(1);

const execution = ref<ScriptExecution | null>(null);
const history = ref<ScriptExecutionHistory | null>(null);
const executionLog = ref('');
const maskedLogEntries = ref(0);
const startingActionId = ref<string | null>(null);
const selectedActionId = ref('');
const activeSection = ref<ScriptSection>('overview');
const copiedActionId = ref('');

useAutoDismiss(errorMessage, '');

let generation = 0;
let executionGeneration = 0;
let hasObservedRunning = false;
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let copiedTimer: ReturnType<typeof setTimeout> | null = null;
let closeExecutionEvents: (() => void) | null = null;

const originLabels: Record<ProjectScriptOrigin, string> = {
  'package-script': 'package.json',
  'rails-task': 'Tarefa Rails',
  bin: 'Executável bin/',
};

const riskLabels: Record<ProjectScriptRisk, string> = {
  'read-only': 'Somente leitura',
  mutable: 'Mutável',
  destructive: 'Destrutivo',
};

const executionStatusLabels: Record<ScriptExecutionStatus, string> = {
  running: 'Em execução',
  succeeded: 'Concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};

const categoryLabels: Record<ScriptCategory, string> = {
  all: 'Todos os scripts',
  build: 'Build',
  development: 'Desenvolvimento',
  tests: 'Testes',
  maintenance: 'Manutenção',
  deploy: 'Deploy',
  utilities: 'Utilitários',
};

const categoryIds: ScriptCategory[] = [
  'all',
  'build',
  'development',
  'tests',
  'maintenance',
  'deploy',
  'utilities',
];

const sectionTabs = [
  { id: 'overview' as const, label: 'Visão geral', icon: Squares2X2Icon },
  { id: 'catalog' as const, label: 'Catálogo', icon: CommandLineIcon },
  { id: 'executions' as const, label: 'Execuções', icon: ClockIcon },
];

const realtimeRecoveryMessage = 'A conexão em tempo real foi interrompida. Recuperando o estado atual…';

const sectionTitle = computed(() => ({
  overview: 'Scripts e tarefas',
  catalog: 'Catálogo de scripts',
  executions: 'Execuções',
})[activeSection.value]);

const sectionDescription = computed(() => ({
  overview: 'Visão consolidada das ações reconhecidas, riscos e execuções recentes.',
  catalog: 'Encontre scripts e tarefas por origem, categoria e nível de risco.',
  executions: 'Acompanhe o processo ativo, consulte logs e revise o histórico.',
})[activeSection.value]);

const selectedScript = computed<ProjectScript | null>(() =>
  catalog.value?.items.find((item) => item.id === selectedActionId.value)
  ?? catalog.value?.items[0]
  ?? null,
);

const visibleScripts = computed(() => {
  const items = catalog.value?.items ?? [];
  if (category.value === 'all') return items;
  return items.filter((item) => categoryFor(item) === category.value);
});

const categoryCounts = computed(() => {
  const counts: Record<ScriptCategory, number> = {
    all: catalog.value?.items.length ?? 0,
    build: 0,
    development: 0,
    tests: 0,
    maintenance: 0,
    deploy: 0,
    utilities: 0,
  };

  for (const item of catalog.value?.items ?? []) {
    counts[categoryFor(item)] += 1;
  }
  return counts;
});

const riskCounts = computed(() => {
  const counts: Record<ProjectScriptRisk, number> = {
    'read-only': 0,
    mutable: 0,
    destructive: 0,
  };
  for (const item of catalog.value?.items ?? []) counts[item.risk] += 1;
  return counts;
});

const completedExecutions = computed(() =>
  history.value?.items.filter((item) => item.status !== 'running') ?? [],
);

const successfulExecutions = computed(() =>
  completedExecutions.value.filter((item) => item.status === 'succeeded').length,
);

const successRate = computed(() => {
  if (completedExecutions.value.length === 0) return 0;
  return Math.round((successfulExecutions.value / completedExecutions.value.length) * 100);
});

const latestExecution = computed(() => execution.value ?? history.value?.items[0] ?? null);

const isRefreshing = computed(() => loading.value);

function categoryFor(item: ProjectScript): Exclude<ScriptCategory, 'all'> {
  const text = `${item.name} ${item.command}`.toLowerCase();
  if (/(deploy|release|publish|ship)/.test(text)) return 'deploy';
  if (/(test|spec|rspec|vitest|jest|lint|rubocop)/.test(text)) return 'tests';
  if (/(build|compile|assets|css|webpack|vite)/.test(text)) return 'build';
  if (/(dev|watch|serve|server|start)/.test(text)) return 'development';
  if (/(setup|prepare|install|migrate|seed|db:|clean|reset)/.test(text)) return 'maintenance';
  return 'utilities';
}

function categoryIcon(categoryId: ScriptCategory) {
  if (categoryId === 'build') return BoltIcon;
  if (categoryId === 'development') return CommandLineIcon;
  if (categoryId === 'tests') return CheckCircleIcon;
  if (categoryId === 'maintenance') return WrenchScrewdriverIcon;
  if (categoryId === 'deploy') return ArrowPathIcon;
  return QueueListIcon;
}

function executionTone(status: ScriptExecutionStatus): 'info' | 'success' | 'danger' | 'warning' {
  if (status === 'running') return 'info';
  if (status === 'succeeded') return 'success';
  if (status === 'failed') return 'danger';
  return 'warning';
}

function executionIcon(status: ScriptExecutionStatus) {
  if (status === 'running') return ArrowPathIcon;
  if (status === 'succeeded') return CheckCircleIcon;
  if (status === 'failed') return XCircleIcon;
  return StopCircleIcon;
}

function formatDate(value?: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function executionDuration(item: ScriptExecution | null): string {
  if (!item) return '—';
  const start = new Date(item.startedAt).getTime();
  const end = item.finishedAt ? new Date(item.finishedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

function selectSection(section: ScriptSection): void {
  activeSection.value = section;
}

function selectScript(item: ProjectScript): void {
  selectedActionId.value = item.id;
  activeSection.value = 'catalog';
}

async function copyCommand(item: ProjectScript): Promise<void> {
  try {
    await navigator.clipboard.writeText(item.command);
    copiedActionId.value = item.id;
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copiedActionId.value = '';
    }, 2_000);
  } catch {
    copiedActionId.value = '';
  }
}

async function load(): Promise<void> {
  const current = generation;
  const projectId = props.project.id;
  loading.value = true;
  errorMessage.value = '';

  const query = new URLSearchParams({
    page: String(page.value),
    pageSize: '12',
  });
  if (search.value.trim()) query.set('search', search.value.trim());
  if (origin.value) query.set('origin', origin.value);
  if (risk.value) query.set('risk', risk.value);

  try {
    const result = await fetchProjectScripts(projectId, query);
    if (current !== generation || projectId !== props.project.id) return;
    catalog.value = result;
    if (!result.items.some((item) => item.id === selectedActionId.value)) {
      selectedActionId.value = result.items[0]?.id ?? '';
    }
  } catch (error) {
    if (current === generation && projectId === props.project.id) {
      errorMessage.value = error instanceof Error
        ? error.message
        : 'Não foi possível carregar o catálogo.';
    }
  } finally {
    if (current === generation) loading.value = false;
  }
}

async function run(item: ProjectScript): Promise<void> {
  if (startingActionId.value || execution.value?.status === 'running') return;
  const projectId = props.project.id;
  const current = generation;

  if (
    item.risk !== 'read-only'
    && !window.confirm(`Executar a ação mutável “${item.name}”? O código do projeto será executado localmente.`)
  ) return;

  selectedActionId.value = item.id;
  startingActionId.value = item.id;
  const currentExecution = ++executionGeneration;
  errorMessage.value = '';

  try {
    const confirmation = item.risk === 'read-only'
      ? undefined
      : await prepareScriptExecution(projectId, item.id);
    const started = await startScriptExecution(projectId, item.id, confirmation?.token);
    execution.value = started;
    activeSection.value = 'executions';
    startingActionId.value = null;
    await followExecution(started, projectId, current, currentExecution);
    await loadHistory(projectId, current);
  } catch (error) {
    if (current === generation && currentExecution === executionGeneration) {
      errorMessage.value = error instanceof Error
        ? error.message
        : 'Não foi possível executar a ação.';
    }
  } finally {
    if (current === generation && currentExecution === executionGeneration) {
      startingActionId.value = null;
    }
  }
}

async function followExecution(
  initial: ScriptExecution,
  projectId: string,
  current: number,
  currentExecutionGeneration: number,
): Promise<void> {
  let currentExecution = initial;
  let reconnectDelay = 500;
  closeExecutionEvents?.();
  closeExecutionEvents = null;

  while (
    current === generation
    && currentExecutionGeneration === executionGeneration
    && projectId === props.project.id
  ) {
    const [recoveredExecution, recoveredLog] = await Promise.all([
      fetchScriptExecution(projectId, initial.id),
      fetchScriptExecutionLog(projectId, initial.id),
    ]);
    if (current !== generation || currentExecutionGeneration !== executionGeneration) return;

    currentExecution = recoveredExecution;
    execution.value = recoveredExecution;
    executionLog.value = recoveredLog.content;
    maskedLogEntries.value = recoveredLog.redactionCount;
    if (errorMessage.value === realtimeRecoveryMessage) errorMessage.value = '';
    if (currentExecution.status !== 'running') return;

    const stream = followScriptExecutionEvents(projectId, initial.id, (event) => {
      if (current !== generation || currentExecutionGeneration !== executionGeneration) return;
      if (event.type === 'state') {
        currentExecution = event.execution;
        execution.value = event.execution;
      } else {
        executionLog.value = event.log.content;
        maskedLogEntries.value = event.log.redactionCount;
      }
    });
    closeExecutionEvents = stream.close;

    try {
      await stream.done;
    } catch {
      if (current === generation && currentExecutionGeneration === executionGeneration) {
        errorMessage.value = realtimeRecoveryMessage;
      }
    }

    if (closeExecutionEvents === stream.close) closeExecutionEvents = null;
    if (currentExecution.status !== 'running') {
      const finalLog = await fetchScriptExecutionLog(projectId, initial.id);
      if (current === generation && currentExecutionGeneration === executionGeneration) {
        executionLog.value = finalLog.content;
        maskedLogEntries.value = finalLog.redactionCount;
      }
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, reconnectDelay));
    reconnectDelay = Math.min(reconnectDelay * 2, 5_000);
  }
}

async function restoreExecution(projectId: string, current: number): Promise<void> {
  const currentExecution = ++executionGeneration;
  try {
    const latest = await fetchLatestScriptExecution(projectId);
    if (
      current !== generation
      || currentExecution !== executionGeneration
      || projectId !== props.project.id
      || !latest
    ) return;
    execution.value = latest;
    await followExecution(latest, projectId, current, currentExecution);
  } catch (error) {
    if (current === generation && currentExecution === executionGeneration) {
      errorMessage.value = error instanceof Error
        ? error.message
        : 'Não foi possível recuperar a última execução.';
    }
  }
}

async function loadHistory(
  projectId = props.project.id,
  current = generation,
): Promise<void> {
  try {
    const result = await fetchScriptExecutionHistory(projectId);
    if (current === generation && projectId === props.project.id) history.value = result;
  } catch (error) {
    if (current === generation) {
      errorMessage.value = error instanceof Error
        ? error.message
        : 'Não foi possível carregar o histórico.';
    }
  }
}

async function selectHistory(item: ScriptExecution): Promise<void> {
  const currentExecution = ++executionGeneration;
  const current = generation;
  const projectId = props.project.id;
  execution.value = item;
  executionLog.value = '';
  maskedLogEntries.value = 0;
  activeSection.value = 'executions';
  await followExecution(item, projectId, current, currentExecution);
}

async function cancel(): Promise<void> {
  if (!execution.value) return;
  try {
    execution.value = await cancelScriptExecution(props.project.id, execution.value.id);
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : 'Não foi possível cancelar.';
  }
}

watch(() => props.project.id, () => {
  closeExecutionEvents?.();
  closeExecutionEvents = null;
  generation += 1;
  executionGeneration += 1;
  const current = generation;
  const projectId = props.project.id;
  catalog.value = null;
  history.value = null;
  execution.value = null;
  executionLog.value = '';
  maskedLogEntries.value = 0;
  startingActionId.value = null;
  selectedActionId.value = '';
  activeSection.value = 'overview';
  category.value = 'all';
  page.value = 1;
  hasObservedRunning = false;
  void load();
  void loadHistory(projectId, current);
  void restoreExecution(projectId, current);
}, { immediate: true });

watch([origin, risk], () => {
  page.value = 1;
  category.value = 'all';
  void load();
});

watch(search, () => {
  page.value = 1;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void load(), 250);
});

watch(execution, (exec) => {
  if (!exec) return;
  if (exec.status === 'running') {
    hasObservedRunning = true;
    return;
  }
  if (!hasObservedRunning) return;

  noticeCenterStore.publishTerminalNotice({
    origin: 'script',
    dedupeKey: `script:${exec.id}:${exec.status}`,
    outcome: exec.status,
    projectId: props.project.id,
    projectName: props.project.name,
    label: exec.actionName,
    routeTo: {
      name: 'project-scripts',
      params: { projectId: props.project.id },
    },
  });
});

onUnmounted(() => {
  closeExecutionEvents?.();
  closeExecutionEvents = null;
  generation += 1;
  executionGeneration += 1;
  if (searchTimer) clearTimeout(searchTimer);
  if (copiedTimer) clearTimeout(copiedTimer);
});
</script>

<template>
  <section class="scripts-explorer" aria-labelledby="scripts-explorer-title">
    <header class="scripts-explorer-header">
      <div class="scripts-explorer-heading">
        <span class="scripts-explorer-breadcrumb">Projeto / Scripts</span>
        <h3 id="scripts-explorer-title">{{ sectionTitle }}</h3>
        <p>{{ sectionDescription }}</p>
      </div>

      <div class="scripts-explorer-header-actions">
        <label class="scripts-explorer-global-search">
          <MagnifyingGlassIcon aria-hidden="true" />
          <input
            v-model="search"
            type="search"
            placeholder="Buscar por nome, descrição ou comando…"
            aria-label="Buscar scripts"
          >
          <kbd>⌘K</kbd>
        </label>

        <button
          class="scripts-explorer-refresh"
          type="button"
          :disabled="isRefreshing"
          @click="load"
        >
          <ArrowPathIcon aria-hidden="true" :class="{ 'is-spinning': isRefreshing }" />
          {{ isRefreshing ? 'Atualizando…' : 'Atualizar' }}
        </button>
      </div>
    </header>

    <nav class="scripts-explorer-tabs" role="tablist" aria-label="Seções de scripts e tarefas">
      <button
        v-for="tab in sectionTabs"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="activeSection === tab.id"
        :class="{ active: activeSection === tab.id }"
        @click="selectSection(tab.id)"
      >
        <component :is="tab.icon" aria-hidden="true" />
        {{ tab.label }}
      </button>
    </nav>

    <div v-if="errorMessage" class="scripts-explorer-alert" role="alert">
      {{ errorMessage }}
    </div>

    <aside v-if="execution" class="scripts-execution-strip" aria-live="polite">
      <span class="scripts-execution-strip-icon" :class="`is-${execution.status}`">
        <component :is="executionIcon(execution.status)" aria-hidden="true" />
      </span>
      <div>
        <strong>{{ execution.actionName }} · {{ executionStatusLabels[execution.status] }}</strong>
        <span>
          {{ formatDate(execution.startedAt) }}
          <template v-if="execution.finishedAt"> · {{ executionDuration(execution) }}</template>
        </span>
      </div>
      <StatusBadge :tone="executionTone(execution.status)">
        {{ executionStatusLabels[execution.status] }}
      </StatusBadge>
      <button type="button" @click="selectSection('executions')">
        Ver execução
      </button>
    </aside>

    <section v-if="activeSection === 'overview'" class="scripts-section scripts-overview" role="tabpanel">
      <div class="scripts-metrics-grid">
        <article class="scripts-metric-card">
          <span><CommandLineIcon aria-hidden="true" /></span>
          <div>
            <small>Scripts reconhecidos</small>
            <strong>{{ catalog?.total ?? 0 }}</strong>
            <p>ações no catálogo</p>
          </div>
        </article>

        <article class="scripts-metric-card">
          <span><ShieldCheckIcon aria-hidden="true" /></span>
          <div>
            <small>Somente leitura</small>
            <strong>{{ riskCounts['read-only'] }}</strong>
            <p>na página atual</p>
          </div>
        </article>

        <article class="scripts-metric-card">
          <span><ClockIcon aria-hidden="true" /></span>
          <div>
            <small>Execuções registradas</small>
            <strong>{{ history?.total ?? 0 }}</strong>
            <p>histórico recente</p>
          </div>
        </article>

        <article class="scripts-metric-card" :class="{ 'is-warning': latestExecution?.status === 'failed' }">
          <span><CheckCircleIcon aria-hidden="true" /></span>
          <div>
            <small>Taxa de sucesso</small>
            <strong>{{ successRate }}%</strong>
            <p>{{ completedExecutions.length }} concluídas avaliadas</p>
          </div>
        </article>
      </div>

      <div class="scripts-overview-grid">
        <section class="scripts-overview-block scripts-overview-catalog">
          <header class="scripts-block-heading">
            <div>
              <CommandLineIcon aria-hidden="true" />
              <h4>Catálogo</h4>
            </div>
            <button type="button" @click="selectSection('catalog')">
              Ver todos
            </button>
          </header>

          <div v-if="loading && !catalog" class="scripts-empty-state">
            Carregando catálogo…
          </div>

          <div v-else class="scripts-list scripts-list-preview">
            <article
              v-for="item in catalog?.items.slice(0, 4) ?? []"
              :key="item.id"
              class="script-card"
              @click="selectScript(item)"
            >
              <header>
                <div>
                  <span>{{ originLabels[item.origin] }}</span>
                  <h4>{{ item.name }}</h4>
                </div>
                <StatusBadge :tone="riskToneFor(item.risk)">
                  {{ riskLabels[item.risk] }}
                </StatusBadge>
              </header>
              <p>{{ item.description }}</p>
              <code>{{ item.command }}</code>
              <footer>
                <button type="button" @click.stop="run(item)">
                  <PlayIcon aria-hidden="true" />
                  {{ startingActionId === item.id ? 'Iniciando…' : 'Executar' }}
                </button>
              </footer>
            </article>
          </div>
        </section>

        <section class="scripts-overview-block">
          <header class="scripts-block-heading">
            <div>
              <ClockIcon aria-hidden="true" />
              <h4>Execuções recentes</h4>
            </div>
            <button type="button" @click="selectSection('executions')">
              Ver histórico
            </button>
          </header>

          <div v-if="!history?.items.length" class="scripts-empty-state scripts-empty-state-compact">
            Nenhuma execução registrada.
          </div>

          <ul v-else class="scripts-history-preview">
            <li v-for="item in history.items.slice(0, 6)" :key="item.id">
              <button type="button" @click="selectHistory(item)">
                <span :class="`is-${item.status}`">
                  <component :is="executionIcon(item.status)" aria-hidden="true" />
                </span>
                <span>
                  <strong>{{ item.actionName }}</strong>
                  <small>{{ formatDate(item.startedAt) }}</small>
                </span>
                <StatusBadge :tone="executionTone(item.status)">
                  {{ executionStatusLabels[item.status] }}
                </StatusBadge>
              </button>
            </li>
          </ul>
        </section>

        <aside class="scripts-risk-guide">
          <ShieldCheckIcon aria-hidden="true" />
          <div>
            <strong>Execução proporcional ao risco</strong>
            <p>
              Scripts somente leitura executam diretamente. Ações mutáveis pedem confirmação,
              e operações destrutivas permanecem bloqueadas quando não são seguras.
            </p>
          </div>
          <button type="button" @click="risk = 'read-only'; selectSection('catalog')">
            Ver ações seguras
          </button>
        </aside>
      </div>
    </section>

    <section v-else-if="activeSection === 'catalog'" class="scripts-section" role="tabpanel">
      <div class="scripts-catalog-layout">
        <aside class="scripts-catalog-sidebar">
          <section>
            <header>
              <h4>Categorias</h4>
            </header>
            <nav aria-label="Categorias de scripts">
              <button
                v-for="categoryId in categoryIds"
                :key="categoryId"
                type="button"
                :class="{ active: category === categoryId }"
                @click="category = categoryId"
              >
                <component :is="categoryIcon(categoryId)" aria-hidden="true" />
                <span>{{ categoryLabels[categoryId] }}</span>
                <strong>{{ categoryCounts[categoryId] }}</strong>
              </button>
            </nav>
          </section>

          <section class="scripts-risk-summary">
            <header><h4>Risco nesta página</h4></header>
            <dl>
              <div><dt><span class="is-safe"></span>Somente leitura</dt><dd>{{ riskCounts['read-only'] }}</dd></div>
              <div><dt><span class="is-warning"></span>Mutáveis</dt><dd>{{ riskCounts.mutable }}</dd></div>
              <div><dt><span class="is-danger"></span>Destrutivos</dt><dd>{{ riskCounts.destructive }}</dd></div>
            </dl>
          </section>
        </aside>

        <div class="scripts-catalog-main">
          <div class="scripts-catalog-toolbar">
            <label>
              <MagnifyingGlassIcon aria-hidden="true" />
              <input v-model="search" type="search" placeholder="Buscar no catálogo…" aria-label="Buscar no catálogo">
            </label>
            <select v-model="origin" aria-label="Filtrar por origem">
              <option value="">Todas as origens</option>
              <option value="package-script">package.json</option>
              <option value="rails-task">Tarefas Rails</option>
              <option value="bin">Executáveis bin/</option>
            </select>
            <select v-model="risk" aria-label="Filtrar por risco">
              <option value="">Todos os riscos</option>
              <option value="read-only">Somente leitura</option>
              <option value="mutable">Mutável</option>
              <option value="destructive">Destrutivo</option>
            </select>
          </div>

          <div v-if="loading && !catalog" class="scripts-empty-state">
            Carregando catálogo…
          </div>

          <div v-else-if="visibleScripts.length === 0" class="scripts-empty-state">
            <strong>Nenhuma ação encontrada</strong>
            <span>Ajuste os filtros ou confirme se o projeto possui scripts reconhecidos.</span>
          </div>

          <div v-else class="scripts-list">
            <article
              v-for="item in visibleScripts"
              :key="item.id"
              class="script-card"
              :class="{ active: selectedScript?.id === item.id }"
              @click="selectedActionId = item.id"
            >
              <header>
                <div>
                  <span>{{ originLabels[item.origin] }}</span>
                  <h4>{{ item.name }}</h4>
                </div>
                <StatusBadge :tone="riskToneFor(item.risk)">
                  {{ riskLabels[item.risk] }}
                </StatusBadge>
              </header>
              <p>{{ item.description }}</p>
              <code>{{ item.command }}</code>
              <footer>
                <small v-if="!item.enabled">
                  Ação destrutiva bloqueada
                </small>
                <button
                  type="button"
                  :disabled="!item.enabled || startingActionId !== null || execution?.status === 'running'"
                  @click.stop="run(item)"
                >
                  <PlayIcon aria-hidden="true" />
                  {{ startingActionId === item.id ? 'Iniciando…' : 'Executar' }}
                </button>
              </footer>
            </article>
          </div>

          <nav v-if="catalog && catalog.totalPages > 1" class="scripts-pagination">
            <button type="button" :disabled="page <= 1" @click="page -= 1; load()">
              Anterior
            </button>
            <span>Página {{ catalog.page }} de {{ catalog.totalPages }} · {{ catalog.total }} itens</span>
            <button type="button" :disabled="page >= catalog.totalPages" @click="page += 1; load()">
              Próxima
            </button>
          </nav>
        </div>

        <aside v-if="selectedScript" class="scripts-detail-panel">
          <header>
            <div>
              <span>{{ originLabels[selectedScript.origin] }}</span>
              <h4>{{ selectedScript.name }}</h4>
            </div>
            <StatusBadge :tone="riskToneFor(selectedScript.risk)">
              {{ riskLabels[selectedScript.risk] }}
            </StatusBadge>
          </header>

          <section>
            <h5>Detalhes do script</h5>
            <dl>
              <div><dt>Origem</dt><dd>{{ originLabels[selectedScript.origin] }}</dd></div>
              <div><dt>Categoria</dt><dd>{{ categoryLabels[categoryFor(selectedScript)] }}</dd></div>
              <div><dt>Risco</dt><dd>{{ riskLabels[selectedScript.risk] }}</dd></div>
              <div><dt>Disponibilidade</dt><dd>{{ selectedScript.enabled ? 'Disponível' : 'Bloqueado' }}</dd></div>
            </dl>
          </section>

          <section>
            <h5>Comando</h5>
            <div class="scripts-command-box">
              <code>{{ selectedScript.command }}</code>
              <button type="button" @click="copyCommand(selectedScript)">
                <ClipboardDocumentIcon aria-hidden="true" />
                {{ copiedActionId === selectedScript.id ? 'Copiado' : 'Copiar' }}
              </button>
            </div>
          </section>

          <section>
            <h5>Descrição</h5>
            <p>{{ selectedScript.description }}</p>
          </section>

          <button
            class="scripts-primary-action"
            type="button"
            :disabled="!selectedScript.enabled || startingActionId !== null || execution?.status === 'running'"
            @click="run(selectedScript)"
          >
            <PlayIcon aria-hidden="true" />
            {{ startingActionId === selectedScript.id ? 'Iniciando…' : 'Executar script' }}
          </button>

          <aside v-if="selectedScript.risk !== 'read-only'" class="scripts-risk-notice">
            <ExclamationTriangleIcon aria-hidden="true" />
            <span>Esta ação pedirá confirmação antes de executar código localmente.</span>
          </aside>
        </aside>
      </div>
    </section>

    <section v-else class="scripts-section" role="tabpanel">
      <div class="scripts-executions-layout">
        <aside class="scripts-history-panel">
          <header>
            <div>
              <h4>Histórico</h4>
              <span>{{ history?.total ?? 0 }}</span>
            </div>
          </header>

          <div v-if="!history?.items.length" class="scripts-empty-state">
            Nenhuma execução registrada.
          </div>

          <div v-else class="scripts-history-list">
            <button
              v-for="item in history.items"
              :key="item.id"
              type="button"
              :class="{ active: execution?.id === item.id }"
              :disabled="execution?.status === 'running' && execution.id !== item.id"
              @click="selectHistory(item)"
            >
              <span class="scripts-history-icon" :class="`is-${item.status}`">
                <component :is="executionIcon(item.status)" aria-hidden="true" />
              </span>
              <span>
                <strong>{{ item.actionName }}</strong>
                <small>{{ formatDate(item.startedAt) }}</small>
              </span>
              <StatusBadge :tone="executionTone(item.status)">
                {{ executionStatusLabels[item.status] }}
              </StatusBadge>
            </button>
          </div>
        </aside>

        <article v-if="execution" class="scripts-execution-detail">
          <header>
            <div>
              <span class="scripts-execution-detail-icon" :class="`is-${execution.status}`">
                <component :is="executionIcon(execution.status)" aria-hidden="true" />
              </span>
              <div>
                <h4>{{ execution.actionName }}</h4>
                <p>{{ executionStatusLabels[execution.status] }}</p>
              </div>
            </div>
            <StatusBadge :tone="executionTone(execution.status)">
              {{ executionStatusLabels[execution.status] }}
            </StatusBadge>
          </header>

          <dl class="scripts-execution-metadata">
            <div><dt>Início</dt><dd>{{ formatDate(execution.startedAt) }}</dd></div>
            <div><dt>Fim</dt><dd>{{ formatDate(execution.finishedAt) }}</dd></div>
            <div><dt>Duração</dt><dd>{{ executionDuration(execution) }}</dd></div>
            <div><dt>Exit code</dt><dd>{{ execution.exitCode ?? '—' }}</dd></div>
          </dl>

          <div class="scripts-execution-actions">
            <button
              v-if="execution.status === 'running'"
              type="button"
              class="is-danger"
              @click="cancel"
            >
              <StopCircleIcon aria-hidden="true" />
              Cancelar execução
            </button>
            <button
              v-else-if="selectedScript && selectedScript.enabled"
              type="button"
              @click="run(selectedScript)"
            >
              <PlayIcon aria-hidden="true" />
              Executar novamente
            </button>
          </div>

          <section class="scripts-log-panel">
            <header>
              <div>
                <CommandLineIcon aria-hidden="true" />
                <h5>Saída da execução</h5>
              </div>
              <span v-if="maskedLogEntries">
                {{ maskedLogEntries }} ocorrência(s) sensível(is) mascarada(s)
              </span>
            </header>
            <pre>{{ executionLog || 'A execução ainda não produziu saída.' }}</pre>
          </section>
        </article>

        <div v-else class="scripts-empty-state scripts-execution-empty">
          <ClockIcon aria-hidden="true" />
          <strong>Nenhuma execução selecionada</strong>
          <span>Execute um script ou selecione um item do histórico.</span>
          <button type="button" @click="selectSection('catalog')">
            Abrir catálogo
          </button>
        </div>
      </div>
    </section>
  </section>
</template>
