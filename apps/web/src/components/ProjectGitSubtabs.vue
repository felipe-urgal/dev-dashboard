<script setup lang="ts">
import type { Component } from 'vue';

import {
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentMagnifyingGlassIcon,
  ShareIcon,
} from '@heroicons/vue/24/outline';

import type { GitTab, GitTabOption } from '../composables/useProjectGitPanel';

const heroiconByTab: Partial<Record<GitTab, Component>> = {
  sync: ArrowsRightLeftIcon,
  branches: ShareIcon,
  diff: DocumentMagnifyingGlassIcon,
  commit: CheckCircleIcon,
  history: ClockIcon,
};

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
      :data-has-heroicon="heroiconByTab[tab.id] ? 'true' : undefined"
      :class="{ active: activeTab === tab.id }"
      @click="emit('select', tab.id)"
    >
      <span
        v-if="heroiconByTab[tab.id]"
        class="git-tab-heroicon"
        aria-hidden="true"
      >
        <component :is="heroiconByTab[tab.id]" class="git-tab-heroicon-svg" />
      </span>
      {{ tab.label }}
    </button>
  </nav>
</template>
