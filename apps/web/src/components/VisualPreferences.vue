<script setup lang="ts">
import { ref } from 'vue';

import {
  loadVisualPreferences,
  saveVisualPreferences,
  type Theme,
} from '../utils/visual-preferences';

const initialPreferences = loadVisualPreferences();
const theme = ref<Theme>(initialPreferences.theme);

function selectTheme(value: Theme): void {
  theme.value = value;
  saveVisualPreferences(
    { theme: theme.value },
    typeof localStorage === 'undefined' ? undefined : localStorage,
  );
}
</script>

<template>
  <div
    class="segmented-control topbar-theme-toggle"
    role="group"
    aria-label="Tema"
  >
    <button type="button" :aria-pressed="theme === 'dark'" @click="selectTheme('dark')">
      Escuro
    </button>
    <button type="button" :aria-pressed="theme === 'light'" @click="selectTheme('light')">
      Claro
    </button>
  </div>
</template>
