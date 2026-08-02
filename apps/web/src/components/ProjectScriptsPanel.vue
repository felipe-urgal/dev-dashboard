<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  CommandLineIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  StopCircleIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';

import type {
  Project,
  ProjectScript,
  ScriptExecutionVariables,
  ScriptExecutionStatus,
} from '@dev-dashboard/contracts';

import {
  categoryFor,
  formatScriptExecutionDate,
  scriptExecutionDuration,
  useProjectScriptsPanel,
} from '../composables/useProjectScriptsPanel';
import { riskToneFor } from '../utils/status-tones';
import ProjectScriptCatalogCard from './ProjectScriptCatalogCard.vue';
import ProjectScriptCatalogSidebar from './ProjectScriptCatalogSidebar.vue';
import ProjectScriptExecutionStrip from './ProjectScriptExecutionStrip.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project }>();

const {
  catalog,
  loading,
  search,
  origin,
  risk,
  page,
  selectedActionId,
  load,
  execution,
  history,
  executionLog,
  maskedLogEntries,
  startingActionId,
  run,
  selectHistory,
  cancel,
  activeSection,
  category,
  copiedActionId,
  errorMessage,
  originLabels,
  riskLabels,
  executionStatusLabels,
  categoryLabels,
  sectionTitle,
  sectionDescription,
  delegatedScriptsCount,
  selectedScript,
  visibleScripts,
  categoryCounts,
  riskCounts,
  isRefreshing,
  selectSection,
  copyCommand,
} = useProjectScriptsPanel(() => props.project);

const sectionTabs = [
  { id: 'catalog' as const, label: 'Catálogo', icon: CommandLineIcon },
  { id: 'executions' as const, label: 'Execuções', icon: ClockIcon },
];

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

const formatDate = formatScriptExecutionDate;
const executionDuration = scriptExecutionDuration;
const variableValues = ref<ScriptExecutionVariables>({});

watch(() => selectedScript.value?.id, () => {
  variableValues.value = {};
});

const selectedVariables = computed(() => selectedScript.value?.variables ?? []);
const variablesValid = computed(() => selectedVariables.value.every(
  (variable) => !variable.required || Boolean(variableValues.value[variable.name]),
));
const commandPreview = computed(() => {
  const selected = selectedScript.value;
  if (!selected) return '';
  const values = selectedVariables.value.flatMap((variable) => {
    const value = variableValues.value[variable.name];
    return value ? [`${variable.name}=${JSON.stringify(value)}`] : [];
  });
  return [selected.command.replace(/(?:\s+[A-Z][A-Z0-9_]*=…)+$/, ''), ...values].join(' ');
});

function requestRun(item: ProjectScript): void {
  selectedActionId.value = item.id;
  if (!item.variables?.length) void run(item);
}

function executeSelected(): void {
  if (selectedScript.value && variablesValid.value) {
    void run(selectedScript.value, variableValues.value);
  }
}
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

    <ProjectScriptExecutionStrip
      v-if="execution"
      :execution="execution"
      @open="selectSection('executions')"
    />

    <section v-if="activeSection === 'catalog'" class="scripts-section" role="tabpanel">
      <div class="scripts-catalog-layout">
        <ProjectScriptCatalogSidebar
          :category="category"
          :category-counts="categoryCounts"
          :risk-counts="riskCounts"
          @select="category = $event"
        />

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
            <ProjectScriptCatalogCard
              v-for="item in visibleScripts"
              :key="item.id"
              :item="item"
              :selected="selectedScript?.id === item.id"
              :disabled="startingActionId !== null || execution?.status === 'running'"
              :starting="startingActionId === item.id"
              @select="selectedActionId = item.id"
              @run="requestRun(item)"
            />
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
              <code>{{ commandPreview }}</code>
              <button type="button" @click="copyCommand(selectedScript, commandPreview)">
                <ClipboardDocumentIcon aria-hidden="true" />
                {{ copiedActionId === selectedScript.id ? 'Copiado' : 'Copiar' }}
              </button>
            </div>
          </section>

          <section v-if="selectedVariables.length" class="scripts-variables-form">
            <h5>Variáveis da tarefa</h5>
            <p>Os campos foram detectados estaticamente no arquivo Rake e serão enviados pelo ambiente do processo.</p>
            <label v-for="variable in selectedVariables" :key="variable.name">
              <span>
                <strong>{{ variable.name }}</strong>
                <small>{{ variable.required ? 'Obrigatória' : 'Opcional' }}</small>
              </span>
              <input
                v-model="variableValues[variable.name]"
                type="text"
                maxlength="4096"
                :required="variable.required"
                :placeholder="variable.placeholder ?? (variable.defaultValue ? `Padrão: ${variable.defaultValue}` : 'Valor')"
              >
              <small v-if="variable.defaultValue">Se vazio, a tarefa usa {{ variable.defaultValue }}.</small>
            </label>
          </section>

          <section>
            <h5>Descrição</h5>
            <p>{{ selectedScript.description }}</p>
          </section>

          <button
            class="scripts-primary-action"
            type="button"
            :disabled="!selectedScript.enabled || !variablesValid || startingActionId !== null || execution?.status === 'running'"
            @click="executeSelected"
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
              v-else-if="selectedScript && selectedScript.enabled && !selectedScript.variables?.length"
              type="button"
              @click="run(selectedScript)"
            >
              <PlayIcon aria-hidden="true" />
              Executar novamente
            </button>
            <button
              v-else-if="selectedScript && selectedScript.enabled"
              type="button"
              @click="selectSection('catalog')"
            >
              <PlayIcon aria-hidden="true" />
              Preencher e executar novamente
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
