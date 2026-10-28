<script setup lang="ts">
import { MagnifyingGlassIcon } from '@heroicons/vue/24/outline';

defineProps<{
  modelValue: string;
  placeholder: string;
  /** Nome acessível do campo (o rótulo visual é o placeholder). */
  label: string;
}>();

defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <label class="ui-search">
    <MagnifyingGlassIcon aria-hidden="true" />
    <span class="ui-search-label">{{ label }}</span>
    <input
      :value="modelValue"
      type="search"
      :placeholder="placeholder"
      @input="
        $emit('update:modelValue', ($event.target as HTMLInputElement).value)
      "
    />
  </label>
</template>

<style scoped>
.ui-search {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text-dim);
  background: var(--surface-0);
}

.ui-search:focus-within {
  border-color: var(--accent);
}

.ui-search svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
}

.ui-search input {
  width: 100%;
  min-width: 0;
  height: 32px;
  border: 0;
  color: var(--text);
  background: transparent;
  font: inherit;
  font-size: 13px;
  outline: 0;
}

.ui-search-label {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
</style>
