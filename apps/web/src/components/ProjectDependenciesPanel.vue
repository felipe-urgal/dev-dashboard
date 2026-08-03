<script setup lang="ts">
import {
  computed,
  ref,
  watch,
} from 'vue';
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  CommandLineIcon,
  CubeIcon,
  ExclamationTriangleIcon,
  PlayIcon,
  StopCircleIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';

import type {
  Project,
  ProjectScript,
  ProjectScriptCatalog,
  ScriptExecutionStatus,
} from '@dev-dashboard/contracts';

import { fetchProjectScripts } from '../api';
import {
  formatScriptExecutionDate,
  scriptExecutionDuration,
  scriptExecutionStatusLabels,
} from '../composables/useProjectScriptsPanel';
import { useScriptExecution } from '../composables/useScriptExecution';
import { projectScriptDestination } from '../utils/project-script-visibility';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project }>();

const catalog = ref<ProjectScriptCatalog | null>(null);
const loading = ref(false);
const errorMessage = ref('');
const activeSection = ref<'actions' | 'execution'>('actions');
const selectedActionId = ref('');
let generation = 0;

const {
  execution,
  history,
  executionLog,
  maskedLogEntries,
  startingActionId,
  run,
  selectHistory,
  cancel,
} = useScriptExecution(
  () => props.project,
  activeSection,
  selectedActionId,
  'execution',
  errorMessage,
);

const actions = computed(() =>
  (catalog.value?.items ?? []).filter(
    (item) => projectScriptDestination(item, props.project) === 'dependencies',
  ),
);

const railsActions = computed(() =>
  actions.value.filter((item) => item.origin === 'bundler'),
);

const nodeActions = computed(() =>
  actions.value.filter((item) =>
    item.origin === 'package-manager'
    || (item.origin === 'package-script' && item.id === 'package-script:build'),
  ),
);

const actionIds = computed(() => new Set(actions.value.map((item) => item.id)));
const currentExecution = computed(() =>
  execution.value && actionIds.value.has(execution.value.actionId)
    ? execution.value
    : null,
);
const relevantHistory = computed(() =>
  (history.value?.items ?? []).filter((item) => actionIds.value.has(item.actionId)),
);
const currentAction = computed(() =>
  actions.value.find((item) => item.id === currentExecution.value?.actionId) ?? null,
);

function executionTone(
  status: ScriptExecutionStatus,
): 'info' | 'success' | 'danger' | 'warning' {
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

async function load(): Promise<void> {
  const current = ++generation;
  loading.value = true;
  errorMessage.value = '';
  try {
    const query = new URLSearchParams({ page: '1', pageSize: '100' });
    const result = await fetchProjectScripts(props.project.id, query);
    if (current !== generation) return;
    catalog.value = result;
    if (!result.items.some((item) => item.id === selectedActionId.value)) {
      selectedActionId.value = result.items[0]?.id ?? '';
    }
  } catch (error) {
    if (current === generation) {
      errorMessage.value = error instanceof Error
        ? error.message
        : 'Não foi possível carregar dependências e builds.';
    }
  } finally {
    if (current === generation) loading.value = false;
  }
}

function execute(item: ProjectScript): void {
  selectedActionId.value = item.id;
  void run(item);
}

function rerun(): void {
  if (currentAction.value) void run(currentAction.value);
}

watch(
  () => props.project.id,
  () => {
    catalog.value = null;
    selectedActionId.value = '';
    activeSection.value = 'actions';
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <section class="dependencies-panel" aria-labelledby="dependencies-title" :aria-busy="loading">
    <header class="dependencies-header">
      <div>
        <span>Projeto / Dependências</span>
        <h3 id="dependencies-title">Dependências e build</h3>
        <p>Atualize o ambiente e gere o build usando apenas comandos detectados no projeto.</p>
      </div>
      <button type="button" :disabled="loading" @click="load">
        <ArrowPathIcon aria-hidden="true" :class="{ 'is-spinning': loading }" />
        {{ loading ? 'Atualizando…' : 'Atualizar' }}
      </button>
    </header>

    <div v-if="errorMessage" class="dependencies-alert" role="alert">
      {{ errorMessage }}
    </div>

    <div v-if="loading && !catalog" class="dependencies-empty" role="status">
      Detectando gerenciadores e ações disponíveis…
    </div>

    <div v-else class="dependencies-layout">
      <div class="dependencies-actions">
        <section v-if="railsActions.length" class="dependencies-group">
          <header>
            <span class="dependencies-group-icon"><CubeIcon aria-hidden="true" /></span>
            <div>
              <h4>Ruby / Bundler</h4>
              <p>Verifique, instale ou atualize as gems do projeto.</p>
            </div>
          </header>

          <article
            v-for="item in railsActions"
            :key="item.id"
            class="dependencies-action-card"
          >
            <div>
              <strong>{{ item.name }}</strong>
              <p>{{ item.description }}</p>
              <code>{{ item.command }}</code>
              <small v-if="item.id === 'bundler:update'" class="dependencies-warning">
                <ExclamationTriangleIcon aria-hidden="true" />
                Pode alterar o Gemfile.lock.
              </small>
            </div>
            <button
              type="button"
              :disabled="!item.enabled || startingActionId !== null || execution?.status === 'running'"
              @click="execute(item)"
            >
              <PlayIcon aria-hidden="true" />
              {{ startingActionId === item.id ? 'Iniciando…' : 'Executar' }}
            </button>
          </article>
        </section>

        <section v-if="nodeActions.length" class="dependencies-group">
          <header>
            <span class="dependencies-group-icon"><CommandLineIcon aria-hidden="true" /></span>
            <div>
              <h4>Node / Frontend</h4>
              <p>Use o lockfile detectado para instalar dependências e gerar o build.</p>
            </div>
          </header>

          <article
            v-for="item in nodeActions"
            :key="item.id"
            class="dependencies-action-card"
          >
            <div>
              <strong>{{ item.name }}</strong>
              <p>{{ item.description }}</p>
              <code>{{ item.command }}</code>
            </div>
            <button
              type="button"
              :disabled="!item.enabled || startingActionId !== null || execution?.status === 'running'"
              @click="execute(item)"
            >
              <PlayIcon aria-hidden="true" />
              {{ startingActionId === item.id ? 'Iniciando…' : 'Executar' }}
            </button>
          </article>
        </section>

        <div v-if="actions.length === 0" class="dependencies-empty">
          <strong>Nenhuma ação disponível</strong>
          <span>O projeto precisa ter Gemfile, um lockfile Node ou o script build no package.json.</span>
        </div>
      </div>

      <aside class="dependencies-execution" aria-label="Detalhes da execução">
        <template v-if="currentExecution">
          <header class="dependencies-execution-header">
            <div class="dependencies-execution-title">
              <span :class="`is-${currentExecution.status}`">
                <component :is="executionIcon(currentExecution.status)" aria-hidden="true" />
              </span>
              <div>
                <small>Última execução</small>
                <h4>{{ currentExecution.actionName }}</h4>
              </div>
            </div>
            <StatusBadge :tone="executionTone(currentExecution.status)">
              {{ scriptExecutionStatusLabels[currentExecution.status] }}
            </StatusBadge>
          </header>

          <dl>
            <div><dt>Início</dt><dd>{{ formatScriptExecutionDate(currentExecution.startedAt) }}</dd></div>
            <div><dt>Duração</dt><dd>{{ scriptExecutionDuration(currentExecution) }}</dd></div>
            <div><dt>Exit code</dt><dd>{{ currentExecution.exitCode ?? '—' }}</dd></div>
          </dl>

          <div class="dependencies-execution-actions">
            <button
              v-if="currentExecution.status === 'running'"
              type="button"
              class="is-danger"
              @click="cancel"
            >
              <StopCircleIcon aria-hidden="true" />
              Cancelar
            </button>
            <button v-else-if="currentAction" type="button" @click="rerun">
              <PlayIcon aria-hidden="true" />
              Executar novamente
            </button>
          </div>

          <section class="dependencies-log" aria-label="Saída da execução">
            <header>
              <span><CommandLineIcon aria-hidden="true" /> Saída</span>
              <small v-if="maskedLogEntries">{{ maskedLogEntries }} item(ns) mascarado(s)</small>
            </header>
            <pre>{{ executionLog || 'A execução ainda não produziu saída.' }}</pre>
          </section>
        </template>

        <div v-else class="dependencies-empty dependencies-execution-empty">
          <ClockIcon aria-hidden="true" />
          <strong>Nenhuma execução selecionada</strong>
          <span>Execute uma ação para acompanhar status, duração e saída.</span>
        </div>

        <section v-if="relevantHistory.length" class="dependencies-history">
          <h5>Histórico recente</h5>
          <button
            v-for="item in relevantHistory.slice(0, 5)"
            :key="item.id"
            type="button"
            @click="selectHistory(item)"
          >
            <component :is="executionIcon(item.status)" aria-hidden="true" />
            <span><strong>{{ item.actionName }}</strong><small>{{ formatScriptExecutionDate(item.startedAt) }}</small></span>
            <StatusBadge :tone="executionTone(item.status)">{{ scriptExecutionStatusLabels[item.status] }}</StatusBadge>
          </button>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped src="./ProjectDependenciesPanel.css"></style>
