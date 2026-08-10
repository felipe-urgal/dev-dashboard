<script setup lang="ts">
import { computed } from 'vue';

import { SparklesIcon } from '@heroicons/vue/24/outline';

import type { AiImplementationExecution } from '@dev-dashboard/contracts';

import { RouterLink } from 'vue-router';

const props = defineProps<{
  projectId: string;
  execution: AiImplementationExecution | null;
}>();

const visible = computed(() => props.execution?.status === 'running');
</script>

<template>
  <RouterLink
    v-if="visible && execution"
    class="ai-execution-pill"
    :to="{ name: 'project-ai-assistant', params: { projectId } }"
  >
    <SparklesIcon aria-hidden="true" />
    <span>IA trabalhando</span>
    <strong>Abrir</strong>
  </RouterLink>
</template>

<style scoped>
.ai-execution-pill {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
  border-radius: 999px;
  color: var(--text);
  background: var(--surface-1);
  box-shadow: 0 14px 32px rgb(0 0 0 / 22%);
  font-size: var(--font-sm);
  text-decoration: none;
}
.ai-execution-pill svg {
  width: 17px;
  height: 17px;
  color: var(--accent);
}
.ai-execution-pill strong {
  padding-left: 7px;
  border-left: 1px solid var(--border);
  color: var(--accent);
  font-size: var(--font-xs);
}
@media (max-width: 720px) {
  .ai-execution-pill {
    right: 14px;
    bottom: 14px;
  }
}
</style>
