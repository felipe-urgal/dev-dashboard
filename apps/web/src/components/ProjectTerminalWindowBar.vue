<script setup lang="ts">
defineProps<{
  projectName: string;
  title: string;
  statusLabel: string;
  connecting: boolean;
  maximized: boolean;
  fontSize: number;
}>();

const emit = defineEmits<{
  'toggle-maximized': [];
  'set-font-size': [size: number];
}>();
</script>

<template>
  <div class="terminal-window-bar">
    <div class="terminal-window-dots" aria-hidden="true">
      <span></span><span></span><span></span>
    </div>
    <div class="terminal-window-title">
      <span
        class="terminal-status-dot"
        :class="{ 'terminal-status-dot-connecting': connecting }"
      ></span>
      <strong>{{ projectName }}</strong>
      <span>— {{ title }} · {{ statusLabel }}</span>
    </div>
    <div class="terminal-window-actions">
      <button
        type="button"
        class="terminal-icon-button terminal-font-size-button"
        title="Diminuir fonte"
        aria-label="Diminuir fonte"
        @click="emit('set-font-size', fontSize - 1)"
      >
        A−
      </button>
      <button
        type="button"
        class="terminal-icon-button terminal-font-size-value"
        title="Restaurar fonte"
        aria-label="Restaurar fonte"
        @click="emit('set-font-size', 13)"
      >
        {{ fontSize }}px
      </button>
      <button
        type="button"
        class="terminal-icon-button terminal-font-size-button"
        title="Aumentar fonte"
        aria-label="Aumentar fonte"
        @click="emit('set-font-size', fontSize + 1)"
      >
        A+
      </button>
      <button
        type="button"
        class="terminal-icon-button"
        :title="maximized ? 'Restaurar' : 'Expandir'"
        :aria-label="maximized ? 'Restaurar' : 'Expandir'"
        @click="emit('toggle-maximized')"
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M7.5 3.5H3.5v4M12.5 16.5h4v-4M3.5 12.5v4h4M16.5 7.5v-4h-4"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.terminal-window-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: #171b28;
  border-bottom: 1px solid #262c40;
  flex-shrink: 0;
}
.terminal-window-dots {
  display: flex;
  gap: 6px;
}
.terminal-window-dots span {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #262c40;
}
.terminal-window-title {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: #7d84a3;
  font-size: var(--font-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.terminal-window-title strong {
  color: #dbe0f2;
  font-weight: 600;
}
.terminal-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--success-text);
  flex-shrink: 0;
}
.terminal-status-dot-connecting {
  background: var(--warning-text);
}
.terminal-window-actions {
  display: flex;
  gap: var(--space-1);
}
.terminal-icon-button {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  color: #7d84a3;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.terminal-icon-button svg {
  width: 15px;
  height: 15px;
}
.terminal-font-size-button {
  width: auto;
  min-width: 28px;
  padding: 0 6px;
  font-size: 11px;
  font-weight: 700;
}
.terminal-font-size-value {
  width: auto;
  min-width: 42px;
  padding: 0 5px;
  color: #dbe0f2;
  font-size: 10px;
}
.terminal-icon-button:hover {
  color: #fff;
  background: rgb(124 139 255 / 22%);
}
.terminal-icon-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
