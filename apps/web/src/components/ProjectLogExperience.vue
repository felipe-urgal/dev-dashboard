<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import LogExperienceDiagnostic from './LogExperienceDiagnostic.vue';
import LogExperienceFlow from './LogExperienceFlow.vue';
import LogExperienceToolbar from './LogExperienceToolbar.vue';

import type {
  LogExperienceIssue,
  LogExperienceSource,
} from '../utils/log-experience';
import {
  buildLogDiagnostics,
  parseLogExperience,
  summarizeLogDiagnostics,
} from '../utils/log-experience';

type MetricTone = 'danger' | 'warning' | 'info';

interface MetricCard {
  key: string;
  label: string;
  value: number;
  tone: MetricTone;
}

const props = withDefaults(
  defineProps<{
    content: string;
    source: LogExperienceSource;
    flowLabel?: string;
    diagnosticLabel?: string;
    emptyLabel?: string;
    running?: boolean;
    maskedCount?: number;
    compact?: boolean;
  }>(),
  {
    flowLabel: 'Fluxo',
    diagnosticLabel: 'Diagnóstico',
    emptyLabel: 'Nenhuma saída registrada.',
    running: false,
    maskedCount: 0,
    compact: false,
  },
);

const mode = ref<'flow' | 'diagnostic'>('flow');
const searchQuery = ref('');
const selectedIssueId = ref('');

const lines = computed(() => parseLogExperience(props.content, props.source));
const issues = computed(() => buildLogDiagnostics(lines.value, props.source));
const summary = computed(() => summarizeLogDiagnostics(issues.value));

const selectedIssue = computed<LogExperienceIssue | undefined>(() => {
  return (
    issues.value.find((issue) => issue.id === selectedIssueId.value) ??
    issues.value[0]
  );
});

const selectedContext = computed(() => {
  const issue = selectedIssue.value;
  if (!issue) return [];
  const from = Math.max(0, issue.firstLineIndex - 2);
  const to = issue.lastLineIndex + 2;
  return lines.value.filter((line) => line.index >= from && line.index <= to);
});

const metricCards = computed<MetricCard[]>(() => {
  const base: MetricCard[] = [
    {
      key: 'errors',
      label: props.source === 'test' ? 'Falhas' : 'Erros',
      value:
        props.source === 'test' ? summary.value.failures : summary.value.errors,
      tone: 'danger',
    },
    {
      key: 'slow',
      label:
        props.source === 'webpack'
          ? 'Builds lentos'
          : props.source === 'sidekiq'
            ? 'Jobs lentos'
            : 'Execuções lentas',
      value: summary.value.slow,
      tone: 'warning',
    },
  ];

  if (props.source === 'sidekiq') {
    base.push({
      key: 'retries',
      label: 'Retries',
      value: summary.value.retries,
      tone: 'warning',
    });
  }

  base.push({
    key: 'warnings',
    label: 'Avisos',
    value: summary.value.warnings,
    tone: 'info',
  });

  return base;
});

watch(issues, (nextIssues) => {
  if (!nextIssues.some((issue) => issue.id === selectedIssueId.value)) {
    selectedIssueId.value = nextIssues[0]?.id ?? '';
  }
});
</script>

<template>
  <section
    class="log-experience"
    :class="{ 'log-experience--compact': compact }"
  >
    <LogExperienceToolbar
      v-model:mode="mode"
      v-model:search-query="searchQuery"
      :flow-label="flowLabel"
      :diagnostic-label="diagnosticLabel"
      :issue-count="issues.length"
      :running="running"
      :masked-count="maskedCount"
    />

    <LogExperienceFlow
      v-if="mode === 'flow'"
      :lines="lines"
      :search-query="searchQuery"
      :empty-label="emptyLabel"
      :compact="compact"
    />

    <LogExperienceDiagnostic
      v-else
      :metric-cards="metricCards"
      :issues="issues"
      :selected-issue="selectedIssue"
      :selected-context="selectedContext"
      @select-issue="selectedIssueId = $event"
    >
      <template #diagnostic-extra>
        <slot name="diagnostic-extra" />
      </template>
    </LogExperienceDiagnostic>
  </section>
</template>

<style scoped>
.log-experience {
  /* All log sources remain terminal-dark, even when the app is light. */
  --surface-1: #0d1117;
  --surface-2: #161b22;
  --surface-3: #21262d;
  --border: #30363d;
  --text: #e6edf3;
  --text-muted: #c9d1d9;
  --text-dim: #8b949e;
  --accent: #58a6ff;
  --accent-soft: rgb(56 139 253 / 16%);
  --success-text: #7ee787;
  --success-surface: rgb(46 160 67 / 18%);
  --warning-text: #e3b341;
  --warning-surface: rgb(187 128 9 / 18%);
  --danger-text: #ff7b72;
  --danger-surface: rgb(248 81 73 / 16%);
  --info-text: #79c0ff;
  --info-surface: rgb(56 139 253 / 16%);

  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--surface-1);
  color-scheme: dark;
}
</style>
