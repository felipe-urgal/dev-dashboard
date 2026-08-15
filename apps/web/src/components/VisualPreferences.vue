<script setup lang="ts">
import { MoonIcon, SunIcon } from '@heroicons/vue/24/outline';

import {
  currentTheme,
  saveVisualPreferences,
  type Theme,
} from '../utils/visual-preferences';

function selectTheme(value: Theme): void {
  saveVisualPreferences(
    { theme: value },
    typeof localStorage === 'undefined' ? undefined : localStorage,
  );
}
</script>

<template>
  <div
    class="segmented-control sidebar-theme-toggle"
    role="group"
    aria-label="Tema"
  >
    <button
      type="button"
      :aria-pressed="currentTheme === 'dark'"
      @click="selectTheme('dark')"
    >
      <MoonIcon aria-hidden="true" />
      Escuro
    </button>
    <button
      type="button"
      :aria-pressed="currentTheme === 'light'"
      @click="selectTheme('light')"
    >
      <SunIcon aria-hidden="true" />
      Claro
    </button>
  </div>
</template>
