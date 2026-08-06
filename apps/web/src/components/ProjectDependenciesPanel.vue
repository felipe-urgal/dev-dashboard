<script setup lang="ts">
import { computed, ref, watch } from 'vue';
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
  actions.value.filter(
    (item) =>
      item.origin === 'package-manager' ||
      (item.origin === 'package-script' && item.id === 'package-script:build'),
  ),
);

const actionIds = computed(() => new Set(actions.value.map((item) => item.id)));
const currentExecution = computed(() =>
  execution.value && actionIds.value.has(execution.value.actionId)
    ? execution.value
    : null,
);
const relevantHistory = computed(() =>
  (history.value?.items ?? []).filter((item) =>
    actionIds.value.has(item.actionId),
  ),
);
const currentAction = computed(
  () =>
    actions.value.find(
      (item) => item.id === currentExecution.value?.actionId,
    ) ?? null,
);

const nodeManager = computed(() => {
  const command = nodeActions.value[0]?.command
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase();
  if (command === 'yarn') return 'Yarn';
  if (command === 'pnpm') return 'pnpm';
  if (command === 'bun') return 'Bun';
  if (command === 'npm') return 'npm';
  return 'Node';
});

function managerName(item: ProjectScript): string {
  return item.origin === 'bundler' ? 'Bundler' : nodeManager.value;
}

function managerClass(item: ProjectScript): string {
  return item.origin === 'bundler' ? 'is-ruby' : 'is-node';
}

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
      errorMessage.value =
        error instanceof Error
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
  <section
    class="dependencies-panel"
    aria-labelledby="dependencies-title"
    :aria-busy="loading"
  >
    <header class="dependencies-header">
      <div>
        <span>Projeto / Dependências</span>
        <h3 id="dependencies-title">Dependências e build</h3>
        <p>
          Atualize o ambiente e gere o build usando apenas comandos detectados
          no projeto.
        </p>
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

    <template v-else>
      <div
        v-if="actions.length"
        class="dependencies-manager-bar"
        aria-label="Gerenciadores detectados"
      >
        <article v-if="railsActions.length" class="dependencies-manager-card">
          <span class="dependencies-manager-icon"
            ><CubeIcon aria-hidden="true"
          /></span>
          <div>
            <strong>Ruby / Bundler</strong>
            <small>Gemfile e Gemfile.lock detectados</small>
          </div>
          <StatusBadge tone="success">Pronto</StatusBadge>
        </article>

        <article v-if="nodeActions.length" class="dependencies-manager-card">
          <span class="dependencies-manager-icon"
            ><CommandLineIcon aria-hidden="true"
          /></span>
          <div>
            <strong>Node / {{ nodeManager }}</strong>
            <small>Lockfile e script build detectados</small>
          </div>
          <StatusBadge tone="success">Pronto</StatusBadge>
        </article>

        <button
          type="button"
          class="dependencies-detect-button"
          :disabled="loading"
          @click="load"
        >
          <ArrowPathIcon aria-hidden="true" />
          Detectar novamente
        </button>
      </div>

      <div v-if="actions.length" class="dependencies-table-wrap">
        <table class="dependencies-table">
          <colgroup>
            <col class="dependencies-manager-column" />
            <col class="dependencies-action-column" />
            <col class="dependencies-command-column" />
            <col class="dependencies-button-column" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Gerenciador</th>
              <th scope="col">Ação</th>
              <th scope="col">Comando</th>
              <th scope="col"><span class="sr-only">Executar</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in actions" :key="item.id">
              <td data-label="Gerenciador">
                <span
                  class="dependencies-manager-name"
                  :class="managerClass(item)"
                >
                  <i aria-hidden="true"></i>
                  {{ managerName(item) }}
                </span>
              </td>
              <td data-label="Ação">
                <strong>{{ item.name }}</strong>
                <small>{{ item.description }}</small>
                <span
                  v-if="item.id === 'bundler:update'"
                  class="dependencies-warning"
                >
                  <ExclamationTriangleIcon aria-hidden="true" />
                  Pode alterar o Gemfile.lock.
                </span>
              </td>
              <td data-label="Comando">
                <code>{{ item.command }}</code>
              </td>
              <td class="dependencies-row-action">
                <button
                  type="button"
                  :disabled="
                    !item.enabled ||
                    startingActionId !== null ||
                    execution?.status === 'running'
                  "
                  @click="execute(item)"
                >
                  <PlayIcon aria-hidden="true" />
                  {{ startingActionId === item.id ? 'Iniciando…' : 'Executar' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="dependencies-empty">
        <strong>Nenhuma ação disponível</strong>
        <span
          >O projeto precisa ter Gemfile, um lockfile Node ou o script build no
          package.json.</span
        >
      </div>

      <section class="dependencies-console" aria-label="Detalhes da execução">
        <template v-if="currentExecution">
          <header class="dependencies-console-header">
            <div class="dependencies-console-title">
              <span :class="`is-${currentExecution.status}`">
                <component
                  :is="executionIcon(currentExecution.status)"
                  aria-hidden="true"
                />
              </span>
              <strong>{{ currentExecution.actionName }}</strong>
              <small>{{
                formatScriptExecutionDate(currentExecution.startedAt)
              }}</small>
              <small>{{ scriptExecutionDuration(currentExecution) }}</small>
              <small>exit {{ currentExecution.exitCode ?? '—' }}</small>
            </div>
            <div class="dependencies-console-actions">
              <StatusBadge :tone="executionTone(currentExecution.status)">
                {{ scriptExecutionStatusLabels[currentExecution.status] }}
              </StatusBadge>
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
          </header>

          <div class="dependencies-console-body">
            <pre><code>$ {{ currentAction?.command ?? currentExecution.actionName }}
{{ executionLog || 'A execução ainda não produziu saída.' }}</code></pre>

            <aside class="dependencies-history" aria-label="Execuções recentes">
              <header>
                <strong>Execuções recentes</strong>
                <small v-if="maskedLogEntries"
                  >{{ maskedLogEntries }} item(ns) mascarado(s)</small
                >
              </header>
              <button
                v-for="item in relevantHistory.slice(0, 5)"
                :key="item.id"
                type="button"
                @click="selectHistory(item)"
              >
                <component
                  :is="executionIcon(item.status)"
                  aria-hidden="true"
                />
                <span>
                  <strong>{{ item.actionName }}</strong>
                  <small
                    >{{ formatScriptExecutionDate(item.startedAt) }} ·
                    {{ scriptExecutionDuration(item) }}</small
                  >
                </span>
                <StatusBadge :tone="executionTone(item.status)">{{
                  scriptExecutionStatusLabels[item.status]
                }}</StatusBadge>
              </button>
              <span
                v-if="relevantHistory.length === 0"
                class="dependencies-history-empty"
              >
                Nenhuma execução recente.
              </span>
            </aside>
          </div>
        </template>

        <div v-else class="dependencies-empty dependencies-console-empty">
          <ClockIcon aria-hidden="true" />
          <strong>Nenhuma execução selecionada</strong>
          <span>Execute uma ação para acompanhar status, duração e saída.</span>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped src="./ProjectDependenciesPanel.css"></style>
