<script setup lang="ts">
import {
  ArrowPathIcon,
  CheckCircleIcon,
  StopCircleIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';

import type {
  ScriptExecution,
  ScriptExecutionStatus,
} from '@dev-dashboard/contracts';

import {
  formatScriptExecutionDate,
  scriptExecutionDuration,
  scriptExecutionStatusLabels,
} from '../composables/useProjectScriptsPanel';
import StatusBadge from './StatusBadge.vue';

defineProps<{ execution: ScriptExecution }>();
defineEmits<{ open: [] }>();

function executionTone(
  status: ScriptExecutionStatus,
): 'info' | 'success' | 'danger' | 'warning' {
  if (status === 'running') return 'info';
  if (status === 'succeeded') return 'success';
  if (status === 'failed') return 'danger';
  return 'warning';
}

function executionIcon(status: ScriptExecutionStatus) {
  if (status === 'running') return ArrowPathIcon;
  if (status === 'succeeded') return CheckCircleIcon;
  if (status === 'failed') return XCircleIcon;
  return StopCircleIcon;
}
</script>

<template>
  <aside class="scripts-execution-strip" aria-live="polite">
    <span
      class="scripts-execution-strip-icon"
      :class="`is-${execution.status}`"
    >
      <component :is="executionIcon(execution.status)" aria-hidden="true" />
    </span>
    <div>
      <strong
        >{{ execution.actionName }} ·
        {{ scriptExecutionStatusLabels[execution.status] }}</strong
      >
      <span>
        {{ formatScriptExecutionDate(execution.startedAt) }}
        <template v-if="execution.finishedAt">
          · {{ scriptExecutionDuration(execution) }}</template
        >
      </span>
    </div>
    <StatusBadge :tone="executionTone(execution.status)">
      {{ scriptExecutionStatusLabels[execution.status] }}
    </StatusBadge>
    <button type="button" @click="$emit('open')">Ver execução</button>
  </aside>
</template>
