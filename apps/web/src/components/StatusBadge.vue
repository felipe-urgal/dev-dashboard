<script setup lang="ts">
import type { StatusBadgeSize, StatusBadgeTone } from './status-badge-types';

interface Props {
  tone: StatusBadgeTone;
  size?: StatusBadgeSize;
}

const props = withDefaults(defineProps<Props>(), {
  size: 'sm',
});
</script>

<template>
  <span
    class="dd-status-badge"
    :class="[`dd-status-badge-${props.tone}`, `dd-status-badge-${props.size}`]"
    :data-tone="props.tone"
  >
    <slot />
  </span>
</template>

<style scoped>
.dd-status-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-weight: var(--font-weight-strong);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}
.dd-status-badge-sm {
  padding: 2px 8px;
  font-size: var(--font-xs);
}
.dd-status-badge-md {
  padding: 4px 10px;
  font-size: var(--font-sm);
}
.dd-status-badge-success {
  background: var(--success-surface);
  color: var(--success-text);
}
.dd-status-badge-warning {
  background: var(--warning-surface);
  color: var(--warning-text);
}
.dd-status-badge-danger {
  background: var(--danger-surface);
  color: var(--danger-text);
}
.dd-status-badge-info {
  background: var(--info-surface);
  color: var(--info-text);
}
.dd-status-badge-neutral {
  background: var(--surface-3);
  color: var(--text-muted);
}
</style>
