<script setup lang="ts">
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  CommandLineIcon,
  StopCircleIcon,
  TrashIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';

import type { Project, ScriptExecutionStatus } from '@dev-dashboard/contracts';

import {
  formatScriptExecutionDate,
  scriptExecutionDuration,
  useProjectScriptsPanel,
} from '../composables/useProjectScriptsPanel';
import { exportLogSnapshot } from '../utils/log-export';
import ProjectLogExperience from './ProjectLogExperience.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project }>();

const {
  execution,
  history,
  executionLog,
  executionLogSnapshot,
  maskedLogEntries,
  clearingHistory,
  selectHistory,
  cancel,
  clearHistory,
  errorMessage,
  executionStatusLabels,
} = useProjectScriptsPanel(() => props.project);

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

const formatDate = formatScriptExecutionDate;
const executionDuration = scriptExecutionDuration;

function handleExportLog(): void {
  const snapshot = executionLogSnapshot.value;
  if (!snapshot) return;

  exportLogSnapshot({
    projectName: props.project.name,
    origin: 'script',
    identifier: snapshot.executionId,
    snapshot,
  });
}
</script>

<template>
  <section class="scripts-explorer" aria-labelledby="scripts-explorer-title">
    <header class="scripts-explorer-header">
      <div class="scripts-explorer-heading">
        <span class="scripts-explorer-breadcrumb">Projeto / Scripts</span>
        <h3 id="scripts-explorer-title">Execuções</h3>
        <p>Acompanhe o processo ativo, consulte logs e revise o histórico.</p>
      </div>
    </header>

    <div v-if="errorMessage" class="scripts-explorer-alert" role="alert">
      {{ errorMessage }}
    </div>

    <section class="scripts-section">
      <div class="scripts-executions-layout">
        <aside class="scripts-history-panel">
          <header>
            <div>
              <h4>Histórico</h4>
              <span>{{ history?.total ?? 0 }}</span>
            </div>
            <button
              v-if="(history?.total ?? 0) > 0"
              type="button"
              class="scripts-explorer-refresh"
              :disabled="clearingHistory"
              @click="clearHistory"
            >
              <TrashIcon aria-hidden="true" />
              {{ clearingHistory ? 'Limpando…' : 'Limpar histórico' }}
            </button>
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
              :disabled="
                execution?.status === 'running' && execution.id !== item.id
              "
              @click="selectHistory(item)"
            >
              <span class="scripts-history-icon" :class="`is-${item.status}`">
                <component
                  :is="executionIcon(item.status)"
                  aria-hidden="true"
                />
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
              <span
                class="scripts-execution-detail-icon"
                :class="`is-${execution.status}`"
              >
                <component
                  :is="executionIcon(execution.status)"
                  aria-hidden="true"
                />
              </span>
              <div>
                <h4>{{ execution.actionName }}</h4>
                <p>{{ executionStatusLabels[execution.status] }}</p>
                <span class="scripts-execution-summary"
                  >{{ execution.actionName }} ·
                  {{ executionStatusLabels[execution.status] }}</span
                >
              </div>
            </div>
            <StatusBadge :tone="executionTone(execution.status)">
              {{ executionStatusLabels[execution.status] }}
            </StatusBadge>
          </header>

          <dl class="scripts-execution-metadata">
            <div>
              <dt>Início</dt>
              <dd>{{ formatDate(execution.startedAt) }}</dd>
            </div>
            <div>
              <dt>Fim</dt>
              <dd>{{ formatDate(execution.finishedAt) }}</dd>
            </div>
            <div>
              <dt>Duração</dt>
              <dd>{{ executionDuration(execution) }}</dd>
            </div>
            <div>
              <dt>Exit code</dt>
              <dd>{{ execution.exitCode ?? '—' }}</dd>
            </div>
          </dl>

          <div
            v-if="execution.status === 'running'"
            class="scripts-execution-actions"
          >
            <button type="button" class="is-danger" @click="cancel">
              <StopCircleIcon aria-hidden="true" />
              Cancelar execução
            </button>
          </div>

          <section class="scripts-log-panel scripts-log-panel--experience">
            <header>
              <div>
                <CommandLineIcon aria-hidden="true" />
                <h5>Saída e diagnóstico</h5>
              </div>
              <button
                type="button"
                class="scripts-explorer-refresh"
                :disabled="!executionLogSnapshot?.content.trim()"
                @click="handleExportLog"
              >
                <ArrowDownTrayIcon aria-hidden="true" />
                Exportar log
              </button>
            </header>
            <ProjectLogExperience
              :content="executionLog"
              source="script"
              flow-label="Saída"
              :running="execution.status === 'running'"
              :masked-count="maskedLogEntries"
              empty-label="A execução ainda não produziu saída."
            />
          </section>
        </article>

        <div v-else class="scripts-empty-state scripts-execution-empty">
          <ClockIcon aria-hidden="true" />
          <strong>Nenhuma execução selecionada</strong>
          <span>Selecione um item do histórico.</span>
        </div>
      </div>
    </section>
  </section>
</template>
