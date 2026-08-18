<script setup lang="ts">
import {
  ExclamationTriangleIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';

import type {
  LogExperienceIssue,
  LogExperienceIssueKind,
  LogExperienceLine,
  LogExperienceTone,
} from '../utils/log-experience';

interface MetricCard {
  key: string;
  label: string;
  value: number;
  tone: 'danger' | 'warning' | 'info';
}

defineProps<{
  metricCards: MetricCard[];
  issues: LogExperienceIssue[];
  selectedIssue?: LogExperienceIssue | undefined;
  selectedContext: LogExperienceLine[];
}>();

const emit = defineEmits<{
  'select-issue': [id: string];
}>();

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
</script>

<template>
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
          O diagnóstico não encontrou erros, avisos, retries ou eventos lentos
          no trecho disponível.
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
          @click="emit('select-issue', issue.id)"
        >
          <span class="log-experience-issue-kind">
            {{ issueKindLabel(issue.kind) }}
          </span>
          <span class="log-experience-issue-copy">
            <strong>{{ issue.title }}</strong>
            <small>{{ issue.summary }}</small>
          </span>
          <span v-if="issue.count > 1" class="log-experience-issue-count">
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

<style scoped>
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
  .log-experience-metrics,
  .log-experience-investigation-stats {
    grid-template-columns: 1fr;
  }
}
</style>
