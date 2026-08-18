<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';

import type { LogExperienceLine } from '../utils/log-experience';

type FlowFilter = 'all' | 'errors' | 'warnings' | 'activity';

const props = withDefaults(
  defineProps<{
    lines: LogExperienceLine[];
    searchQuery: string;
    emptyLabel?: string;
    compact?: boolean;
  }>(),
  {
    emptyLabel: 'Nenhuma saída registrada.',
    compact: false,
  },
);

const filter = ref<FlowFilter>('all');
const flowElement = ref<HTMLElement | null>(null);
const follow = ref(true);

const filteredLines = computed(() => {
  const query = props.searchQuery.trim().toLowerCase();
  return props.lines.filter((line) => {
    if (query && !line.raw.toLowerCase().includes(query)) return false;
    if (filter.value === 'errors') return line.tone === 'danger';
    if (filter.value === 'warnings') return line.tone === 'warning';
    if (filter.value === 'activity') {
      return line.tone === 'info' || line.tone === 'success';
    }
    return true;
  });
});

function toneClass(tone: LogExperienceLine['tone']): string {
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
  if (!follow.value) return;
  await nextTick();
  const element = flowElement.value;
  if (element) element.scrollTop = element.scrollHeight;
}

watch(
  () => props.lines,
  () => {
    void scrollToEnd();
  },
);

onMounted(() => {
  void scrollToEnd();
});
</script>

<template>
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
    :class="{ 'log-experience--compact-flow': props.compact }"
    tabindex="0"
    @scroll="handleFlowScroll"
  >
    <div v-if="!filteredLines.length" class="log-experience-empty">
      {{
        props.searchQuery || filter !== 'all'
          ? 'Nenhuma linha corresponde aos filtros.'
          : props.emptyLabel
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

<style scoped>
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

.log-experience--compact-flow {
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

.log-experience-tone-danger .log-experience-tag {
  color: var(--danger-text);
  background: var(--danger-surface);
}

.log-experience-tone-warning {
  border-left-color: var(--warning-text);
}

.log-experience-tone-warning .log-experience-tag {
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

@media (max-width: 620px) {
  .log-experience-line {
    grid-template-columns: 54px 58px minmax(0, 1fr);
  }

  .log-experience-duration {
    display: none;
  }
}
</style>
