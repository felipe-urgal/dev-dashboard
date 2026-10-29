<script setup lang="ts">
import { computed } from 'vue';

import type { TestIntelligenceSuggestion } from '@dev-dashboard/contracts';

import UiTag from '../ui/UiTag.vue';

const props = defineProps<{
  intelligence: TestIntelligenceSuggestion | null;
}>();

const flaky = computed(() =>
  props.intelligence?.flakiness?.state === 'available'
    ? props.intelligence.flakiness.tests
    : [],
);

const coverage = computed(() => {
  const delta = props.intelligence?.coverageDelta;
  return delta?.state === 'available' && delta.total ? delta : null;
});

function signed(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}
</script>

<template>
  <section v-if="flaky.length > 0 || coverage" class="test-insights">
    <div v-if="flaky.length > 0" class="test-insights-card">
      <header>
        <strong>Testes instáveis</strong>
        <UiTag tone="warning">{{ flaky.length }}</UiTag>
      </header>
      <ul>
        <li v-for="test in flaky.slice(0, 5)" :key="test.testIdentity">
          <code>{{ test.testIdentity }}</code>
          <small>
            {{ test.failed }} falhas em {{ test.attempts }} execuções
          </small>
        </li>
      </ul>
    </div>

    <div v-if="coverage?.total" class="test-insights-card">
      <header>
        <strong>Cobertura</strong>
        <UiTag :tone="coverage.total.lines < 0 ? 'danger' : 'success'">
          linhas {{ signed(coverage.total.lines) }}
        </UiTag>
      </header>
      <p>
        Branches {{ signed(coverage.total.branches) }} · funções
        {{ signed(coverage.total.functions) }}
        <template v-if="coverage.worsenedFiles.length > 0">
          · {{ coverage.worsenedFiles.length }} arquivo(s) pioraram
        </template>
      </p>
    </div>
  </section>
</template>

<style scoped>
.test-insights {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.test-insights-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-0);
  font-size: 13px;
}

.test-insights-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.test-insights-card ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.test-insights-card li {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 3px 0;
}

.test-insights-card code {
  overflow: hidden;
  font-family: var(--font-family-mono);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.test-insights-card small,
.test-insights-card p {
  margin: 0;
  color: var(--text-dim);
  font-size: 12px;
}
</style>
