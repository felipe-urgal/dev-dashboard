<script setup lang="ts">
import '@xterm/xterm/css/xterm.css';

import { Terminal } from '@xterm/xterm';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    content: string;
    running?: boolean;
    maskedCount?: number;
  }>(),
  { running: false, maskedCount: 0 },
);

const terminalContainer = ref<HTMLDivElement | null>(null);
let terminal: Terminal | undefined;

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
  terminal.open(terminalContainer.value);
  renderContent();
}

watch(() => props.content, renderContent);

onMounted(() => {
  void mountTerminal();
});

onBeforeUnmount(() => {
  terminal?.dispose();
  terminal = undefined;
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
    </header>
    <div ref="terminalContainer" class="project-log-terminal-body"></div>
  </section>
</template>

<style scoped>
.project-log-terminal {
  display: flex;
  flex-direction: column;
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
  min-height: 280px;
  flex: 1 1 auto;
  padding: 12px;
  overflow: hidden;
}
</style>
