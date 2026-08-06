<script setup lang="ts">
import { ChartBarIcon } from '@heroicons/vue/24/outline';
import { computed, ref, watch } from 'vue';

import type {
  ProjectCoverageHistory,
  ProjectCoverageSummary,
  ProjectCoverageTotals,
  ProjectType,
} from '@dev-dashboard/contracts';

import { fetchProjectCoverage, fetchProjectCoverageHistory } from '../api';

const props = defineProps<{
  projectId: string;
  projectType?: ProjectType;
}>();

const reportHint = computed(() =>
  props.projectType === 'rails'
    ? 'coverage/.resultset.json'
    : 'coverage/coverage-final.json',
);

const emptyStateHint = computed(() =>
  props.projectType === 'rails'
    ? 'Rode os testes com o SimpleCov habilitado (`SimpleCov.start` no `spec_helper.rb`/`rails_helper.rb`) para ver o resumo aqui.'
    : 'Rode os testes com cobertura habilitada (Vitest/Jest/c8/nyc) para ver o resumo aqui — coverage-summary.json também é aceito quando coverage-final.json não estiver disponível.',
);

const loading = ref(false);
const errorMessage = ref('');
const coverage = ref<ProjectCoverageSummary | null>(null);
const history = ref<ProjectCoverageHistory | null>(null);
let generation = 0;

const metrics = computed<
  Array<{ key: keyof ProjectCoverageTotals; label: string }>
>(() => [
  { key: 'statements', label: 'Statements' },
  { key: 'branches', label: 'Branches' },
  { key: 'functions', label: 'Funções' },
  { key: 'lines', label: 'Linhas' },
]);

function toneFor(pct: number): 'success' | 'warning' | 'danger' {
  if (pct >= 80) return 'success';
  if (pct >= 50) return 'warning';
  return 'danger';
}

async function load(): Promise<void> {
  const requestGeneration = ++generation;
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await fetchProjectCoverage(props.projectId);
    if (requestGeneration !== generation) return;
    coverage.value = result;
  } catch (error) {
    if (requestGeneration !== generation) return;
    coverage.value = null;
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar a cobertura de testes.';
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }

  try {
    const result = await fetchProjectCoverageHistory(props.projectId);
    if (requestGeneration !== generation) return;
    history.value = result;
  } catch {
    if (requestGeneration !== generation) return;
    history.value = null;
  }
}

watch(() => props.projectId, load, { immediate: true });

defineExpose({ load });
</script>

<template>
  <section class="coverage-panel" aria-labelledby="coverage-panel-title">
    <header class="coverage-panel-heading">
      <div>
        <span id="coverage-panel-title">Cobertura de testes</span>
        <h3>Último relatório encontrado no projeto</h3>
      </div>
      <ChartBarIcon aria-hidden="true" />
    </header>

    <p v-if="errorMessage" class="project-error" role="alert">
      {{ errorMessage }}
    </p>

    <p v-else-if="loading" class="coverage-loading" aria-live="polite">
      Procurando relatório de cobertura…
    </p>

    <div v-else-if="coverage && !coverage.available" class="coverage-empty">
      Nenhum relatório encontrado em <code>{{ reportHint }}</code
      >.
      {{ emptyStateHint }}
    </div>

    <div v-else-if="coverage?.total" class="coverage-content">
      <p v-if="coverage.generatedAt" class="coverage-generated-at">
        Gerado em {{ new Date(coverage.generatedAt).toLocaleString('pt-BR') }}
      </p>

      <div class="coverage-totals">
        <div
          v-for="entry in metrics"
          :key="entry.key"
          class="coverage-chip"
          :class="`coverage-chip-${toneFor(coverage.total[entry.key].pct)}`"
        >
          <span class="coverage-chip-label">{{ entry.label }}</span>
          <span class="coverage-chip-value"
            >{{ coverage.total[entry.key].pct }}%</span
          >
          <span class="coverage-chip-detail">
            {{ coverage.total[entry.key].covered }}/{{
              coverage.total[entry.key].total
            }}
          </span>
        </div>
      </div>

      <div v-if="coverage.files?.length" class="coverage-table-wrap">
        <table class="coverage-table">
          <thead>
            <tr>
              <th scope="col">Arquivo</th>
              <th scope="col">Statements</th>
              <th scope="col">Branches</th>
              <th scope="col">Funções</th>
              <th scope="col">Linhas</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="file in coverage.files" :key="file.path">
              <td class="coverage-file-path">{{ file.path }}</td>
              <td :class="`is-${toneFor(file.statements.pct)}`">
                {{ file.statements.pct }}%
              </td>
              <td :class="`is-${toneFor(file.branches.pct)}`">
                {{ file.branches.pct }}%
              </td>
              <td :class="`is-${toneFor(file.functions.pct)}`">
                {{ file.functions.pct }}%
              </td>
              <td :class="`is-${toneFor(file.lines.pct)}`">
                {{ file.lines.pct }}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="history?.items.length" class="coverage-history">
        <h4>Histórico de execuções</h4>
        <div class="coverage-table-wrap">
          <table class="coverage-table">
            <thead>
              <tr>
                <th scope="col">Gerado em</th>
                <th scope="col">Statements</th>
                <th scope="col">Branches</th>
                <th scope="col">Funções</th>
                <th scope="col">Linhas</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in history.items" :key="entry.id">
                <td>
                  {{ new Date(entry.generatedAt).toLocaleString('pt-BR') }}
                </td>
                <td :class="`is-${toneFor(entry.total.statements.pct)}`">
                  {{ entry.total.statements.pct }}%
                </td>
                <td :class="`is-${toneFor(entry.total.branches.pct)}`">
                  {{ entry.total.branches.pct }}%
                </td>
                <td :class="`is-${toneFor(entry.total.functions.pct)}`">
                  {{ entry.total.functions.pct }}%
                </td>
                <td :class="`is-${toneFor(entry.total.lines.pct)}`">
                  {{ entry.total.lines.pct }}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.coverage-panel {
  display: grid;
  gap: var(--space-3);
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  padding: 20px;
  box-shadow: var(--shadow-1);
}

.coverage-panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.coverage-panel-heading span {
  color: var(--text-muted);
  font-size: var(--font-sm);
  font-weight: 600;
}

.coverage-panel-heading h3 {
  margin: 0;
  color: var(--text);
  font-size: var(--font-lg);
}

.coverage-panel-heading svg {
  width: 24px;
  height: 24px;
  flex: none;
  color: var(--text-dim);
}

.coverage-loading,
.coverage-empty {
  border-radius: var(--radius-md);
  background: var(--surface-2);
  color: var(--text-muted);
  padding: var(--space-3);
}

.coverage-empty code {
  color: var(--text);
}

.coverage-generated-at {
  margin: 0;
  color: var(--text-dim);
  font-size: var(--font-xs);
}

.coverage-totals {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-2);
}

.coverage-chip {
  display: grid;
  gap: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
}

.coverage-chip-label {
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: 600;
}

.coverage-chip-value {
  color: var(--text);
  font-size: var(--font-lg);
  font-weight: 700;
}

.coverage-chip-detail {
  color: var(--text-dim);
  font-size: var(--font-xs);
}

.coverage-chip-success {
  border-color: color-mix(in srgb, #15803d 28%, var(--border));
  background: color-mix(in srgb, #dcfce7 40%, var(--surface-1));
}

.coverage-chip-warning {
  border-color: color-mix(in srgb, #d97706 30%, var(--border));
  background: color-mix(in srgb, #ffedd5 40%, var(--surface-1));
}

.coverage-chip-danger {
  border-color: color-mix(in srgb, #dc2626 28%, var(--border));
  background: color-mix(in srgb, #fee2e2 40%, var(--surface-1));
}

.coverage-history h4 {
  margin: 0 0 var(--space-2);
  color: var(--text);
  font-size: var(--font-sm);
  font-weight: 600;
}

.coverage-table-wrap {
  max-height: 320px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.coverage-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-sm);
}

.coverage-table th,
.coverage-table td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.coverage-table thead th {
  position: sticky;
  top: 0;
  background: var(--surface-2);
  color: var(--text-muted);
  font-weight: 600;
}

.coverage-file-path {
  color: var(--text);
  font-family: var(--font-mono, monospace);
  word-break: break-all;
}

.coverage-table td.is-success {
  color: #166534;
}

.coverage-table td.is-warning {
  color: #b45309;
}

.coverage-table td.is-danger {
  color: #b91c1c;
}
</style>
