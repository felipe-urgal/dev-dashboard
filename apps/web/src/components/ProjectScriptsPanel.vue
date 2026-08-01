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
  StopCircleIcon,
  WrenchScrewdriverIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';

import type {
  Project,
  ProjectScript,
  ProjectScriptOrigin,
  ProjectScriptRisk,
  ScriptExecution,
  ScriptExecutionStatus,
} from '@dev-dashboard/contracts';

import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useScriptCatalog } from '../composables/useScriptCatalog';
import { useScriptExecution } from '../composables/useScriptExecution';
import { isRunnableProjectScript } from '../utils/project-script-visibility';
import { riskToneFor } from '../utils/status-tones';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project }>();

type ScriptSection = 'catalog' | 'executions';
type ScriptCategory = 'all' | 'build' | 'development' | 'tests' | 'maintenance' | 'deploy' | 'utilities';

const activeSection = ref<ScriptSection>('catalog');
const category = ref<ScriptCategory>('all');
const copiedActionId = ref('');
const errorMessage = ref('');

const {
  catalog,
  loading,
  search,
  origin,
  risk,
  page,
  selectedActionId,
  load,
} = useScriptCatalog(() => props.project, activeSection, 'catalog', errorMessage);

const {
  execution,
  history,
  executionLog,
  maskedLogEntries,
  startingActionId,
  run,
  loadHistory,
  selectHistory,
  cancel,
} = useScriptExecution(() => props.project, activeSection, selectedActionId, 'executions', errorMessage);

useAutoDismiss(errorMessage, '');

let copiedTimer: ReturnType<typeof setTimeout> | null = null;

watch([origin, risk], () => {
  category.value = 'all';
});

watch(() => props.project.id, () => {
  activeSection.value = 'catalog';
  category.value = 'all';
});

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
  { id: 'catalog' as const, label: 'Catálogo', icon: CommandLineIcon },
  { id: 'executions' as const, label: 'Execuções', icon: ClockIcon },
];

const realtimeRecoveryMessage = 'A conexão em tempo real foi interrompida. Recuperando o estado atual…';

const sectionTitle = computed(() => ({
  catalog: 'Catálogo de scripts',
  executions: 'Execuções',
})[activeSection.value]);

const sectionDescription = computed(() => ({
  catalog: 'Execute somente as tarefas que não pertencem a Servidor, Testes ou Banco de dados.',
  executions: 'Acompanhe o processo ativo, consulte logs e revise o histórico.',
})[activeSection.value]);

const catalogScripts = computed(() =>
  (catalog.value?.items ?? []).filter((item) => isRunnableProjectScript(item, props.project)),
);

const delegatedScriptsCount = computed(() =>
  (catalog.value?.items.length ?? 0) - catalogScripts.value.length,
);

const selectedScript = computed<ProjectScript | null>(() =>
  catalogScripts.value.find((item) => item.id === selectedActionId.value)
  ?? catalogScripts.value[0]
  ?? null,
);

const visibleScripts = computed(() => {
  const items = catalogScripts.value;
  if (category.value === 'all') return items;
  return items.filter((item) => categoryFor(item) === category.value);
});

const categoryCounts = computed(() => {
  const counts: Record<ScriptCategory, number> = {
    all: catalogScripts.value.length,
    build: 0,
    development: 0,
    tests: 0,
    maintenance: 0,
    deploy: 0,
    utilities: 0,
  };

  for (const item of catalogScripts.value) {
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
  for (const item of catalogScripts.value) counts[item.risk] += 1;
  return counts;
});

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

onUnmounted(() => {
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

    <section v-if="activeSection === 'catalog'" class="scripts-section" role="tabpanel">
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

          <p v-if="delegatedScriptsCount > 0" class="scripts-catalog-note">
            {{ delegatedScriptsCount }}
            {{ delegatedScriptsCount === 1 ? 'comando foi direcionado' : 'comandos foram direcionados' }}
            para a área adequada ou ocultados por serem automáticos.
          </p>

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
