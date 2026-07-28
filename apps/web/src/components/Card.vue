<script setup lang="ts">
interface Props {
  tag?: keyof HTMLElementTagNameMap;
  padded?: boolean;
  interactive?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  tag: 'section',
  padded: true,
  interactive: false,
});
</script>

<template>
  <component
    :is="props.tag"
    class="dd-card"
    :class="{
      'dd-card-padded': props.padded,
      'dd-card-interactive': props.interactive,
    }"
  >
    <header v-if="$slots.header || $slots.actions" class="dd-card-header">
      <div v-if="$slots.header" class="dd-card-heading">
        <slot name="header" />
      </div>
      <div v-if="$slots.actions" class="dd-card-actions">
        <slot name="actions" />
      </div>
    </header>
    <slot />
  </component>
</template>

<style scoped>
.dd-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  color: var(--text);
}
.dd-card-padded { padding: var(--space-5); }
.dd-card-interactive { transition: border-color 160ms ease, transform 160ms ease; }
.dd-card-interactive:hover { border-color: var(--border-strong); }
.dd-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
.dd-card-header:empty { display: none; }
.dd-card-heading { min-width: 0; flex: 1; }
.dd-card-actions { display: flex; gap: var(--space-2); flex: 0 0 auto; }
</style>
