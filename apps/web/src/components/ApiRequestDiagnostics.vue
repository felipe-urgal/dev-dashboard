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
const alertHistory = ref<AlertHistoryItem[]>([]);
const previousTones = new Map<string, MetricTone>();
let refreshTimer: number | undefined;
let historySequence = 0;

type MetricTone = 'normal' | 'warning' | 'danger';

interface AlertHistoryItem {
  id: number;
  key: string;
  method: string;
  url: string;
  tone: Exclude<MetricTone, 'normal'>;
  message: string;
  occurredAt: string;
}

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

const flaggedMetrics = computed(() =>
  metrics.value.filter((metric) => metricTone(metric) !== 'normal'),
);

const sortedMetrics = computed(() =>
  [...metrics.value].sort((left, right) => {
    if (right.deduplicated !== left.deduplicated) {
      return right.deduplicated - left.deduplicated;
    }
    return right.calls - left.calls;
  }),
);

function refresh(): void {
  const nextMetrics = getApiRequestMetrics();
  for (const metric of nextMetrics) {
    const tone = metricTone(metric);
    const previousTone = previousTones.get(metric.key);
    if (tone !== 'normal' && tone !== previousTone) {
      alertHistory.value.unshift({
        id: historySequence++,
        key: metric.key,
        method: metric.method,
        url: metric.url,
        tone,
        message: metricAlertLabel(metric),
        occurredAt: new Date().toISOString(),
      });
      alertHistory.value = alertHistory.value.slice(0, 20);
    }
    previousTones.set(metric.key, tone);
  }
  metrics.value = nextMetrics;
}

function clear(): void {
  clearApiRequestMetrics();
  alertHistory.value = [];
  previousTones.clear();
  refresh();
}

function formatMetricUrl(metric: Pick<ApiRequestMetric, 'url'>): string {
  return metric.url.replace(/^\/api\//, '');
}

function metricTone(metric: ApiRequestMetric): MetricTone {
  if (metric.failures > 0 || (metric.lastDurationMs ?? 0) >= 1500) {
    return 'danger';
  }
  if (metric.deduplicated > 0 || (metric.lastDurationMs ?? 0) >= 500) {
    return 'warning';
  }
  return 'normal';
}

function metricAlertLabel(metric: ApiRequestMetric): string {
  if (metric.failures > 0) return `${metric.failures} falha(s)`;
  if ((metric.lastDurationMs ?? 0) >= 1500) return 'resposta lenta';
  if (metric.deduplicated > 0) return `${metric.deduplicated} deduplicada(s)`;
  if ((metric.lastDurationMs ?? 0) >= 500) return 'atenção: resposta lenta';
  return '';
}

function historyTime(item: AlertHistoryItem): string {
  return new Date(item.occurredAt).toLocaleTimeString('pt-BR');
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

      <p
        v-if="flaggedMetrics.length"
        class="api-request-diagnostics-alert"
        role="status"
      >
        {{ flaggedMetrics.length }} endpoint(s) precisam de atenção. Falhas e
        respostas acima de 1,5 s são críticas; duplicações e respostas acima de
        500 ms ficam em alerta.
      </p>

      <section
        v-if="alertHistory.length"
        class="api-request-diagnostics-history"
        aria-labelledby="api-diagnostics-history-title"
      >
        <div class="api-request-diagnostics-history-heading">
          <span id="api-diagnostics-history-title">Histórico recente</span>
          <small>Últimos {{ alertHistory.length }} eventos</small>
        </div>
        <ol class="api-request-diagnostics-history-list">
          <li
            v-for="item in alertHistory"
            :key="item.id"
            :class="`is-${item.tone}`"
          >
            <time :datetime="item.occurredAt">{{ historyTime(item) }}</time>
            <code>{{ item.method }} {{ formatMetricUrl(item) }}</code>
            <span>{{ item.message }}</span>
          </li>
        </ol>
      </section>

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
            <tr
              v-for="metric in sortedMetrics"
              :key="metric.key"
              :class="`is-${metricTone(metric)}`"
            >
              <td>
                <code>{{ metric.method }} {{ formatMetricUrl(metric) }}</code>
                <span
                  v-if="metricAlertLabel(metric)"
                  class="api-request-diagnostics-badge"
                >
                  {{ metricAlertLabel(metric) }}
                </span>
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

.api-request-diagnostics-alert {
  margin: 0 0 10px;
  border: 1px solid color-mix(in srgb, var(--warning) 45%, var(--border));
  border-radius: 7px;
  background: color-mix(in srgb, var(--warning) 10%, transparent);
  color: var(--text);
  font-size: 11px;
  line-height: 1.45;
  padding: 8px 10px;
}

.api-request-diagnostics-history {
  margin-bottom: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--normal-bg) 35%, transparent);
}

.api-request-diagnostics-history-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid var(--border);
  padding: 9px 10px;
}

.api-request-diagnostics-history-heading span {
  color: var(--text);
  font-size: 11px;
  font-weight: 800;
}

.api-request-diagnostics-history-heading small {
  color: var(--muted);
  font-size: 10px;
}

.api-request-diagnostics-history-list {
  display: grid;
  gap: 0;
  list-style: none;
  margin: 0;
  max-height: 180px;
  overflow-y: auto;
  padding: 0;
}

.api-request-diagnostics-history-list li {
  display: grid;
  grid-template-columns: 62px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  border-left: 3px solid var(--warning);
  border-bottom: 1px solid var(--border);
  padding: 8px 10px 8px 8px;
  font-size: 10px;
}

.api-request-diagnostics-history-list li:last-child {
  border-bottom: 0;
}

.api-request-diagnostics-history-list li.is-danger {
  border-left-color: var(--danger);
}

.api-request-diagnostics-history-list time,
.api-request-diagnostics-history-list span {
  color: var(--muted);
}

.api-request-diagnostics-history-list code {
  overflow: hidden;
  color: var(--text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.api-request-diagnostics-history-list li.is-warning span {
  color: var(--warning);
}

.api-request-diagnostics-history-list li.is-danger span {
  color: var(--danger);
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

.api-request-diagnostics-table tbody tr.is-warning {
  background: color-mix(in srgb, var(--warning) 5%, transparent);
}

.api-request-diagnostics-table tbody tr.is-danger {
  background: color-mix(in srgb, var(--danger) 7%, transparent);
}

.api-request-diagnostics-table tbody tr.is-warning td:first-child,
.api-request-diagnostics-table tbody tr.is-danger td:first-child {
  border-left: 3px solid var(--warning);
}

.api-request-diagnostics-table tbody tr.is-danger td:first-child {
  border-left-color: var(--danger);
}

.api-request-diagnostics-badge {
  display: inline-flex;
  margin-left: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--warning) 15%, transparent);
  color: var(--warning);
  font-size: 9px;
  font-weight: 800;
  padding: 3px 6px;
  text-transform: uppercase;
}

.api-request-diagnostics-table
  tbody
  tr.is-danger
  .api-request-diagnostics-badge {
  background: color-mix(in srgb, var(--danger) 15%, transparent);
  color: var(--danger);
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

  .api-request-diagnostics-history-list li {
    grid-template-columns: 52px minmax(0, 1fr);
  }

  .api-request-diagnostics-history-list li span {
    grid-column: 2;
  }
}
</style>
