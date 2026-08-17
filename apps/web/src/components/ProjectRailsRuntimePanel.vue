npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.
<script setup lang="ts">
import {
  ArrowPathIcon,
  PlayIcon,
  StopIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

import type { Project, RailsWorkerId } from '@dev-dashboard/contracts';

import { watch } from 'vue';

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

          <Teleport to="body">
            <div
              v-if="worker.logsVisible.value"
              class="rails-log-overlay"
              role="presentation"
              @click.self="worker.toggleLogs()"
            >
              <section
                class="rails-log-modal"
                role="dialog"
                aria-modal="true"
                :aria-labelledby="`rails-log-title-${workerId}`"
              >
                <header class="rails-log-modal-header">
                  <div>
                    <span>Ferramenta do projeto</span>
                    <h3 :id="`rails-log-title-${workerId}`">
                      Log do {{ workerLabels[workerId] }}
                    </h3>
                    <p>
                      Acompanhe a saída completa do processo em primeiro plano.
                    </p>
                  </div>
                  <button
                    type="button"
                    class="rails-log-close-button"
                    :aria-label="`Fechar log do ${workerLabels[workerId]}`"
                    @click="worker.toggleLogs()"
                  >
                    <XMarkIcon aria-hidden="true" />
                  </button>
                </header>
                <div class="rails-log-modal-body">
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
            </div>
          </Teleport>
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

.rails-log-overlay {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(5 10 18 / 72%);
  backdrop-filter: blur(4px);
}

.rails-log-modal {
  display: flex;
  width: min(1440px, calc(100vw - 32px));
  height: min(860px, calc(100vh - 32px));
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  box-shadow: var(--shadow-2);
}

.rails-log-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
}

.rails-log-modal-header > div {
  display: grid;
  gap: 4px;
}

.rails-log-modal-header span {
  color: var(--accent);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.rails-log-modal-header h3,
.rails-log-modal-header p {
  margin: 0;
}

.rails-log-modal-header h3 {
  color: var(--text);
  font-size: 18px;
}

.rails-log-modal-header p {
  color: var(--text-muted);
  font-size: 11px;
}

.rails-log-close-button {
  display: inline-flex;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--surface-1);
  cursor: pointer;
}

.rails-log-close-button:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.rails-log-close-button svg {
  width: 18px;
  height: 18px;
}

.rails-log-modal-body {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
  padding: 16px;
}

.rails-log-modal-body .project-log-terminal {
  min-height: 0;
  flex: 1 1 auto;
}

@media (max-width: 640px) {
  .rails-log-overlay {
    padding: 12px;
  }

  .rails-log-modal {
    width: calc(100vw - 20px);
    height: calc(100vh - 20px);
  }

  .rails-log-modal-header {
    padding: 14px;
  }

  .rails-log-modal-body {
    padding: 10px;
  }
}
</style>
npm notice
npm notice New major version of npm available! 11.9.0 -> 12.0.2
npm notice Changelog: https://github.com/npm/cli/releases/tag/v12.0.2
npm notice To update run: npm install -g npm@12.0.2
npm notice
