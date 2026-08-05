<script setup lang="ts">
import {
  ArrowPathIcon,
  KeyIcon,
  PlayIcon,
  StopIcon,
} from '@heroicons/vue/24/outline';

import type { Project, RailsWorkerId } from '@dev-dashboard/contracts';

import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useProjectRailsCredentials } from '../composables/useProjectRailsCredentials';
import { useProjectRailsWorker } from '../composables/useProjectRailsWorker';
import { processToneFor } from '../utils/status-tones';
import Card from './Card.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ project: Project }>();

const sidekiq = useProjectRailsWorker(() => props.project, 'sidekiq', true);
const webpack = useProjectRailsWorker(() => props.project, 'webpack', false);
const credentials = useProjectRailsCredentials(() => props.project);

useAutoDismiss(sidekiq.errorMessage, '');
useAutoDismiss(webpack.errorMessage, '');
useAutoDismiss(credentials.errorMessage, '');

const workerLabels: Record<RailsWorkerId, string> = {
  sidekiq: 'Sidekiq',
  webpack: 'webpack-dev-server',
};

const keySourceLabels: Record<string, string> = {
  file: 'Arquivo de chave presente',
  'environment-variable': 'RAILS_MASTER_KEY definido no ambiente',
  missing: 'Nenhuma chave encontrada',
};
</script>

<template>
  <div class="rails-runtime-panel">
    <Card
      v-for="worker in [
        { id: 'sidekiq' as const, state: sidekiq, supportsRestart: true },
        { id: 'webpack' as const, state: webpack, supportsRestart: false },
      ]"
      :key="worker.id"
      class="rails-worker-card"
    >
      <template #header>
        <h3>{{ workerLabels[worker.id] }}</h3>
        <StatusBadge :tone="processToneFor(worker.state.status.value)">
          {{ worker.state.statusLabel.value }}
        </StatusBadge>
      </template>

      <p v-if="worker.state.errorMessage.value" class="rails-worker-error" role="alert">
        {{ worker.state.errorMessage.value }}
      </p>

      <p v-if="!worker.state.detected.value" class="rails-worker-empty">
        Não encontramos indícios de {{ workerLabels[worker.id] }} neste projeto
        (gem/binstub ausente).
      </p>

      <template v-else>
        <dl class="rails-worker-details">
          <div v-if="worker.state.managedProcess.value?.pid">
            <dt>PID</dt>
            <dd>{{ worker.state.managedProcess.value?.pid }}</dd>
          </div>
          <div v-if="worker.state.managedProcess.value?.command">
            <dt>Comando</dt>
            <dd><code>{{ worker.state.managedProcess.value?.command }}</code></dd>
          </div>
        </dl>

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
            class="rails-text-button"
            @click="worker.state.toggleLogs()"
          >
            {{ worker.state.logsVisible.value ? 'Ocultar logs' : 'Ver logs' }}
          </button>
        </div>

        <div v-if="worker.state.logsVisible.value" class="rails-worker-logs">
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
          <pre class="rails-worker-log-content">{{ worker.state.log.value?.content || (worker.state.logLoading.value ? 'Carregando…' : 'Sem conteúdo.') }}</pre>
        </div>
      </template>
    </Card>

    <Card class="rails-credentials-card">
      <template #header>
        <h3>
          <KeyIcon aria-hidden="true" />
          Credentials
        </h3>
      </template>

      <p v-if="credentials.errorMessage.value" class="rails-worker-error" role="alert">
        {{ credentials.errorMessage.value }}
      </p>

      <p v-if="credentials.loading.value && !credentials.credentials.value">
        Consultando arquivos de credentials…
      </p>

      <p v-else-if="!credentials.credentials.value?.supported" class="rails-worker-empty">
        Este projeto não possui <code>config/credentials.yml.enc</code>.
      </p>

      <template v-else>
        <p class="rails-credentials-notice">
          Somente leitura: o dashboard nunca lê nem exibe o conteúdo
          criptografado ou o valor de qualquer chave. Edite credentials pelo
          terminal (<code>bin/rails credentials:edit</code>).
        </p>

        <table class="rails-credentials-table">
          <thead>
            <tr>
              <th scope="col">Ambiente</th>
              <th scope="col">Credentials</th>
              <th scope="col">Chave</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="environment in credentials.credentials.value.environments" :key="environment.name">
              <td>{{ environment.name }}</td>
              <td>
                <StatusBadge :tone="environment.credentialsFileExists ? 'success' : 'neutral'">
                  {{ environment.credentialsFileExists ? 'Presente' : 'Ausente' }}
                </StatusBadge>
              </td>
              <td>
                <StatusBadge :tone="environment.keyFileExists ? 'success' : environment.keySource === 'environment-variable' ? 'info' : 'warning'">
                  {{ keySourceLabels[environment.keySource] }}
                </StatusBadge>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </Card>
  </div>
</template>

<style scoped>
.rails-runtime-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--space-4);
  align-items: start;
}

.rails-worker-card :deep(.dd-card-heading) {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.rails-worker-card h3,
.rails-credentials-card h3 {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-md);
  margin: 0;
}

.rails-worker-error {
  color: var(--danger-text);
  background: var(--danger-surface);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  margin: 0 0 var(--space-3);
  font-size: var(--font-sm);
}

.rails-worker-empty {
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.rails-worker-details {
  display: grid;
  gap: var(--space-2);
  margin: 0 0 var(--space-3);
  font-size: var(--font-sm);
}
.rails-worker-details dt { color: var(--text-muted); }
.rails-worker-details dd { margin: 0; }

.rails-worker-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.rails-worker-logs {
  margin-top: var(--space-3);
  border-top: 1px solid var(--border);
  padding-top: var(--space-3);
}

.rails-worker-logs-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-2);
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
.rails-text-button:hover { text-decoration: underline; }
.rails-text-button:disabled { color: var(--text-muted); cursor: not-allowed; }

.rails-worker-log-content {
  max-height: 240px;
  overflow: auto;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  padding: var(--space-3);
  font-size: var(--font-xs);
  white-space: pre-wrap;
  word-break: break-word;
}

.rails-credentials-notice {
  color: var(--text-muted);
  font-size: var(--font-sm);
  margin: 0 0 var(--space-3);
}

.rails-credentials-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-sm);
}

.rails-credentials-table th,
.rails-credentials-table td {
  text-align: left;
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--border);
}
</style>
