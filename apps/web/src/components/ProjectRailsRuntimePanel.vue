<script setup lang="ts">
import {
  ArrowPathIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  PlayIcon,
  StopIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

import type { Project, RailsWorkerId } from '@dev-dashboard/contracts';

import { ref, watch } from 'vue';

import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useProjectRailsWorker } from '../composables/useProjectRailsWorker';
import { processToneFor } from '../utils/status-tones';
import Card from './Card.vue';
import ProjectLogTerminal from './ProjectLogTerminal.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project; workerId: RailsWorkerId }>();

const worker = useProjectRailsWorker(
  () => props.project,
  props.workerId,
  props.workerId === 'sidekiq',
);

useAutoDismiss(worker.errorMessage, '');

watch(
  () =>
    [props.project.id, worker.detected.value, worker.canStop.value] as const,
  ([, detected, canFollowLogs]) => {
    if (detected && canFollowLogs) {
      worker.startLogStream();
    } else if (!canFollowLogs) {
      worker.stopLogStream();
    }
  },
);

const workerLabels: Record<RailsWorkerId, string> = {
  sidekiq: 'Sidekiq',
  webpack: 'webpack-dev-server',
};

const supportsRestart = props.workerId === 'sidekiq';
const logMaximized = ref(false);

function toggleLogMaximized(): void {
  logMaximized.value = !logMaximized.value;
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('pt-BR');
}
</script>

<template>
  <div class="rails-runtime-panel">
    <section
      class="rails-worker-panel"
      :data-worker-id="workerId"
      aria-label="Estado do processo"
    >
      <Card class="rails-worker-card">
        <p
          v-if="worker.errorMessage.value"
          class="rails-worker-error"
          role="alert"
        >
          {{ worker.errorMessage.value }}
        </p>

        <p
          v-if="worker.loading.value && !worker.detected.value"
          class="rails-worker-empty"
        >
          Verificando se {{ workerLabels[workerId] }} está disponível no
          projeto…
        </p>

        <div
          v-else-if="!worker.detected.value"
          class="rails-worker-empty-state"
        >
          <strong>{{ workerLabels[workerId] }} não foi detectado.</strong>
          <p>
            O painel será habilitado automaticamente quando o projeto possuir a
            dependência ou o binstub correspondente.
          </p>
        </div>

        <template v-else>
          <section
            class="rails-worker-overview"
            aria-label="Estado do processo"
          >
            <div class="rails-worker-overview-main">
              <strong class="rails-worker-status-copy">
                {{
                  worker.canStop.value
                    ? 'Processo ativo e respondendo.'
                    : 'Processo parado.'
                }}
              </strong>
              <dl>
                <div>
                  <dt>Status</dt>
                  <dd>{{ worker.statusLabel.value }}</dd>
                </div>
                <div>
                  <dt>PID</dt>
                  <dd>{{ worker.managedProcess.value?.pid ?? '—' }}</dd>
                </div>
                <div>
                  <dt>Iniciado em</dt>
                  <dd>
                    {{ formatDate(worker.managedProcess.value?.startedAt) }}
                  </dd>
                </div>
                <div class="rails-worker-command">
                  <dt>Comando</dt>
                  <dd>
                    <code>{{
                      worker.managedProcess.value?.command ??
                      'Ainda não iniciado pelo dashboard'
                    }}</code>
                  </dd>
                </div>
              </dl>
            </div>

            <div class="rails-worker-actions">
              <button
                type="button"
                class="secondary-button"
                @click="worker.toggleLogs()"
              >
                Ver log
              </button>
              <button
                v-if="!worker.canStop.value"
                type="button"
                class="primary-button"
                :disabled="worker.currentAction.value !== null"
                @click="worker.start()"
              >
                <PlayIcon aria-hidden="true" />
                Iniciar
              </button>
              <button
                v-else
                type="button"
                class="secondary-button"
                :disabled="worker.currentAction.value !== null"
                @click="worker.stop()"
              >
                <StopIcon aria-hidden="true" />
                Parar
              </button>
              <button
                v-if="supportsRestart && worker.canStop.value"
                type="button"
                class="secondary-button"
                :disabled="worker.currentAction.value !== null"
                @click="worker.restart()"
              >
                <ArrowPathIcon aria-hidden="true" />
                Reiniciar
              </button>
            </div>
          </section>

          <section
            v-if="worker.logsVisible.value"
            class="rails-log-panel"
            :class="{ 'rails-log-panel-expanded': logMaximized }"
            :aria-labelledby="`rails-log-title-${workerId}`"
          >
            <header class="rails-log-panel-header">
              <div>
                <span>Log do processo</span>
                <h3 :id="`rails-log-title-${workerId}`">
                  Log do {{ workerLabels[workerId] }}
                </h3>
              </div>
              <div class="rails-log-panel-actions">
                <button
                  type="button"
                  class="rails-log-panel-button"
                  :aria-label="logMaximized ? 'Restaurar log' : 'Expandir log'"
                  @click="toggleLogMaximized"
                >
                  <ArrowsPointingInIcon
                    v-if="logMaximized"
                    aria-hidden="true"
                  />
                  <ArrowsPointingOutIcon v-else aria-hidden="true" />
                  {{ logMaximized ? 'Restaurar' : 'Expandir' }}
                </button>
                <button
                  type="button"
                  class="rails-log-close-button"
                  :aria-label="`Fechar log do ${workerLabels[workerId]}`"
                  @click="worker.toggleLogs()"
                >
                  <XMarkIcon aria-hidden="true" />
                </button>
              </div>
            </header>
            <div class="rails-log-panel-body">
              <ProjectLogTerminal
                :content="worker.log.value?.content ?? ''"
                :running="worker.canStop.value"
                :masked-count="worker.log.value?.redactionCount ?? 0"
                :clearable="worker.detected.value"
                :clearing="worker.clearingLog.value"
                @clear="worker.clearLog()"
              />
            </div>
          </section>
        </template>
      </Card>
    </section>
  </div>
</template>

<style scoped>
.rails-runtime-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: var(--space-4);
}

.rails-worker-panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.rails-worker-panel,
.rails-worker-card,
.rails-worker-overview-main,
.rails-worker-command,
.rails-worker-log-content {
  min-width: 0;
}

:global(.dd-card.rails-worker-card) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
}

.rails-worker-error {
  margin: 0 0 var(--space-3);
  padding: 10px 12px;
  border: 1px solid var(--danger-text);
  border-radius: var(--radius-sm);
  color: var(--danger-text);
  background: var(--danger-surface);
}

.rails-worker-empty,
.rails-worker-empty-state {
  padding: var(--space-5);
  color: var(--text-muted);
  text-align: center;
}

.rails-worker-empty-state strong {
  display: block;
  color: var(--text);
}

.rails-worker-empty-state p {
  margin: 6px auto 0;
  max-width: 620px;
}

.rails-worker-overview {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 12px;
  background: var(--surface-2);
}

.rails-worker-overview-main {
  display: grid;
  flex: 1;
  gap: 9px;
}

.rails-worker-status-copy {
  color: var(--text);
  font-size: var(--font-xs);
}

.rails-worker-overview dl {
  display: grid;
  min-width: 0;
  grid-template-columns: 100px 100px 190px minmax(220px, 1fr);
  gap: 12px;
  margin: 0;
}

.rails-worker-overview dt {
  margin-bottom: 4px;
  color: var(--text-dim);
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.rails-worker-overview dd {
  margin: 0;
  color: var(--text);
  font-size: var(--font-xs);
}

.rails-worker-command code {
  display: block;
  overflow: hidden;
  font-family: var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rails-worker-actions,
.rails-worker-logs-toolbar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
}

.rails-worker-actions button,
.rails-worker-logs-toolbar button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 6px;
}

.rails-worker-actions svg {
  width: 15px;
  height: 15px;
}

.rails-text-button {
  border: 0;
  color: var(--accent);
  background: transparent;
  font: inherit;
  font-size: var(--font-xs);
  font-weight: 700;
  cursor: pointer;
}

.rails-worker-logs {
  overflow: hidden;
}

.rails-worker-logs-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.rails-worker-logs-header h4 {
  margin: 0;
  color: var(--text);
  font-size: var(--font-sm);
}

.rails-worker-logs-header p {
  margin: 3px 0 0;
  color: var(--text-muted);
  font-size: var(--font-xs);
}

@media (max-width: 980px) {
  .rails-worker-overview {
    align-items: stretch;
    flex-direction: column;
  }

  .rails-worker-overview dl {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .rails-worker-actions,
  .rails-worker-logs-header,
  .rails-worker-logs-toolbar {
    flex-wrap: wrap;
  }

  .rails-worker-overview dl {
    grid-template-columns: 1fr;
  }
}

.rails-log-panel {
  display: flex;
  min-height: 260px;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
  border-top: 1px solid var(--border);
  background: var(--surface-1);
}

.rails-log-panel-expanded {
  position: fixed;
  z-index: 1000;
  inset: 0;
  min-height: 0;
  border: 0;
  background: var(--surface-1);
  box-shadow: var(--shadow-2);
}

.rails-log-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}

.rails-log-panel-header > div:first-child {
  display: grid;
  gap: 3px;
}

.rails-log-panel-header span {
  color: var(--accent);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.rails-log-panel-header h3 {
  margin: 0;
  color: var(--text);
  font-size: var(--font-md);
}

.rails-log-panel-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rails-log-panel-button,
.rails-log-close-button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--surface-1);
  cursor: pointer;
}

.rails-log-panel-button {
  padding: 0 10px;
  font: inherit;
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
}

.rails-log-panel-button svg,
.rails-log-close-button svg {
  width: 16px;
  height: 16px;
}

.rails-log-panel-button:hover,
.rails-log-close-button:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.rails-log-close-button {
  width: 34px;
  flex: 0 0 auto;
}

.rails-log-panel-body {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
  padding: 12px;
}

.rails-log-panel-body .project-log-terminal {
  min-height: 0;
  flex: 1 1 auto;
}

@media (max-width: 640px) {
  .rails-log-panel-header {
    align-items: flex-start;
  }

  .rails-log-panel-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .rails-log-panel-button {
    font-size: 0;
  }

  .rails-log-panel-button svg {
    margin: 0;
  }
}
</style>
