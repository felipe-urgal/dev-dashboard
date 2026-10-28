<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'secondary' | 'primary' | 'danger' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    /** Botão quadrado, só com ícone (exige aria-label). */
    icon?: boolean;
    busy?: boolean;
  }>(),
  { variant: 'secondary', size: 'md', icon: false, busy: false },
);
</script>

<template>
  <button
    type="button"
    class="ui-button"
    :data-variant="variant"
    :data-size="size"
    :data-icon="icon"
    :aria-busy="busy || undefined"
  >
    <span v-if="busy" class="ui-button-spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.ui-button {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 14px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text);
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.ui-button[data-size='sm'] {
  height: 30px;
  padding: 0 10px;
}

.ui-button[data-size='md'] {
  height: 34px;
}

.ui-button[data-size='lg'] {
  height: 40px;
  padding: 0 16px;
  border-radius: 10px;
  font-size: 14px;
}

.ui-button[data-icon='true'] {
  width: var(--ui-button-size, 34px);
  padding: 0;
}

.ui-button[data-icon='true'][data-size='sm'] {
  --ui-button-size: 30px;
}

.ui-button[data-icon='true'][data-size='lg'] {
  --ui-button-size: 40px;
}

.ui-button:hover:not(:disabled) {
  background: var(--surface-2);
}

.ui-button[data-variant='primary'] {
  border-color: var(--accent-strong);
  color: #fff;
  background: var(--accent-strong);
}

.ui-button[data-variant='primary']:hover:not(:disabled) {
  background: var(--accent);
}

.ui-button[data-variant='danger'] {
  border-color: color-mix(in srgb, var(--danger-text) 45%, transparent);
  color: var(--danger-text);
}

.ui-button[data-variant='danger']:hover:not(:disabled) {
  background: color-mix(in srgb, var(--danger-text) 10%, transparent);
}

.ui-button[data-variant='ghost'] {
  border-color: transparent;
  color: var(--text-muted);
}

.ui-button[data-variant='ghost']:hover:not(:disabled) {
  color: var(--text);
  background: var(--surface-3);
}

.ui-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.ui-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.ui-button :slotted(svg) {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.ui-button[data-icon='true'] :slotted(svg) {
  width: 18px;
  height: 18px;
}

.ui-button-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: ui-button-spin 700ms linear infinite;
}

@keyframes ui-button-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ui-button-spinner {
    animation: none;
  }
}
</style>
