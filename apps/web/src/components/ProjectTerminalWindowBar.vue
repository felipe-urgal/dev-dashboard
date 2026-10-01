<script setup lang="ts">
defineProps<{
  title: string;
  state: 'connecting' | 'connected';
  maximized: boolean;
  fontSize: number;
}>();

const emit = defineEmits<{
  'close-session': [];
  'toggle-maximized': [];
  'set-font-size': [size: number];
}>();
</script>

<template>
  <div class="terminal-window-bar">
    <div class="terminal-window-identity">
      <span
        class="terminal-window-status-dot"
        :class="`is-${state}`"
        aria-hidden="true"
      ></span>
      <strong>{{ title }}</strong>
      <span>{{ state === 'connecting' ? 'Conectando' : 'Conectado' }}</span>
    </div>

    <div class="terminal-window-spacer" aria-hidden="true"></div>

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
      <button
        type="button"
        class="terminal-icon-button terminal-close-button"
        title="Encerrar sessão"
        aria-label="Encerrar sessão"
        @click="emit('close-session')"
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M5 5l10 10M15 5L5 15"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
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

.terminal-window-identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
}

.terminal-window-identity strong {
  overflow: hidden;
  color: #dbe0f2;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-window-identity > span:last-child {
  color: #7d84a3;
  font-size: 10px;
}

.terminal-window-status-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--warning-text);
}

.terminal-window-status-dot.is-connected {
  background: var(--success-text);
}

.terminal-window-spacer {
  flex: 1;
  min-width: 0;
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

.terminal-close-button {
  margin-left: var(--space-1);
}

.terminal-close-button:hover {
  color: var(--danger-text);
  background: var(--danger-surface);
}

.terminal-icon-button:hover {
  color: #fff;
  background: rgb(124 139 255 / 22%);
}

.terminal-close-button:hover {
  color: var(--danger-text);
  background: var(--danger-surface);
}

.terminal-icon-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
