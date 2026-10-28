<script setup lang="ts">
import { computed } from 'vue';
import { MoonIcon, SunIcon } from '@heroicons/vue/24/outline';

import {
  currentTheme,
  saveVisualPreferences,
} from '../utils/visual-preferences';

const isDark = computed(() => currentTheme.value === 'dark');
const label = computed(() =>
  isDark.value ? 'Mudar para o tema claro' : 'Mudar para o tema escuro',
);

function toggleTheme(): void {
  saveVisualPreferences(
    { theme: isDark.value ? 'light' : 'dark' },
    typeof localStorage === 'undefined' ? undefined : localStorage,
  );
}
</script>

<template>
  <button
    type="button"
    class="theme-toggle"
    :aria-label="label"
    :title="label"
    @click="toggleTheme"
  >
    <SunIcon v-if="isDark" aria-hidden="true" />
    <MoonIcon v-else aria-hidden="true" />
  </button>
</template>

<style scoped>
.theme-toggle {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
  transition:
    color 160ms ease,
    background 160ms ease;
}

.theme-toggle:hover {
  color: var(--text);
  background: var(--surface-2);
}

.theme-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.theme-toggle svg {
  width: 20px;
  height: 20px;
}
</style>
