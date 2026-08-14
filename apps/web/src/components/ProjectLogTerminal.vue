<script setup lang="ts">
import '@xterm/xterm/css/xterm.css';

import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    content: string;
    running?: boolean;
    maskedCount?: number;
    clearable?: boolean;
    clearing?: boolean;
  }>(),
  { running: false, maskedCount: 0, clearable: true, clearing: false },
);

const emit = defineEmits<{ clear: [] }>();

const terminalContainer = ref<HTMLDivElement | null>(null);
let terminal: Terminal | undefined;
let fitAddon: FitAddon | undefined;
let resizeObserver: ResizeObserver | undefined;

function renderContent(): void {
  if (!terminal) return;

  terminal.clear();
  if (props.content) {
    terminal.write(props.content.replace(/\r?\n/g, '\r\n'));
  }
  terminal.scrollToBottom();
}

async function mountTerminal(): Promise<void> {
  await nextTick();
  if (!terminalContainer.value) return;

  terminal = new Terminal({
    convertEol: true,
    disableStdin: true,
    cursorBlink: false,
    cursorStyle: 'bar',
    fontSize: 13,
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
    theme: {
      background: '#10131c',
      foreground: '#dbe0f2',
      cursor: '#7d84a3',
    },
  });
  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(terminalContainer.value);
  fitAddon.fit();

  resizeObserver = new ResizeObserver(() => {
    fitAddon?.fit();
  });
  resizeObserver.observe(terminalContainer.value);
  renderContent();
}

watch(() => props.content, renderContent);

onMounted(() => {
  void mountTerminal();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = undefined;
  terminal?.dispose();
  terminal = undefined;
  fitAddon = undefined;
});
</script>

<template>
  <section class="project-log-terminal" aria-label="Terminal do servidor">
    <header class="project-log-terminal-header">
      <div class="project-log-terminal-title">
        <span
          class="project-log-terminal-dot"
          :class="{ stopped: !running }"
        ></span>
        <strong>Terminal do servidor</strong>
        <span>{{ running ? 'Em execução' : 'Encerrado' }}</span>
      </div>
      <span v-if="maskedCount" class="project-log-terminal-masked">
        {{ maskedCount }} segredo{{ maskedCount === 1 ? '' : 's' }} ocultado{{
          maskedCount === 1 ? '' : 's'
        }}
      </span>
      <button
        type="button"
        class="project-log-terminal-clear"
        :disabled="!clearable || clearing"
        @click="emit('clear')"
      >
        {{ clearing ? 'Limpando…' : 'Limpar' }}
      </button>
    </header>
    <div ref="terminalContainer" class="project-log-terminal-body"></div>
  </section>
</template>

<style scoped>
.project-log-terminal {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
  background: #10131c;
  border: 1px solid #262c40;
  color: #dbe0f2;
}

.project-log-terminal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 38px;
  padding: 0 var(--space-3);
  background: #171b28;
  border-bottom: 1px solid #262c40;
  font-size: var(--font-xs);
}

.project-log-terminal-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

.project-log-terminal-title span:last-child,
.project-log-terminal-masked {
  color: #7d84a3;
}

.project-log-terminal-clear {
  border: 1px solid #3b4560;
  border-radius: var(--radius-sm);
  padding: 4px 9px;
  color: #b9c2df;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.project-log-terminal-clear:hover:not(:disabled) {
  border-color: #7d84a3;
  color: #ffffff;
}

.project-log-terminal-clear:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.project-log-terminal-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #51d88a;
  flex: 0 0 auto;
}

.project-log-terminal-dot.stopped {
  background: #7d84a3;
}

.project-log-terminal-body {
  width: 100%;
  height: 100%;
  min-height: 0;
  flex: 1 1 auto;
  padding: 12px;
  overflow: hidden;
}

.project-log-terminal-body :deep(.xterm) {
  width: 100%;
  height: 100%;
}
</style>
