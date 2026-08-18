<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import LogExperienceDiagnostic from './LogExperienceDiagnostic.vue';
import LogExperienceToolbar from './LogExperienceToolbar.vue';

import type {
  LogExperienceIssue,
  LogExperienceSource,
  LogExperienceTone,
} from '../utils/log-experience';
import {
  buildLogDiagnostics,
  parseLogExperience,
  summarizeLogDiagnostics,
} from '../utils/log-experience';

type FlowFilter = 'all' | 'errors' | 'warnings' | 'activity';
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
const filter = ref<FlowFilter>('all');
const searchQuery = ref('');
const selectedIssueId = ref('');
const flowElement = ref<HTMLElement | null>(null);
const follow = ref(true);

const lines = computed(() => parseLogExperience(props.content, props.source));
const issues = computed(() => buildLogDiagnostics(lines.value, props.source));
const summary = computed(() => summarizeLogDiagnostics(issues.value));

const filteredLines = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return lines.value.filter((line) => {
    if (query && !line.raw.toLowerCase().includes(query)) return false;
    if (filter.value === 'errors') return line.tone === 'danger';
    if (filter.value === 'warnings') return line.tone === 'warning';
    if (filter.value === 'activity') {
      return line.tone === 'info' || line.tone === 'success';
    }
    return true;
  });
});

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

function toneClass(tone: LogExperienceTone): string {
  return `log-experience-tone-${tone}`;
}

function formatDuration(value?: number): string {
  if (value === undefined) return '';
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 1 : 2)}s`;
  }
  return `${Number.isInteger(value) ? value : value.toFixed(1)}ms`;
}

function handleFlowScroll(): void {
  const element = flowElement.value;
  if (!element) return;
  follow.value =
    element.scrollHeight - element.scrollTop - element.clientHeight < 48;
}

async function scrollToEnd(): Promise<void> {
  if (!follow.value || mode.value !== 'flow') return;
  await nextTick();
  const element = flowElement.value;
  if (element) element.scrollTop = element.scrollHeight;
}

watch(
  () => props.content,
  () => {
    void scrollToEnd();
  },
);

watch(mode, () => {
  if (mode.value === 'flow') {
    follow.value = true;
    void scrollToEnd();
  }
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

    <template v-if="mode === 'flow'">
      <nav class="log-experience-filters" aria-label="Filtrar fluxo">
        <button
          type="button"
          :class="{ active: filter === 'all' }"
          @click="filter = 'all'"
        >
          Tudo
        </button>
        <button
          type="button"
          :class="{ active: filter === 'errors' }"
          @click="filter = 'errors'"
        >
          Erros
        </button>
        <button
          type="button"
          :class="{ active: filter === 'warnings' }"
          @click="filter = 'warnings'"
        >
          Avisos
        </button>
        <button
          type="button"
          :class="{ active: filter === 'activity' }"
          @click="filter = 'activity'"
        >
          Atividade
        </button>
        <span class="log-experience-follow">
          {{ follow ? 'Auto scroll' : 'Rolagem pausada' }}
        </span>
      </nav>

      <div
        ref="flowElement"
        class="log-experience-flow"
        tabindex="0"
        @scroll="handleFlowScroll"
      >
        <div v-if="!filteredLines.length" class="log-experience-empty">
          {{
            searchQuery || filter !== 'all'
              ? 'Nenhuma linha corresponde aos filtros.'
              : emptyLabel
          }}
        </div>
        <div
          v-for="line in filteredLines"
          v-else
          :key="line.id"
          class="log-experience-line"
          :class="toneClass(line.tone)"
        >
          <span class="log-experience-time">
            {{ line.time ?? String(line.index + 1).padStart(4, '0') }}
          </span>
          <span class="log-experience-tag">{{ line.tag }}</span>
          <span class="log-experience-line-text">{{ line.text }}</span>
          <span class="log-experience-duration">
            {{ formatDuration(line.durationMs) }}
          </span>
        </div>
      </div>
    </template>

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

.log-experience-toolbar {
  display: flex;
  min-height: 54px;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border);
}

.log-experience-mode-switch {
  display: flex;
  flex: 0 0 auto;
  padding: 3px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.log-experience-mode-switch button {
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  color: var(--text-muted);
  background: transparent;
  font: inherit;
  font-size: var(--font-xs);
  font-weight: 700;
  cursor: pointer;
}

.log-experience-mode-switch button.active {
  color: var(--accent);
  background: var(--surface-1);
  box-shadow: 0 1px 4px rgb(0 0 0 / 8%);
}

.log-experience-mode-count {
  display: inline-grid;
  min-width: 18px;
  height: 18px;
  place-items: center;
  padding: 0 5px;
  border-radius: 999px;
  color: var(--danger-text);
  background: var(--danger-surface);
  font-size: 9px;
}

.log-experience-search {
  display: flex;
  min-width: 180px;
  max-width: 520px;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
}

.log-experience-search svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  color: var(--text-dim);
}

.log-experience-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: var(--text);
  background: transparent;
  font: inherit;
  font-size: var(--font-xs);
}

.log-experience-live,
.log-experience-masked {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 10px;
  white-space: nowrap;
}

.log-experience-live i {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--success-text);
}

.log-experience-masked {
  color: var(--warning-text);
}

.log-experience-filters {
  display: flex;
  min-height: 43px;
  align-items: center;
  gap: 7px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
}

.log-experience-filters button {
  min-height: 27px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-muted);
  background: var(--surface-1);
  font: inherit;
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}

.log-experience-filters button.active {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  color: var(--accent);
  background: var(--accent-soft);
}

.log-experience-follow {
  margin-left: auto;
  color: var(--text-dim);
  font-size: 10px;
}

.log-experience-flow {
  max-height: min(58vh, 620px);
  min-height: 260px;
  overflow: auto;
  padding: 8px 0;
  outline: 0;
  background: var(--surface-1);
  font-family: var(--font-mono);
}

.log-experience--compact .log-experience-flow {
  min-height: 220px;
  max-height: 380px;
}

.log-experience-line {
  display: grid;
  min-height: 24px;
  grid-template-columns: 76px 72px minmax(0, 1fr) 72px;
  align-items: start;
  gap: 8px;
  padding: 3px 12px;
  border-left: 2px solid transparent;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.55;
}

.log-experience-line:hover {
  background: var(--surface-2);
}

.log-experience-time,
.log-experience-duration {
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.log-experience-duration {
  text-align: right;
}

.log-experience-tag {
  display: inline-flex;
  width: fit-content;
  min-width: 44px;
  min-height: 19px;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-3, var(--surface-2));
  font-family: var(--font-sans);
  font-size: 9px;
  font-weight: 800;
}

.log-experience-line-text {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--text);
}

.log-experience-tone-danger {
  border-left-color: var(--danger-text);
}

.log-experience-tone-danger .log-experience-tag,
.log-experience-tone-danger.log-experience-line.active {
  color: var(--danger-text);
  background: var(--danger-surface);
}

.log-experience-tone-warning {
  border-left-color: var(--warning-text);
}

.log-experience-tone-warning .log-experience-tag,
.log-experience-tone-warning.log-experience-line.active {
  color: var(--warning-text);
  background: var(--warning-surface);
}

.log-experience-tone-success .log-experience-tag {
  color: var(--success-text);
  background: var(--success-surface);
}

.log-experience-tone-info .log-experience-tag {
  color: var(--info-text);
  background: var(--info-surface);
}

.log-experience-empty {
  display: grid;
  min-height: 220px;
  place-items: center;
  padding: 24px;
  color: var(--text-dim);
  text-align: center;
  font-family: var(--font-sans);
  font-size: var(--font-xs);
}

@media (max-width: 900px) {
  .log-experience-toolbar {
    flex-wrap: wrap;
  }

  .log-experience-search {
    order: 3;
    max-width: none;
    flex-basis: 100%;
  }
}

@media (max-width: 620px) {
  .log-experience-mode-switch,
  .log-experience-mode-switch button {
    flex: 1;
  }

  .log-experience-mode-switch {
    width: 100%;
  }

  .log-experience-line {
    grid-template-columns: 54px 58px minmax(0, 1fr);
  }

  .log-experience-duration {
    display: none;
  }
}
</style>
