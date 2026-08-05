<script setup lang="ts">
import {
  ArrowPathIcon,
  PlayIcon,
  StopIcon,
} from '@heroicons/vue/24/outline';
import { nextTick, ref, watch } from 'vue';

import type { Project, RailsWorkerId } from '@dev-dashboard/contracts';

import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useProjectRailsWorker } from '../composables/useProjectRailsWorker';
import { processToneFor } from '../utils/status-tones';
import Card from './Card.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project }>();

const sidekiq = useProjectRailsWorker(() => props.project, 'sidekiq', true);
const webpack = useProjectRailsWorker(() => props.project, 'webpack', false);

useAutoDismiss(sidekiq.errorMessage, '');
useAutoDismiss(webpack.errorMessage, '');

const activeWorkerId = ref<RailsWorkerId>('sidekiq');

const logElements = new Map<RailsWorkerId, HTMLPreElement>();
function registerLogElement(workerId: RailsWorkerId, element: Element | null): void {
  if (element instanceof HTMLPreElement) logElements.set(workerId, element);
  else logElements.delete(workerId);
}

function scrollLogToBottom(workerId: RailsWorkerId): void {
  void nextTick(() => {
    const element = logElements.get(workerId);
    if (element) element.scrollTop = element.scrollHeight;
  });
}

watch(sidekiq.log, () => scrollLogToBottom('sidekiq'));
watch(webpack.log, () => scrollLogToBottom('webpack'));

watch(
  [sidekiq.loading, webpack.loading, sidekiq.detected, webpack.detected],
  () => {
    if (sidekiq.loading.value || webpack.loading.value) return;

    if (!sidekiq.detected.value && webpack.detected.value) {
      activeWorkerId.value = 'webpack';
    } else if (!webpack.detected.value && sidekiq.detected.value) {
      activeWorkerId.value = 'sidekiq';
    }
  },
);

const workerLabels: Record<RailsWorkerId, string> = {
  sidekiq: 'Sidekiq',
  webpack: 'webpack-dev-server',
};

const workerDescriptions: Record<RailsWorkerId, string> = {
  sidekiq: 'Processamento de tarefas em segundo plano.',
  webpack: 'Compilação e atualização dos assets durante o desenvolvimento.',
};

const railsWorkers = [
  { id: 'sidekiq' as const, supportsRestart: true, state: sidekiq },
  { id: 'webpack' as const, supportsRestart: false, state: webpack },
];

function formatDate(value?: string): string {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('pt-BR');
}
</script>

<template>
  <div class="rails-runtime-panel">
    <nav class="rails-runtime-tabs" role="tablist" aria-label="Processos Rails">
      <button
        v-for="worker in railsWorkers"
        :id="`rails-worker-tab-${worker.id}`"
        :key="worker.id"
        type="button"
        role="tab"
        class="rails-runtime-tab"
        :class="{ 'rails-runtime-tab--active': activeWorkerId === worker.id }"
        :aria-selected="activeWorkerId === worker.id"
        :aria-controls="`rails-worker-panel-${worker.id}`"
        @click="activeWorkerId = worker.id"
      >
        <svg
          v-if="worker.id === 'sidekiq'"
          class="rails-worker-brand-icon rails-worker-brand-icon--sidekiq"
          viewBox="0 0 32 32"
          aria-hidden="true"
        >
          <path d="M6 24.5V11.8c0-4.2 3.4-7.6 7.6-7.6h2.9c5.2 0 9.5 4.2 9.5 9.5v10.8H6Z" fill="currentColor" />
          <circle cx="12" cy="14" r="2.2" fill="white" />
          <circle cx="19.5" cy="11" r="2.2" fill="white" />
          <circle cx="20" cy="19" r="2.2" fill="white" />
          <path d="M9 24.5 6.8 29l7.1-4.5H9Z" fill="currentColor" />
        </svg>
        <svg
          v-else
          class="rails-worker-brand-icon rails-worker-brand-icon--webpack"
          viewBox="0 0 32 32"
          aria-hidden="true"
        >
          <path d="m16 3 11 6.4v13.2L16 29 5 22.6V9.4L16 3Z" fill="none" stroke="currentColor" stroke-width="2" />
          <path d="m5.8 9.9 10.2 6 10.2-6M16 16v12" fill="none" stroke="currentColor" stroke-width="2" />
          <path d="m10.2 12.5 5.8-3.4 5.8 3.4-5.8 3.4-5.8-3.4Z" fill="currentColor" opacity=".24" />
        </svg>
        <span>{{ worker.id === 'sidekiq' ? 'Sidekiq' : 'Webpack' }}</span>
      </button>
    </nav>

    <section
      v-for="worker in railsWorkers"
      v-show="activeWorkerId === worker.id"
      :id="`rails-worker-panel-${worker.id}`"
      :key="worker.id"
      class="rails-worker-panel"
      :data-worker-id="worker.id"
      role="tabpanel"
      :aria-labelledby="`rails-worker-tab-${worker.id}`"
    >
      <Card class="rails-worker-card">
        <template #header>
          <h3>
            <svg
              v-if="worker.id === 'sidekiq'"
              class="rails-worker-brand-icon rails-worker-brand-icon--sidekiq rails-worker-brand-icon--large"
              viewBox="0 0 32 32"
              aria-hidden="true"
            >
              <path d="M6 24.5V11.8c0-4.2 3.4-7.6 7.6-7.6h2.9c5.2 0 9.5 4.2 9.5 9.5v10.8H6Z" fill="currentColor" />
              <circle cx="12" cy="14" r="2.2" fill="white" />
              <circle cx="19.5" cy="11" r="2.2" fill="white" />
              <circle cx="20" cy="19" r="2.2" fill="white" />
              <path d="M9 24.5 6.8 29l7.1-4.5H9Z" fill="currentColor" />
            </svg>
            <svg
              v-else
              class="rails-worker-brand-icon rails-worker-brand-icon--webpack rails-worker-brand-icon--large"
              viewBox="0 0 32 32"
              aria-hidden="true"
            >
              <path d="m16 3 11 6.4v13.2L16 29 5 22.6V9.4L16 3Z" fill="none" stroke="currentColor" stroke-width="2" />
              <path d="m5.8 9.9 10.2 6 10.2-6M16 16v12" fill="none" stroke="currentColor" stroke-width="2" />
              <path d="m10.2 12.5 5.8-3.4 5.8 3.4-5.8 3.4-5.8-3.4Z" fill="currentColor" opacity=".24" />
            </svg>
            {{ workerLabels[worker.id] }}
          </h3>
          <StatusBadge :tone="processToneFor(worker.state.status.value)">
            {{ worker.state.statusLabel.value }}
          </StatusBadge>
        </template>

        <p v-if="worker.state.errorMessage.value" class="rails-worker-error" role="alert">
          {{ worker.state.errorMessage.value }}
        </p>

        <p v-if="worker.state.loading.value && !worker.state.detected.value" class="rails-worker-empty">
          Verificando se {{ workerLabels[worker.id] }} está disponível no projeto…
        </p>

        <div v-else-if="!worker.state.detected.value" class="rails-worker-empty-state">
          <strong>{{ workerLabels[worker.id] }} não foi detectado.</strong>
          <p>
            O painel será habilitado automaticamente quando o projeto possuir a dependência ou o binstub correspondente.
          </p>
        </div>

        <template v-else>
          <div class="rails-worker-layout">
            <section class="rails-worker-summary" aria-label="Estado do processo">
              <p class="rails-worker-description">
                {{ workerDescriptions[worker.id] }}
              </p>
              <strong class="rails-worker-status-copy">
                {{ worker.state.canStop.value ? 'Processo ativo e respondendo.' : 'Processo parado.' }}
              </strong>

              <div class="rails-worker-actions">
                <button
                  v-if="!worker.state.canStop.value"
                  type="button"
                  class="primary-button"
                  :disabled="worker.state.currentAction.value !== null"
                  @click="worker.state.start()"
                >
                  <PlayIcon aria-hidden="true" />
                  Iniciar
                </button>
                <button
                  v-else
                  type="button"
                  class="secondary-button"
                  :disabled="worker.state.currentAction.value !== null"
                  @click="worker.state.stop()"
                >
                  <StopIcon aria-hidden="true" />
                  Parar
                </button>
                <button
                  v-if="worker.supportsRestart && worker.state.canStop.value"
                  type="button"
                  class="secondary-button"
                  :disabled="worker.state.currentAction.value !== null"
                  @click="worker.state.restart()"
                >
                  <ArrowPathIcon aria-hidden="true" />
                  Reiniciar
                </button>
                <button
                  type="button"
                  class="rails-text-button rails-worker-log-toggle"
                  @click="worker.state.toggleLogs()"
                >
                  {{ worker.state.logsVisible.value ? 'Ocultar logs' : 'Ver logs' }}
                </button>
              </div>
            </section>

            <section class="rails-worker-process-details" aria-label="Detalhes do processo">
              <h4>Detalhes do processo</h4>
              <dl class="rails-worker-details">
                <div>
                  <dt>Status</dt>
                  <dd>{{ worker.state.statusLabel.value }}</dd>
                </div>
                <div>
                  <dt>PID</dt>
                  <dd>{{ worker.state.managedProcess.value?.pid ?? '—' }}</dd>
                </div>
                <div>
                  <dt>Comando</dt>
                  <dd>
                    <code>{{ worker.state.managedProcess.value?.command ?? 'Ainda não iniciado pelo dashboard' }}</code>
                  </dd>
                </div>
                <div v-if="worker.state.managedProcess.value?.port">
                  <dt>Porta</dt>
                  <dd>{{ worker.state.managedProcess.value.port }}</dd>
                </div>
                <div v-if="worker.state.managedProcess.value?.url">
                  <dt>URL</dt>
                  <dd>
                    <a :href="worker.state.managedProcess.value.url" target="_blank" rel="noreferrer">
                      {{ worker.state.managedProcess.value.url }}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Iniciado em</dt>
                  <dd>{{ formatDate(worker.state.managedProcess.value?.startedAt) }}</dd>
                </div>
              </dl>
            </section>
          </div>

          <section
            v-if="worker.state.logsVisible.value"
            class="rails-worker-logs"
            :aria-label="`Logs do ${workerLabels[worker.id]}`"
          >
            <header class="rails-worker-logs-header">
              <div>
                <h4>Logs do {{ workerLabels[worker.id] }}</h4>
                <p>Acompanhe a saída exclusiva deste processo.</p>
              </div>
              <div class="rails-worker-logs-toolbar">
                <span v-if="worker.state.log.value?.masked" class="rails-worker-logs-notice">
                  Segredos mascarados ({{ worker.state.log.value.redactionCount }})
                </span>
                <button type="button" class="rails-text-button" @click="worker.state.refreshLog()">
                  Atualizar
                </button>
                <button type="button" class="rails-text-button" @click="worker.state.clearLog()">
                  Limpar
                </button>
              </div>
            </header>
            <pre
              class="rails-worker-log-content"
              tabindex="0"
              :ref="(el) => registerLogElement(worker.id, el as Element | null)"
            >{{ worker.state.log.value?.content || (worker.state.logLoading.value ? 'Carregando…' : 'Sem conteúdo.') }}</pre>
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

.rails-runtime-tabs {
  display: flex;
  gap: var(--space-1);
  border-bottom: 1px solid var(--border);
}

.rails-runtime-tab {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 42px;
  padding: 0 var(--space-4);
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font: inherit;
  font-size: var(--font-sm);
  font-weight: 600;
}

.rails-runtime-tab:hover {
  color: var(--text);
}

.rails-runtime-tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.rails-runtime-tab--active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.rails-worker-panel {
  min-width: 0;
}

.rails-worker-card :deep(.dd-card-heading) {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.rails-worker-card h3 {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--font-md);
}

.rails-worker-brand-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.rails-worker-brand-icon--large {
  width: 30px;
  height: 30px;
}

.rails-worker-brand-icon--sidekiq {
  color: #c9184a;
}

.rails-worker-brand-icon--webpack {
  color: #1d78c1;
}

.rails-worker-error {
  color: var(--danger-text);
  background: var(--danger-surface);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  margin: 0 0 var(--space-3);
  font-size: var(--font-sm);
}

.rails-worker-empty,
.rails-worker-empty-state {
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.rails-worker-empty-state {
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
}

.rails-worker-empty-state strong {
  color: var(--text);
}

.rails-worker-empty-state p {
  margin: var(--space-2) 0 0;
}

.rails-worker-layout {
  display: grid;
  grid-template-columns: minmax(240px, 0.8fr) minmax(320px, 1.4fr);
  gap: var(--space-4);
  align-items: stretch;
}

.rails-worker-summary,
.rails-worker-process-details {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.rails-worker-summary {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.rails-worker-description {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.rails-worker-status-copy {
  margin-top: var(--space-3);
  font-size: var(--font-sm);
}

.rails-worker-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  margin-top: auto;
  padding-top: var(--space-5);
}

.rails-worker-actions svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.rails-worker-process-details h4,
.rails-worker-logs h4 {
  margin: 0;
  font-size: var(--font-sm);
}

.rails-worker-details {
  display: grid;
  margin: var(--space-3) 0 0;
  font-size: var(--font-sm);
}

.rails-worker-details > div {
  display: grid;
  grid-template-columns: minmax(90px, 0.35fr) minmax(0, 1fr);
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-top: 1px solid var(--border);
}

.rails-worker-details dt {
  color: var(--text-muted);
}

.rails-worker-details dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.rails-worker-details code {
  white-space: normal;
}

.rails-worker-details a {
  color: var(--accent);
}

.rails-worker-logs {
  margin-top: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.rails-worker-logs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
}

.rails-worker-logs-header p {
  margin: var(--space-1) 0 0;
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.rails-worker-logs-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--space-3);
  font-size: var(--font-xs);
}

.rails-worker-logs-notice {
  color: var(--warning-text);
}

.rails-text-button {
  border: none;
  background: none;
  color: var(--accent);
  cursor: pointer;
  font-size: var(--font-xs);
  padding: 0;
}

.rails-text-button:hover {
  text-decoration: underline;
}

.rails-text-button:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
}

.rails-worker-log-toggle {
  min-height: 32px;
  padding: 0 var(--space-2);
}

.rails-worker-log-content {
  max-height: 460px;
  min-height: 220px;
  overflow: auto;
  margin: 0;
  padding: var(--space-4);
  border: 0;
  background: #111827;
  color: #dbeafe;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', monospace;
  font-size: var(--font-sm);
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 820px) {
  .rails-worker-layout {
    grid-template-columns: 1fr;
  }

  .rails-worker-logs-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .rails-worker-logs-toolbar {
    justify-content: flex-start;
  }
}

@media (max-width: 520px) {
  .rails-runtime-tab {
    flex: 1;
    justify-content: center;
    padding-inline: var(--space-2);
  }

  .rails-worker-details > div {
    grid-template-columns: 1fr;
    gap: var(--space-1);
  }
}
</style>
