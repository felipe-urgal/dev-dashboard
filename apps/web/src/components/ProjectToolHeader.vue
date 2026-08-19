<script setup lang="ts">
defineProps<{
  eyebrow?: string;
  title: string;
  description?: string;
}>();
</script>

<template>
  <header class="project-tool-header">
    <div class="project-tool-header-copy">
      <h2>{{ title }}</h2>
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
  min-height: 58px;
  padding: 10px 22px;
  border-bottom: 1px solid var(--border);
}

.project-tool-header-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.project-tool-header h2 {
  margin: 0;
  color: var(--text);
  font-size: clamp(20px, 2.1vw, 27px);
  font-weight: 750;
  letter-spacing: -0.035em;
  line-height: 1.15;
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
