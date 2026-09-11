<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import type { ManagedProcess } from '@dev-dashboard/contracts';

import { getApiRequestMetrics, type ApiRequestMetric } from '../api/core';
import { kindLabel, processStatusLabel } from '../utils/process-format';

const props = defineProps<{
  processes: ManagedProcess[];
  activeCount: number;
  stoppedCount: number;
  failedCount: number;
  projectNameById: Map<string, string>;
  now: number;
}>();

const emit = defineEmits<{
  openDiagnostics: [];
}>();

interface SessionSnapshot {
  capturedAt: number;
  calls: number;
}

const metrics = ref<ApiRequestMetric[]>([]);
const sessionHistory = ref<SessionSnapshot[]>([]);
let refreshTimer: number | undefined;

const totals = computed(() => ({
  calls: metrics.value.reduce((sum, metric) => sum + metric.calls, 0),
  successes: metrics.value.reduce((sum, metric) => sum + metric.successes, 0),
  deduplicated: metrics.value.reduce(
    (sum, metric) => sum + metric.deduplicated,
    0,
  ),
  failures: metrics.value.reduce((sum, metric) => sum + metric.failures, 0),
  cancelled: metrics.value.reduce((sum, metric) => sum + metric.cancelled, 0),
}));

const successRate = computed(() => {
  const completed =
    totals.value.successes + totals.value.failures + totals.value.cancelled;
  if (completed === 0) return '—';
  return `${Math.round((totals.value.successes / completed) * 100)}%`;
});

const averageDuration = computed(() => {
  const durations = metrics.value
    .map((metric) => metric.lastDurationMs)
    .filter((duration): duration is number => duration !== undefined);
  if (durations.length === 0) return '—';
  const average =
    durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
  return `${Math.round(average)} ms`;
});

const recentProcesses = computed(() =>
  [...props.processes]
    .filter((process) => process.startedAt || process.stoppedAt)
    .sort((left, right) => processTimestamp(right) - processTimestamp(left))
    .slice(0, 4),
);

const chartPoints = computed(() => {
  if (sessionHistory.value.length < 2) return '';

  const width = 640;
  const height = 176;
  const padding = 12;
  const values = sessionHistory.value.map((snapshot) => snapshot.calls);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const step = (width - padding * 2) / (sessionHistory.value.length - 1);

  return sessionHistory.value
    .map((snapshot, index) => {
      const x = padding + index * step;
      const normalized = max === min ? 0.5 : (snapshot.calls - min) / span;
      const y = height - padding - normalized * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
});

const latestCallsLabel = computed(() => {
  if (totals.value.calls === 0)
    return 'Nenhuma chamada registrada nesta sessão';
  return `${totals.value.calls} ${
    totals.value.calls === 1 ? 'chamada registrada' : 'chamadas registradas'
  } nesta sessão`;
});

function refreshMetrics(): void {
  metrics.value = getApiRequestMetrics();
  const capturedAt = Date.now();
  const calls = metrics.value.reduce((sum, metric) => sum + metric.calls, 0);
  const previous = sessionHistory.value[sessionHistory.value.length - 1];

  if (
    !previous ||
    previous.calls !== calls ||
    capturedAt - previous.capturedAt >= 15_000
  ) {
    sessionHistory.value = [
      ...sessionHistory.value,
      { capturedAt, calls },
    ].slice(-30);
  }
}

function processTimestamp(process: ManagedProcess): number {
  const value = process.stoppedAt ?? process.startedAt;
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function projectName(process: ManagedProcess): string {
  return props.projectNameById.get(process.projectId) ?? process.projectId;
}

function relativeTime(process: ManagedProcess): string {
  const timestamp = processTimestamp(process);
  if (!timestamp) return 'sem horário';

  const elapsed = Math.max(0, props.now - timestamp);
  if (elapsed < 60_000) return 'agora';

  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `há ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;

  const days = Math.floor(hours / 24);
  return `há ${days} d`;
}

function activityTone(process: ManagedProcess): string {
  if (process.status === 'failed') return 'is-failed';
  if (process.status === 'stopped') return 'is-stopped';
  return 'is-active';
}

onMounted(() => {
  refreshMetrics();
  refreshTimer = window.setInterval(refreshMetrics, 3_000);
});

onBeforeUnmount(() => {
  if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
});
</script>

<template>
  <section
    class="processes-observability"
    aria-label="Resumo de observabilidade"
  >
    <dl class="processes-observability-kpis">
      <div class="processes-observability-kpi">
        <dt>Em execução</dt>
        <dd>{{ activeCount }}</dd>
        <span>{{ stoppedCount }} finalizados · {{ failedCount }} falhos</span>
      </div>
      <div class="processes-observability-kpi">
        <dt>Taxa de sucesso</dt>
        <dd>{{ successRate }}</dd>
        <span>{{ totals.successes }} respostas concluídas com sucesso</span>
      </div>
      <div class="processes-observability-kpi">
        <dt>Latência média</dt>
        <dd>{{ averageDuration }}</dd>
        <span>Última duração observada por endpoint</span>
      </div>
      <div class="processes-observability-kpi">
        <dt>Chamadas API</dt>
        <dd>{{ totals.calls }}</dd>
        <span>{{ totals.deduplicated }} deduplicadas na sessão</span>
      </div>
    </dl>

    <div class="processes-observability-grid">
      <article class="processes-observability-panel processes-session-panel">
        <header class="processes-observability-panel-header">
          <div>
            <span class="processes-observability-eyebrow">Sessão local</span>
            <h2>Atividade da API</h2>
          </div>
          <span class="processes-observability-live">
            <span aria-hidden="true" />
            Ao vivo
          </span>
        </header>

        <div class="processes-session-chart" aria-hidden="true">
          <svg viewBox="0 0 640 176" preserveAspectRatio="none">
            <line x1="12" y1="44" x2="628" y2="44" />
            <line x1="12" y1="88" x2="628" y2="88" />
            <line x1="12" y1="132" x2="628" y2="132" />
            <polyline v-if="chartPoints" :points="chartPoints" />
          </svg>
          <div v-if="!chartPoints" class="processes-session-chart-empty">
            Coletando atividade da sessão…
          </div>
        </div>

        <footer class="processes-session-chart-footer">
          <span>{{ latestCallsLabel }}</span>
          <span
            >{{ totals.failures }} falhas ·
            {{ totals.cancelled }} canceladas</span
          >
        </footer>
      </article>

      <article class="processes-observability-panel processes-recent-panel">
        <header class="processes-observability-panel-header">
          <div>
            <span class="processes-observability-eyebrow">Processos</span>
            <h2>Atividade recente</h2>
          </div>
        </header>

        <div v-if="recentProcesses.length > 0" class="processes-recent-list">
          <div
            v-for="process in recentProcesses"
            :key="process.id"
            class="processes-recent-item"
          >
            <span
              class="processes-recent-dot"
              :class="activityTone(process)"
              aria-hidden="true"
            />
            <div>
              <strong>{{ projectName(process) }}</strong>
              <span>
                {{ kindLabel(process.kind) }} ·
                {{ processStatusLabel(process.status) }}
              </span>
            </div>
            <time>{{ relativeTime(process) }}</time>
          </div>
        </div>
        <p v-else class="processes-recent-empty">
          A atividade dos processos aparecerá aqui assim que houver execuções.
        </p>
      </article>
    </div>

    <div class="processes-observability-diagnostic">
      <div>
        <span
          class="processes-observability-diagnostic-dot"
          aria-hidden="true"
        />
        <strong>Diagnóstico de chamadas</strong>
        <span>
          {{ totals.calls }} chamadas · {{ totals.deduplicated }} deduplicadas ·
          {{ totals.failures }} falhas
        </span>
      </div>
      <button type="button" @click="emit('openDiagnostics')">
        Ver métricas
      </button>
    </div>
  </section>
</template>
