<script setup lang="ts">
import type { GitTab, GitTabOption } from '../composables/useProjectGitPanel';

defineProps<{
  tabs: readonly GitTabOption[];
  activeTab: GitTab;
}>();

const emit = defineEmits<{
  select: [tab: GitTab];
}>();
</script>

<template>
  <nav class="git-subtabs" aria-label="Áreas do Git">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      type="button"
      :data-icon="tab.icon"
      :class="{ active: activeTab === tab.id }"
      @click="emit('select', tab.id)"
    >
      {{ tab.label }}
    </button>
  </nav>
</template>
