<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'neutral' | 'accent' | 'warning' | 'success' | 'danger';
    mono?: boolean;
  }>(),
  { tone: 'neutral', mono: false },
);
</script>

<template>
  <span class="ui-tag" :data-tone="tone" :data-mono="mono"><slot /></span>
</template>

<style scoped>
.ui-tag {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  overflow: hidden;
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-3);
  font-size: 12px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ui-tag[data-mono='true'] {
  font-family: var(--font-family-mono);
  font-weight: 500;
}

.ui-tag[data-tone='accent'] {
  color: var(--accent);
  background: var(--accent-soft);
}

.ui-tag[data-tone='warning'] {
  color: var(--warning-text);
  background: color-mix(in srgb, var(--warning-text) 14%, transparent);
}

.ui-tag[data-tone='success'] {
  color: var(--success-text);
  background: color-mix(in srgb, var(--success-text) 14%, transparent);
}

.ui-tag[data-tone='danger'] {
  color: var(--danger-text);
  background: color-mix(in srgb, var(--danger-text) 14%, transparent);
}
</style>
