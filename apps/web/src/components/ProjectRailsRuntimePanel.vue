<script setup lang="ts">
import {
  ArrowPathIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ChevronDownIcon,
  InformationCircleIcon,
  PlayIcon,
  StopIcon,
} from '@heroicons/vue/24/outline';

import type { Project, RailsWorkerId } from '@dev-dashboard/contracts';

import { ref, watch } from 'vue';

import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useProjectRailsWorker } from '../composables/useProjectRailsWorker';
import { processToneFor } from '../utils/status-tones';
import Card from './Card.vue';
import ProjectLogTerminal from './ProjectLogTerminal.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{
  project: Project;
  workerId: RailsWorkerId;
  environmentInstanceId?: string | undefined;
}>();

const worker = useProjectRailsWorker(
  () => props.project,
  props.workerId,
  props.workerId === 'sidekiq',
  true,
  () => props.environmentInstanceId,
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
  webpack: 'Webpack',
};

const workerProcessLabels: Record<RailsWorkerId, string> = {
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
      <Card class="rails-worker-card" :padded="false">
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
          Verificando se {{ workerProcessLabels[workerId] }} está disponível no
          projeto…
        </p>

        <div
          v-else-if="!worker.detected.value"
          class="rails-worker-empty-state"
        >
          <strong>{{ workerProcessLabels[workerId] }} não foi detectado.</strong>
          <p>
            O painel será habilitado automaticamente quando o projeto possuir a
            dependência ou o binstub correspondente.
          </p>
        </div>

        <template v-else>
          <header class="rails-worker-toolbar">
            <div class="rails-worker-identity">
              <span
                class="rails-worker-status-dot"
                :class="{ 'is-running': worker.canStop.value }"
                aria-hidden="true"
              />
              <strong>{{ workerLabels[workerId] }}</strong>
              <StatusBadge :tone="processToneFor(worker.status.value)">
                {{ worker.statusLabel.value }}
              </StatusBadge>
            </div>

            <div class="rails-worker-actions">
              <details class="rails-worker-details">
                <summary class="rails-worker-details-trigger">
                  <InformationCircleIcon aria-hidden="true" />
                  Detalhes
                  <ChevronDownIcon
                    class="rails-worker-details-chevron"
                    aria-hidden="true"
                  />
                </summary>

                <div class="rails-worker-details-popover">
                  <dl>
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
              </details>

              <button
                v-if="!worker.canStop.value"
                type="button"
                class="primary-button"
                :disabled="worker.currentAction.value !== null"
                @click="worker.start()"
              >
                <PlayIcon aria-hidden="true" />
                {{
                  worker.currentAction.value === 'start'
                    ? 'Iniciando…'
                    : 'Iniciar'
                }}
              </button>

              <template v-else>
                <button
                  v-if="supportsRestart"
                  type="button"
                  class="secondary-button"
                  :disabled="worker.currentAction.value !== null"
                  @click="worker.restart()"
                >
                  <ArrowPathIcon aria-hidden="true" />
                  {{
                    worker.currentAction.value === 'restart'
                      ? 'Reiniciando…'
                      : 'Reiniciar'
                  }}
                </button>
                <button
                  type="button"
                  class="rails-worker-stop-button"
                  :disabled="worker.currentAction.value !== null"
                  @click="worker.stop()"
                >
                  <StopIcon aria-hidden="true" />
                  {{
                    worker.currentAction.value === 'stop' ? 'Parando…' : 'Parar'
                  }}
                </button>
              </template>
            </div>
          </header>

          <section
            class="rails-log-panel"
            :class="{ 'rails-log-panel-expanded': logMaximized }"
            :aria-label="'Log do ' + workerProcessLabels[workerId]"
          >
            <div class="rails-log-panel-body">
              <ProjectLogTerminal
                :content="worker.log.value?.content ?? ''"
                :running="worker.canStop.value"
                :masked-count="worker.log.value?.redactionCount ?? 0"
                :clearable="worker.detected.value"
                :clearing="worker.clearingLog.value"
                :title="worker.canStop.value ? 'Ao vivo' : 'Log'"
                copy-label="Copiar"
                :show-status-label="false"
                :show-follow-status="false"
                @clear="worker.clearLog()"
              >
                <template #actions>
                  <button
                    type="button"
                    class="rails-log-panel-button"
                    :aria-label="
                      logMaximized ? 'Restaurar log' : 'Expandir log'
                    "
                    @click="toggleLogMaximized"
                  >
                    <ArrowsPointingInIcon
                      v-if="logMaximized"
                      aria-hidden="true"
                    />
                    <ArrowsPointingOutIcon v-else aria-hidden="true" />
                    {{ logMaximized ? 'Restaurar' : 'Expandir' }}
                  </button>
                </template>
              </ProjectLogTerminal>
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
  min-height: 0;
  flex-direction: column;
}

.rails-worker-panel {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
}

.rails-worker-panel,
.rails-worker-card,
.rails-worker-command {
  min-width: 0;
}

:global(.dd-card.rails-worker-card) {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: visible;
}

.rails-worker-error {
  margin: 12px 12px 0;
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
  max-width: 620px;
  margin: 6px auto 0;
}

.rails-worker-toolbar {
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: 12px 14px;
  background: var(--surface-2);
}

.rails-worker-identity,
.rails-worker-actions {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.rails-worker-identity > strong {
  color: var(--text);
  font-size: var(--font-lg);
}

.rails-worker-status-dot {
  width: 9px;
  height: 9px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--text-dim);
}

.rails-worker-status-dot.is-running {
  background: var(--success-text);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--success-text) 16%, transparent);
}

.rails-worker-actions {
  flex: 0 0 auto;
}

.rails-worker-actions button,
.rails-worker-details-trigger {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.rails-worker-actions svg,
.rails-worker-details-trigger svg {
  width: 15px;
  height: 15px;
}

.rails-worker-details {
  position: relative;
}

.rails-worker-details-trigger {
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--surface-1);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  cursor: pointer;
  list-style: none;
}

.rails-worker-details-trigger::-webkit-details-marker {
  display: none;
}

.rails-worker-details-trigger:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.rails-worker-details-chevron {
  transition: transform var(--motion-duration-fast)
    var(--motion-easing-standard);
}

.rails-worker-details[open] .rails-worker-details-chevron {
  transform: rotate(180deg);
}

.rails-worker-details-popover {
  position: absolute;
  z-index: 20;
  top: calc(100% + 8px);
  right: 0;
  width: min(560px, calc(100vw - 64px));
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  box-shadow: 0 12px 32px rgb(0 0 0 / 24%);
}

.rails-worker-details-popover dl {
  display: grid;
  grid-template-columns: minmax(90px, 0.35fr) minmax(180px, 0.65fr);
  gap: 12px;
  margin: 0;
}

.rails-worker-details-popover dt {
  margin-bottom: 4px;
  color: var(--text-dim);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.rails-worker-details-popover dd {
  margin: 0;
  color: var(--text);
  font-size: var(--font-xs);
}

.rails-worker-command {
  grid-column: 1 / -1;
}

.rails-worker-command code {
  display: block;
  overflow: auto;
  padding: 8px 9px;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--surface-0);
  font-family: var(--font-family-code);
  white-space: nowrap;
}

.rails-worker-stop-button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 6px;
  padding: 0 11px;
  border: 1px solid var(--danger-text);
  border-radius: var(--radius-sm);
  color: #fff;
  background: var(--danger-text);
  font: inherit;
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  cursor: pointer;
}

.rails-worker-stop-button:hover:not(:disabled) {
  opacity: 0.9;
}

.rails-worker-stop-button:disabled {
  cursor: wait;
  opacity: 0.55;
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

.rails-log-panel-button {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 4px 9px;
  border: 1px solid #484f58;
  border-radius: var(--radius-sm);
  color: #c9d1d9;
  background: #21262d;
  font: inherit;
  font-size: var(--font-xs);
  cursor: pointer;
}

.rails-log-panel-button svg {
  width: 14px;
  height: 14px;
}

.rails-log-panel-button:hover {
  border-color: #8b949e;
  color: #fff;
}

@media (max-width: 720px) {
  .rails-worker-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .rails-worker-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .rails-worker-details-popover {
    position: static;
    width: min(100%, 560px);
    margin-top: 8px;
  }
}

@media (max-width: 520px) {
  .rails-worker-identity {
    flex-wrap: wrap;
  }

  .rails-worker-actions {
    justify-content: stretch;
  }

  .rails-worker-actions > button,
  .rails-worker-details,
  .rails-worker-details-trigger {
    flex: 1 1 auto;
  }

  .rails-worker-details-popover dl {
    grid-template-columns: 1fr;
  }

  .rails-worker-command {
    grid-column: auto;
  }
}
</style>
