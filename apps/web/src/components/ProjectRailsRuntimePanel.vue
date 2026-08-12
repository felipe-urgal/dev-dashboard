<script setup lang="ts">
import { ArrowPathIcon, PlayIcon, StopIcon } from '@heroicons/vue/24/outline';

import type { Project, RailsWorkerId } from '@dev-dashboard/contracts';

import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useProjectRailsWorker } from '../composables/useProjectRailsWorker';
import { processToneFor } from '../utils/status-tones';
import Card from './Card.vue';
import ProjectLogExperience from './ProjectLogExperience.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project; workerId: RailsWorkerId }>();

const worker = useProjectRailsWorker(
  () => props.project,
  props.workerId,
  props.workerId === 'sidekiq',
);

useAutoDismiss(worker.errorMessage, '');

const workerLabels: Record<RailsWorkerId, string> = {
  sidekiq: 'Sidekiq',
  webpack: 'webpack-dev-server',
};

const workerDescriptions: Record<RailsWorkerId, string> = {
  sidekiq:
    'Acompanhe jobs em tempo real e investigue falhas, retries e execuções lentas.',
  webpack:
    'Acompanhe compilação de assets e investigue warnings, builds lentos e erros de módulo.',
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
        <template #header>
          <div class="rails-worker-heading">
            <div>
              <h3>{{ workerLabels[workerId] }}</h3>
              <p>{{ workerDescriptions[workerId] }}</p>
            </div>
            <StatusBadge :tone="processToneFor(worker.status.value)">
              {{ worker.statusLabel.value }}
            </StatusBadge>
          </div>
        </template>

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
              <button
                type="button"
                class="rails-text-button rails-worker-log-toggle"
                @click="worker.toggleLogs()"
              >
                {{ worker.logsVisible.value ? 'Ocultar logs' : 'Ver logs' }}
              </button>
            </div>
          </section>

          <section
            v-if="worker.logsVisible.value"
            class="rails-worker-logs"
            :aria-label="`Logs do ${workerLabels[workerId]}`"
          >
            <header class="rails-worker-logs-header">
              <div>
                <h4>Logs do {{ workerLabels[workerId] }}</h4>
                <p>
                  {{
                    workerId === 'sidekiq'
                      ? 'Fluxo de jobs e diagnóstico automático de falhas.'
                      : 'Fluxo de compilação e diagnóstico automático do build.'
                  }}
                </p>
              </div>
              <div class="rails-worker-logs-toolbar">
                <button
                  type="button"
                  class="rails-text-button"
                  @click="worker.refreshLog()"
                >
                  Atualizar
                </button>
                <button
                  type="button"
                  class="rails-text-button"
                  @click="worker.clearLog()"
                >
                  Limpar
                </button>
              </div>
            </header>

            <div class="rails-worker-log-content">
              <ProjectLogExperience
                :content="worker.log.value?.content ?? ''"
                :source="workerId === 'sidekiq' ? 'sidekiq' : 'webpack'"
                :running="worker.canStop.value"
                :masked-count="worker.log.value?.redactionCount ?? 0"
                :empty-label="
                  worker.logLoading.value ? 'Carregando…' : 'Sem conteúdo.'
                "
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
  display: grid;
  gap: var(--space-4);
}

.rails-worker-panel,
.rails-worker-card,
.rails-worker-heading,
.rails-worker-overview-main,
.rails-worker-command,
.rails-worker-log-content {
  min-width: 0;
}

.rails-worker-heading {
  display: flex;
  width: 100%;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
}

.rails-worker-heading h3 {
  margin: 0;
}

.rails-worker-heading p {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: var(--font-xs);
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
  gap: var(--space-4);
  margin-bottom: var(--space-4);
  padding: 12px;
  border: 1px solid var(--border);
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
  border-top: 1px solid var(--border);
  padding-top: var(--space-4);
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
</style>
