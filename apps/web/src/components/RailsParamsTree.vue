<script setup lang="ts">
import { computed } from 'vue';

import type { ParamValue } from '../utils/ruby-inspect-parser';

defineOptions({ name: 'RailsParamsTree' });

const props = defineProps<{
  value: ParamValue;
}>();

type Entry = { key: string; value: ParamValue };

const isArray = computed(() => Array.isArray(props.value));
const isObject = computed(
  () => !isArray.value && typeof props.value === 'object' && props.value !== null,
);

const entries = computed<Entry[]>(() => {
  if (isArray.value) {
    return (props.value as ParamValue[]).map((value, index) => ({
      key: String(index),
      value,
    }));
  }

  if (isObject.value) {
    return Object.entries(props.value as Record<string, ParamValue>).map(([key, value]) => ({
      key,
      value,
    }));
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
  <div class="ptree">
    <template v-for="entry in entries" :key="entry.key">
      <div class="prow">
        <span class="pkey">{{ isArray ? `[${entry.key}]` : entry.key }}</span>
        <span class="pcolon">:</span>
        <span v-if="isFiltered(entry.value)" class="pmasked">mascarado</span>
        <span
          v-else-if="!isNested(entry.value)"
          :class="valueClass(entry.value)"
        >{{ formatScalar(entry.value) }}</span>
      </div>
      <div v-if="isNested(entry.value) && !isFiltered(entry.value)" class="pnest">
        <RailsParamsTree :value="entry.value" />
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
  padding: 9px 11px;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 8px;
  background: rgb(4 8 15 / 30%);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.75;
}

.prow {
  display: flex;
  flex-wrap: wrap;
  gap: 0 6px;
}

.pkey {
  color: #9ac2ff;
}

.pcolon {
  color: #7f8da0;
}

.pval-str {
  color: #f0b95c;
  overflow-wrap: anywhere;
}

.pval-num {
  color: #c9a9ff;
}

.pval-bool {
  color: #91e6a8;
}

.pval-null {
  color: #7f8da0;
  font-style: italic;
}

.pmasked {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border: 1px solid rgb(222 75 75 / 35%);
  border-radius: 4px;
  color: #ffadad;
  background: rgb(222 75 75 / 10%);
  font-size: 9.5px;
  font-weight: 700;
}

.pnest {
  padding-left: 14px;
  border-left: 1px solid rgb(255 255 255 / 8%);
  margin-left: 3px;
}
</style>
