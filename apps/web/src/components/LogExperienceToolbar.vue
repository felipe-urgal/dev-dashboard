<script setup lang="ts">
import { MagnifyingGlassIcon } from '@heroicons/vue/24/outline';

type LogMode = 'flow' | 'diagnostic';

const props = withDefaults(
  defineProps<{
    mode: LogMode;
    searchQuery: string;
    flowLabel?: string;
    diagnosticLabel?: string;
    issueCount?: number;
    running?: boolean;
    maskedCount?: number;
  }>(),
  {
    flowLabel: 'Fluxo',
    diagnosticLabel: 'Diagnóstico',
    issueCount: 0,
    running: false,
    maskedCount: 0,
  },
);

const emit = defineEmits<{
  'update:mode': [value: LogMode];
  'update:searchQuery': [value: string];
}>();
</script>

<template>
  <header class="log-experience-toolbar">
    <div
      class="log-experience-mode-switch"
      role="tablist"
      aria-label="Modo do log"
    >
      <button
        type="button"
        role="tab"
        :aria-selected="props.mode === 'flow'"
        :class="{ active: props.mode === 'flow' }"
        @click="emit('update:mode', 'flow')"
      >
        {{ props.flowLabel }}
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="props.mode === 'diagnostic'"
        :class="{ active: props.mode === 'diagnostic' }"
        @click="emit('update:mode', 'diagnostic')"
      >
        {{ props.diagnosticLabel }}
        <span v-if="props.issueCount" class="log-experience-mode-count">{{
          props.issueCount
        }}</span>
      </button>
    </div>

    <label class="log-experience-search">
      <MagnifyingGlassIcon aria-hidden="true" />
      <span class="sr-only">Buscar no log</span>
      <input
        :value="props.searchQuery"
        type="search"
        placeholder="Buscar nos logs..."
        @input="
          emit('update:searchQuery', ($event.target as HTMLInputElement).value)
        "
      />
    </label>

    <span v-if="props.running" class="log-experience-live"
      ><i aria-hidden="true"></i>Em execução</span
    >
    <span v-if="props.maskedCount" class="log-experience-masked"
      >{{ props.maskedCount }} ocorrência(s) sensível(is) mascarada(s)</span
    >
  </header>
</template>

<style scoped>
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
</style>
