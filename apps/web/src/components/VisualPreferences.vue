<script setup lang="ts">
import { ref } from 'vue';

import {
  loadVisualPreferences,
  saveVisualPreferences,
  type Density,
  type Theme,
} from '../utils/visual-preferences';

const initialPreferences = loadVisualPreferences();
const theme = ref<Theme>(initialPreferences.theme);
const density = ref<Density>(initialPreferences.density);

function selectTheme(value: Theme): void {
  theme.value = value;
  persist();
}

function selectDensity(value: Density): void {
  density.value = value;
  persist();
}

function persist(): void {
  saveVisualPreferences(
    { theme: theme.value, density: density.value },
    typeof localStorage === 'undefined' ? undefined : localStorage,
  );
}
</script>

<template>
  <section class="visual-preferences" aria-label="Preferências visuais">
    <div class="preference-group">
      <span id="theme-label" class="sidebar-label">Tema</span>
      <div class="segmented-control" role="group" aria-labelledby="theme-label">
        <button type="button" :aria-pressed="theme === 'dark'" @click="selectTheme('dark')">
          Escuro
        </button>
        <button type="button" :aria-pressed="theme === 'light'" @click="selectTheme('light')">
          Claro
        </button>
      </div>
    </div>

    <div class="preference-group">
      <span id="density-label" class="sidebar-label">Densidade</span>
      <div class="segmented-control" role="group" aria-labelledby="density-label">
        <button type="button" :aria-pressed="density === 'comfortable'" @click="selectDensity('comfortable')">
          Cômoda
        </button>
        <button type="button" :aria-pressed="density === 'compact'" @click="selectDensity('compact')">
          Compacta
        </button>
      </div>
    </div>
  </section>
</template>
