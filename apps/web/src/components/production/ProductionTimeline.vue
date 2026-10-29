<script setup lang="ts">
export interface ProductionTimelineStep {
  id: string;
  label: string;
  script?: string | undefined;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  statusLabel: string;
}

defineProps<{ steps: readonly ProductionTimelineStep[] }>();
</script>

<template>
  <ol class="prod-timeline">
    <li v-for="step in steps" :key="step.id" :data-status="step.status">
      <span class="prod-timeline-dot" aria-hidden="true" />
      <div>
        <strong>{{ step.label }}</strong>
        <code v-if="step.script">{{ step.script }}</code>
        <small>{{ step.statusLabel }}</small>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.prod-timeline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.prod-timeline li {
  display: flex;
  min-width: 150px;
  flex: 1 1 150px;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-0);
}

.prod-timeline-dot {
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--border-strong);
}

li[data-status='succeeded'] .prod-timeline-dot {
  background: var(--success-text);
}

li[data-status='failed'] .prod-timeline-dot {
  background: var(--danger-text, #f85149);
}

li[data-status='running'] .prod-timeline-dot {
  background: var(--accent);
  animation: prod-pulse 1.2s ease-in-out infinite;
}

li[data-status='cancelled'] .prod-timeline-dot {
  background: var(--warning-text);
}

.prod-timeline div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.prod-timeline code {
  color: var(--text-dim);
  font-family: var(--font-family-mono);
  font-size: 11.5px;
}

.prod-timeline small {
  color: var(--text-dim);
  font-size: 12px;
}

@keyframes prod-pulse {
  50% {
    opacity: 0.35;
  }
}
</style>
