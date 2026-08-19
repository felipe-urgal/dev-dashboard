<script setup lang="ts">
import { ChartBarSquareIcon, TrashIcon } from '@heroicons/vue/24/outline';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import {
  clearApiRequestMetrics,
  getApiRequestMetrics,
  type ApiRequestMetric,
} from '../api/core';

const expanded = ref(false);
const metrics = ref<ApiRequestMetric[]>([]);
let refreshTimer: number | undefined;

const totals = computed(() => ({
  calls: metrics.value.reduce((sum, metric) => sum + metric.calls, 0),
  deduplicated: metrics.value.reduce(
    (sum, metric) => sum + metric.deduplicated,
    0,
  ),
  failures: metrics.value.reduce((sum, metric) => sum + metric.failures, 0),
}));

const averageDuration = computed(() => {
  const durations = metrics.value
    .map((metric) => metric.lastDurationMs)
    .filter((duration): duration is number => duration !== undefined);
  if (durations.length === 0) return '—';
  return `${Math.round(
    durations.reduce((sum, duration) => sum + duration, 0) / durations.length,
  )} ms`;
});

const sortedMetrics = computed(() =>
  [...metrics.value].sort((left, right) => {
    if (right.deduplicated !== left.deduplicated) {
      return right.deduplicated - left.deduplicated;
    }
    return right.calls - left.calls;
  }),
);

function refresh(): void {
  metrics.value = getApiRequestMetrics();
}

function clear(): void {
  clearApiRequestMetrics();
  refresh();
}

function formatMetricUrl(metric: ApiRequestMetric): string {
  return metric.url.replace(/^\/api\//, '');
}

onMounted(() => {
  refresh();
  refreshTimer = window.setInterval(refresh, 2000);
});

onBeforeUnmount(() => {
  if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
});
</script>

<template>
  <section
    class="api-request-diagnostics"
    aria-labelledby="api-diagnostics-title"
  >
    <header class="api-request-diagnostics-header">
      <div class="api-request-diagnostics-title">
        <ChartBarSquareIcon aria-hidden="true" />
        <div>
          <span id="api-diagnostics-title">Diagnóstico de chamadas</span>
          <p>Observação local desta sessão, sem novas requisições.</p>
        </div>
      </div>
      <button
        type="button"
        class="api-request-diagnostics-toggle"
        :aria-expanded="expanded"
        aria-controls="api-diagnostics-content"
        @click="expanded = !expanded"
      >
        {{ expanded ? 'Ocultar' : 'Ver métricas' }}
      </button>
    </header>

    <div class="api-request-diagnostics-summary" aria-live="polite">
      <div>
        <span>Chamadas</span>
        <strong>{{ totals.calls }}</strong>
      </div>
      <div>
        <span>Deduplicadas</span>
        <strong>{{ totals.deduplicated }}</strong>
      </div>
      <div>
        <span>Falhas</span>
        <strong :class="{ 'is-danger': totals.failures > 0 }">
          {{ totals.failures }}
        </strong>
      </div>
      <div>
        <span>Duração média</span>
        <strong>{{ averageDuration }}</strong>
      </div>
    </div>

    <div
      v-if="expanded"
      id="api-diagnostics-content"
      class="api-request-diagnostics-content"
    >
      <div class="api-request-diagnostics-actions">
        <span>{{ metrics.length }} endpoint(s) observado(s)</span>
        <button type="button" @click="clear">
          <TrashIcon aria-hidden="true" />
          Limpar métricas
        </button>
      </div>

      <div
        v-if="sortedMetrics.length"
        class="api-request-diagnostics-table-wrap"
      >
        <table class="api-request-diagnostics-table">
          <caption class="sr-only">
            Métricas de chamadas da API nesta sessão
          </caption>
          <thead>
            <tr>
              <th scope="col">Endpoint</th>
              <th scope="col">Chamadas</th>
              <th scope="col">Deduplicadas</th>
              <th scope="col">Falhas</th>
              <th scope="col">Última duração</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="metric in sortedMetrics" :key="metric.key">
              <td>
                <code>{{ metric.method }} {{ formatMetricUrl(metric) }}</code>
              </td>
              <td>{{ metric.calls }}</td>
              <td>{{ metric.deduplicated }}</td>
              <td :class="{ 'is-danger': metric.failures > 0 }">
                {{ metric.failures }}
              </td>
              <td>
                {{ metric.lastDurationMs ?? '—'
                }}{{ metric.lastDurationMs !== undefined ? ' ms' : '' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="api-request-diagnostics-empty">
        Nenhuma chamada observável foi registrada nesta sessão.
      </p>
    </div>
  </section>
</template>

<style scoped>
.api-request-diagnostics {
  margin-top: 18px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
}

.api-request-diagnostics-header,
.api-request-diagnostics-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.api-request-diagnostics-header {
  padding: 14px 16px;
}

.api-request-diagnostics-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.api-request-diagnostics-title svg {
  width: 20px;
  color: var(--accent);
}

.api-request-diagnostics-title span {
  display: block;
  color: var(--text);
  font-size: 13px;
  font-weight: 800;
}

.api-request-diagnostics-title p {
  margin: 3px 0 0;
  color: var(--muted);
  font-size: 11px;
}

.api-request-diagnostics-toggle,
.api-request-diagnostics-actions button {
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
  padding: 7px 10px;
}

.api-request-diagnostics-toggle:hover,
.api-request-diagnostics-toggle:focus-visible,
.api-request-diagnostics-actions button:hover,
.api-request-diagnostics-actions button:focus-visible {
  border-color: var(--accent);
}

.api-request-diagnostics-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 1px solid var(--border);
}

.api-request-diagnostics-summary div {
  display: grid;
  gap: 4px;
  padding: 12px 16px;
  border-right: 1px solid var(--border);
}

.api-request-diagnostics-summary div:last-child {
  border-right: 0;
}

.api-request-diagnostics-summary span {
  color: var(--muted);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.api-request-diagnostics-summary strong {
  color: var(--text);
  font-size: 18px;
}

.api-request-diagnostics-summary strong.is-danger,
.api-request-diagnostics-table .is-danger {
  color: var(--danger);
}

.api-request-diagnostics-content {
  border-top: 1px solid var(--border);
  padding: 12px 16px 16px;
}

.api-request-diagnostics-actions {
  margin-bottom: 10px;
  color: var(--muted);
  font-size: 11px;
}

.api-request-diagnostics-actions button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.api-request-diagnostics-actions svg {
  width: 14px;
}

.api-request-diagnostics-table-wrap {
  overflow-x: auto;
}

.api-request-diagnostics-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.api-request-diagnostics-table th,
.api-request-diagnostics-table td {
  border-bottom: 1px solid var(--border);
  padding: 9px 8px;
  text-align: left;
  white-space: nowrap;
}

.api-request-diagnostics-table th {
  color: var(--muted);
  font-size: 10px;
  text-transform: uppercase;
}

.api-request-diagnostics-table td {
  color: var(--text);
}

.api-request-diagnostics-table code {
  color: var(--accent);
  font-size: 11px;
}

.api-request-diagnostics-empty {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}

@media (max-width: 640px) {
  .api-request-diagnostics-header {
    align-items: flex-start;
  }

  .api-request-diagnostics-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .api-request-diagnostics-summary div:nth-child(2) {
    border-right: 0;
  }
}
</style>
