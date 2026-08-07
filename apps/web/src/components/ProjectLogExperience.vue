<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';

import type {
  LogExperienceIssue,
  LogExperienceIssueKind,
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

function issueKindLabel(kind: LogExperienceIssueKind): string {
  switch (kind) {
    case 'error':
      return 'ERRO';
    case 'warning':
      return 'AVISO';
    case 'slow':
      return 'LENTO';
    case 'retry':
      return 'RETRY';
    case 'failure':
      return 'FALHA';
    default:
      return 'BUILD';
  }
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
    <header class="log-experience-toolbar">
      <div
        class="log-experience-mode-switch"
        role="tablist"
        aria-label="Modo do log"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'flow'"
          :class="{ active: mode === 'flow' }"
          @click="mode = 'flow'"
        >
          {{ flowLabel }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="mode === 'diagnostic'"
          :class="{ active: mode === 'diagnostic' }"
          @click="mode = 'diagnostic'"
        >
          {{ diagnosticLabel }}
          <span v-if="issues.length" class="log-experience-mode-count">
            {{ issues.length }}
          </span>
        </button>
      </div>

      <label class="log-experience-search">
        <MagnifyingGlassIcon aria-hidden="true" />
        <span class="sr-only">Buscar no log</span>
        <input
          v-model="searchQuery"
          type="search"
          placeholder="Buscar nos logs..."
        />
      </label>

      <span v-if="running" class="log-experience-live">
        <i aria-hidden="true"></i>
        Em execução
      </span>
      <span v-if="maskedCount" class="log-experience-masked">
        {{ maskedCount }} ocorrência(s) sensível(is) mascarada(s)
      </span>
    </header>

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

    <template v-else>
      <div class="log-experience-diagnostic">
        <div class="log-experience-metrics">
          <article v-for="metric in metricCards" :key="metric.key">
            <strong :class="`is-${metric.tone}`">{{ metric.value }}</strong>
            <span>{{ metric.label }}</span>
          </article>
        </div>

        <div v-if="!issues.length" class="log-experience-healthy">
          <span class="log-experience-healthy-icon">✓</span>
          <div>
            <strong>Nenhum problema evidente encontrado</strong>
            <p>
              O diagnóstico não encontrou erros, avisos, retries ou eventos
              lentos no trecho disponível.
            </p>
          </div>
        </div>

        <div v-else class="log-experience-diagnostic-layout">
          <aside class="log-experience-issues" aria-label="Problemas encontrados">
            <header>
              <strong>Problemas encontrados</strong>
              <span>{{ issues.length }}</span>
            </header>
            <button
              v-for="issue in issues"
              :key="issue.id"
              type="button"
              :class="[
                `is-${issue.tone}`,
                { active: selectedIssue?.id === issue.id },
              ]"
              @click="selectedIssueId = issue.id"
            >
              <span class="log-experience-issue-kind">
                {{ issueKindLabel(issue.kind) }}
              </span>
              <span class="log-experience-issue-copy">
                <strong>{{ issue.title }}</strong>
                <small>{{ issue.summary }}</small>
              </span>
              <span
                v-if="issue.count > 1"
                class="log-experience-issue-count"
              >
                {{ issue.count }}×
              </span>
            </button>
          </aside>

          <article v-if="selectedIssue" class="log-experience-investigation">
            <header :class="`is-${selectedIssue.tone}`">
              <component
                :is="
                  selectedIssue.tone === 'danger'
                    ? XCircleIcon
                    : ExclamationTriangleIcon
                "
                aria-hidden="true"
              />
              <div>
                <span>{{ issueKindLabel(selectedIssue.kind) }}</span>
                <h4>{{ selectedIssue.title }}</h4>
                <p>{{ selectedIssue.detail }}</p>
              </div>
              <strong v-if="selectedIssue.durationMs">
                {{ formatDuration(selectedIssue.durationMs) }}
              </strong>
            </header>

            <section>
              <h5>O que chamou atenção</h5>
              <dl class="log-experience-investigation-stats">
                <div>
                  <dt>Ocorrências</dt>
                  <dd>{{ selectedIssue.count }}</dd>
                </div>
                <div>
                  <dt>Primeira linha</dt>
                  <dd>{{ selectedIssue.firstLineIndex + 1 }}</dd>
                </div>
                <div>
                  <dt>Última linha</dt>
                  <dd>{{ selectedIssue.lastLineIndex + 1 }}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h5>Contexto próximo</h5>
              <div class="log-experience-context">
                <div
                  v-for="line in selectedContext"
                  :key="line.id"
                  :class="[
                    toneClass(line.tone),
                    {
                      active:
                        line.index >= selectedIssue.firstLineIndex &&
                        line.index <= selectedIssue.lastLineIndex,
                    },
                  ]"
                >
                  <span>{{ line.index + 1 }}</span>
                  <code>{{ line.text }}</code>
                </div>
              </div>
            </section>
          </article>
        </div>

        <div class="log-experience-diagnostic-extra">
          <slot name="diagnostic-extra" />
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.log-experience {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
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
  min-height: 28px;
  grid-template-columns: 76px 72px minmax(0, 1fr) 72px;
  align-items: start;
  gap: 8px;
  padding: 5px 12px;
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

.log-experience-diagnostic {
  padding: 12px;
}

.log-experience-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.log-experience-metrics article {
  display: flex;
  min-height: 62px;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
}

.log-experience-metrics strong {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 999px;
  color: var(--text);
  background: var(--surface-2);
  font-family: var(--font-mono);
  font-size: 14px;
}

.log-experience-metrics strong.is-danger {
  color: var(--danger-text);
  background: var(--danger-surface);
}

.log-experience-metrics strong.is-warning {
  color: var(--warning-text);
  background: var(--warning-surface);
}

.log-experience-metrics strong.is-info {
  color: var(--info-text);
  background: var(--info-surface);
}

.log-experience-metrics span {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
}

.log-experience-diagnostic-layout {
  display: grid;
  grid-template-columns: minmax(240px, 34%) minmax(0, 1fr);
  min-height: 330px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.log-experience-issues {
  min-width: 0;
  border-right: 1px solid var(--border);
  background: var(--surface-2);
}

.log-experience-issues > header {
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 10px;
}

.log-experience-issues > header span {
  font-family: var(--font-mono);
}

.log-experience-issues > button {
  display: grid;
  width: 100%;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 8px;
  padding: 10px;
  border: 0;
  border-bottom: 1px solid var(--border);
  color: var(--text);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.log-experience-issues > button:hover,
.log-experience-issues > button.active {
  background: var(--surface-1);
}

.log-experience-issues > button.active {
  box-shadow: inset 3px 0 0 var(--accent);
}

.log-experience-issue-kind {
  display: inline-flex;
  min-height: 20px;
  align-items: center;
  padding: 0 6px;
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-1);
  font-size: 8px;
  font-weight: 800;
}

.log-experience-issues > button.is-danger .log-experience-issue-kind {
  color: var(--danger-text);
  background: var(--danger-surface);
}

.log-experience-issues > button.is-warning .log-experience-issue-kind {
  color: var(--warning-text);
  background: var(--warning-surface);
}

.log-experience-issue-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.log-experience-issue-copy strong,
.log-experience-issue-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-experience-issue-copy strong {
  font-size: 10.5px;
}

.log-experience-issue-copy small,
.log-experience-issue-count {
  color: var(--text-dim);
  font-size: 9.5px;
}

.log-experience-issue-count {
  font-family: var(--font-mono);
}

.log-experience-investigation {
  min-width: 0;
  background: var(--surface-1);
}

.log-experience-investigation > header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 13px 14px;
  border-bottom: 1px solid var(--border);
}

.log-experience-investigation > header.is-danger {
  background: var(--danger-surface);
}

.log-experience-investigation > header.is-warning {
  background: var(--warning-surface);
}

.log-experience-investigation > header svg {
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
}

.log-experience-investigation > header.is-danger svg {
  color: var(--danger-text);
}

.log-experience-investigation > header.is-warning svg {
  color: var(--warning-text);
}

.log-experience-investigation > header div {
  min-width: 0;
  flex: 1;
}

.log-experience-investigation > header span,
.log-experience-investigation h5 {
  color: var(--text-dim);
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.log-experience-investigation h4 {
  margin: 2px 0 3px;
  color: var(--text);
  font-size: 13px;
}

.log-experience-investigation p {
  margin: 0;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.log-experience-investigation > header > strong {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
}

.log-experience-investigation > section {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}

.log-experience-investigation h5 {
  margin: 0 0 8px;
}

.log-experience-investigation-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.log-experience-investigation-stats div {
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-2);
}

.log-experience-investigation-stats dt {
  color: var(--text-dim);
  font-size: 9px;
}

.log-experience-investigation-stats dd {
  margin: 4px 0 0;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
}

.log-experience-context {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-2);
}

.log-experience-context > div {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 8px;
  padding: 5px 8px;
  border-left: 2px solid transparent;
  color: var(--text-muted);
  font-size: 10px;
}

.log-experience-context > div.active {
  background: var(--surface-1);
}

.log-experience-context > div > span {
  color: var(--text-dim);
  font-family: var(--font-mono);
  text-align: right;
}

.log-experience-context code {
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.log-experience-healthy {
  display: flex;
  min-height: 230px;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  color: var(--text-muted);
  text-align: left;
}

.log-experience-healthy-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 999px;
  color: var(--success-text);
  background: var(--success-surface);
  font-weight: 900;
}

.log-experience-healthy strong {
  display: block;
  color: var(--text);
  font-size: 12px;
}

.log-experience-healthy p {
  max-width: 520px;
  margin: 4px 0 0;
  color: var(--text-dim);
  font-size: 10.5px;
  line-height: 1.5;
}

.log-experience-diagnostic-extra:empty {
  display: none;
}

.log-experience-diagnostic-extra:not(:empty) {
  margin-top: 12px;
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

  .log-experience-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .log-experience-diagnostic-layout {
    grid-template-columns: 1fr;
  }

  .log-experience-issues {
    max-height: 260px;
    overflow: auto;
    border-right: 0;
    border-bottom: 1px solid var(--border);
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

  .log-experience-metrics,
  .log-experience-investigation-stats {
    grid-template-columns: 1fr;
  }
}
</style>
