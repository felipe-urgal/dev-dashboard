<script setup lang="ts">
defineProps<{
  eyebrow: string;
  title: string;
  description: string;
}>();
</script>

<template>
  <header class="project-tool-header">
    <div class="project-tool-header-copy">
      <span class="project-tool-header-eyebrow">{{ eyebrow }}</span>
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
    </div>
    <div
      v-if="$slots.actions || $slots.meta"
      class="project-tool-header-actions"
    >
      <slot name="meta" />
      <slot name="actions" />
    </div>
  </header>
</template>

<style>
.project-tool-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 82px;
  padding: 14px 22px 12px;
  border-bottom: 1px solid var(--border);
}

.project-tool-header-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.project-tool-header-eyebrow {
  color: var(--accent);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.project-tool-header h2 {
  margin: 0;
  color: var(--text);
  font-size: clamp(20px, 2.1vw, 27px);
  font-weight: 750;
  letter-spacing: -0.035em;
  line-height: 1.15;
}

.project-tool-header p {
  max-width: 72ch;
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
  line-height: 1.45;
}

.project-tool-header-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

@media (max-width: 720px) {
  .project-tool-header {
    align-items: stretch;
    flex-direction: column;
  }

  .project-tool-header-actions {
    align-items: flex-start;
    flex-wrap: wrap;
  }
}
</style>
