<script setup lang="ts">
import { computed, ref } from 'vue';

import type { Project } from '@dev-dashboard/contracts';

import ProjectLogTerminal from './ProjectLogTerminal.vue';
import { useProjectLogsPolling } from '../composables/useProjectLogsPolling';
import { useProjectProcessStatus } from '../composables/useProjectProcessStatus';

const props = defineProps<{ project: Project }>();

const { processStatus, supportsServer, hasManagedProcess } =
  useProjectProcessStatus(() => props.project);

const logContainer = ref<HTMLElement | null>(null);
const { loadingLogs, logSnapshot, clearing, clearLogView } =
  useProjectLogsPolling(
    () => props.project,
    hasManagedProcess,
    supportsServer,
    logContainer,
  );

const isLoading = computed(
  () => loadingLogs.value && !logSnapshot.value?.content,
);
</script>

<template src="./ProjectLogsPanel.template.html"></template>

<style scoped>
.project-logs-terminal-only {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.project-log-terminal-empty {
  display: grid;
  place-items: center;
  min-height: 280px;
  flex: 1 1 auto;
  color: var(--text-muted);
  font-size: var(--font-sm);
}
</style>
