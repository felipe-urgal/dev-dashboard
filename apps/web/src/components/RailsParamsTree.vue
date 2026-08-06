<script setup lang="ts">
import { computed } from 'vue';

import type { ParamValue } from '../utils/ruby-inspect-parser';

defineOptions({ name: 'RailsParamsTree' });

const props = withDefaults(
  defineProps<{
    value: ParamValue;
    root?: boolean;
  }>(),
  { root: true },
);

type Entry = { key: string; value: ParamValue };

const isArray = computed(() => Array.isArray(props.value));
const isObject = computed(
  () =>
    !isArray.value && typeof props.value === 'object' && props.value !== null,
);

const entries = computed<Entry[]>(() => {
  if (isArray.value) {
    return (props.value as ParamValue[]).map((value, index) => ({
      key: String(index),
      value,
    }));
  }

  if (isObject.value) {
    return Object.entries(props.value as Record<string, ParamValue>).map(
      ([key, value]) => ({
        key,
        value,
      }),
    );
  }

  return [];
});

function isFiltered(value: ParamValue): boolean {
  return value === '[FILTERED]';
}

function isNested(value: ParamValue): boolean {
  return typeof value === 'object' && value !== null;
}

function valueClass(value: ParamValue): string {
  if (value === null) return 'pval-null';
  if (typeof value === 'string') return 'pval-str';
  if (typeof value === 'number') return 'pval-num';
  if (typeof value === 'boolean') return 'pval-bool';
  return '';
}

function formatScalar(value: ParamValue): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  return String(value);
}
</script>

<template>
  <div class="ptree" :class="{ 'ptree-root': root }">
    <template v-for="entry in entries" :key="entry.key">
      <div class="prow">
        <span class="pkey">{{ isArray ? `[${entry.key}]` : entry.key }}</span>
        <span class="pcolon">:</span>
        <span v-if="isFiltered(entry.value)" class="pmasked">mascarado</span>
        <span
          v-else-if="!isNested(entry.value)"
          :class="valueClass(entry.value)"
          >{{ formatScalar(entry.value) }}</span
        >
      </div>
      <div
        v-if="isNested(entry.value) && !isFiltered(entry.value)"
        class="pnest"
      >
        <RailsParamsTree :value="entry.value" :root="false" />
      </div>
    </template>

    <div v-if="!entries.length" class="prow">
      <span class="pval-null">vazio</span>
    </div>
  </div>
</template>

<style scoped>
.ptree {
  display: grid;
  gap: 2px;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.75;
}

/*
 * Only the outermost tree draws the box — RailsParamsTree renders itself
 * recursively for nested values, and every level used to redraw this same
 * translucent background, so deeper values sat under N stacked overlays
 * and looked progressively darker/muddier instead of just indented.
 */
/*
 * Colors read var()s defined on the ancestor .project-log-terminal (and
 * the app's global semantic/syntax tokens) — custom properties inherit
 * through the DOM regardless of Vue's per-component scoped CSS, so this
 * stays in sync with the terminal's dark/light theming without redefining
 * anything here.
 */
.ptree-root {
  padding: 9px 11px;
  border: 1px solid var(--term-border);
  border-radius: 8px;
  background: var(--term-code-bg);
}

.prow {
  display: flex;
  flex-wrap: wrap;
  gap: 0 6px;
}

.pkey {
  color: var(--info-text);
}

.pcolon {
  color: var(--term-text-faint);
}

.pval-str {
  color: var(--git-syntax-string);
  overflow-wrap: anywhere;
}

.pval-num {
  color: var(--git-syntax-number);
}

.pval-bool {
  color: var(--success-text);
}

.pval-null {
  color: var(--term-text-faint);
  font-style: italic;
}

.pmasked {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border: 1px solid color-mix(in srgb, var(--danger-text) 35%, transparent);
  border-radius: 4px;
  color: var(--danger-text);
  background: var(--danger-surface);
  font-size: 9.5px;
  font-weight: 700;
}

.pnest {
  padding-left: 14px;
  border-left: 1px solid var(--term-border);
  margin-left: 3px;
}
</style>
