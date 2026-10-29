<script setup lang="ts">
import type { TestRunResult } from '@dev-dashboard/contracts';

import UiButton from '../ui/UiButton.vue';
import UiTag from '../ui/UiTag.vue';

const props = defineProps<{
  result: TestRunResult;
  disabled: boolean;
}>();

const emit = defineEmits<{ 'rerun-failed': [] }>();

function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) return '';
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function locationLabel(failure: TestRunResult['failures'][number]): string {
  if (!failure.location) return '';
  return failure.location.line
    ? `${failure.location.path}:${failure.location.line}`
    : failure.location.path;
}
</script>

<template>
  <div class="test-results">
    <header>
      <div class="test-results-summary">
        <UiTag :tone="props.result.summary.failed > 0 ? 'danger' : 'success'">
          {{ props.result.summary.failed > 0 ? 'Falhou' : 'Tudo passou' }}
        </UiTag>
        <span>{{ props.result.summary.total }} testes</span>
        <UiTag tone="success">{{ props.result.summary.passed }} passaram</UiTag>
        <UiTag v-if="props.result.summary.failed > 0" tone="danger">
          {{ props.result.summary.failed }} falharam
        </UiTag>
        <UiTag v-if="props.result.summary.pending > 0" tone="warning">
          {{ props.result.summary.pending }} pendentes
        </UiTag>
        <small v-if="props.result.summary.durationMs !== undefined">
          {{ formatDuration(props.result.summary.durationMs) }}
        </small>
      </div>
      <UiButton
        v-if="props.result.failedFiles.length > 0"
        variant="primary"
        class="test-results-rerun"
        :disabled="disabled"
        @click="emit('rerun-failed')"
      >
        Rodar só as que falharam ({{ props.result.failedFiles.length }}
        {{ props.result.failedFiles.length === 1 ? 'arquivo' : 'arquivos' }})
      </UiButton>
    </header>

    <p v-if="props.result.failures.length === 0" class="test-results-ok">
      {{
        props.result.summary.failed > 0
          ? 'Houve falhas, mas o runner não informou os detalhes. Veja a aba Saída.'
          : 'Nenhuma falha nesta execução.'
      }}
    </p>

    <ul v-else class="test-results-failures">
      <li v-for="failure in props.result.failures" :key="failure.id">
        <strong>{{ failure.name }}</strong>
        <code v-if="failure.location" class="test-results-location">
          {{ locationLabel(failure) }}
        </code>
        <pre class="test-results-message">{{ failure.message }}</pre>
        <p v-if="failure.expected !== undefined || failure.actual !== undefined">
          <small>
            esperado <code>{{ failure.expected ?? '—' }}</code> · recebido
            <code>{{ failure.actual ?? '—' }}</code>
          </small>
        </p>
        <details v-if="failure.stack.length > 0">
          <summary>Stack</summary>
          <pre>{{ failure.stack.join('\n') }}</pre>
        </details>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.test-results {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: auto;
}

.test-results header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.test-results-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.test-results-summary small {
  color: var(--text-dim);
}

.test-results-ok {
  margin: 0;
  padding: 24px 16px;
  color: var(--text-muted);
  font-size: 13px;
}

.test-results-failures {
  margin: 0;
  padding: 0;
  list-style: none;
}

.test-results-failures li {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

.test-results-failures li:first-child {
  border-top: 0;
}

.test-results-location {
  color: var(--accent);
  font-family: var(--font-family-mono);
  font-size: 12px;
}

.test-results-message {
  margin: 0;
  color: var(--danger-text, #f85149);
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.test-results-failures p {
  margin: 0;
  color: var(--text-dim);
}

.test-results-failures code {
  font-family: var(--font-family-mono);
}

.test-results-failures details summary {
  color: var(--text-dim);
  font-size: 12px;
  cursor: pointer;
}

.test-results-failures details pre {
  margin: 6px 0 0;
  padding: 10px 12px;
  overflow: auto;
  border-radius: 8px;
  color: var(--text-muted);
  background: var(--surface-0);
  font-family: var(--font-family-mono);
  font-size: 12px;
}
</style>
