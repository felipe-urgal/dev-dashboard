<script setup lang="ts">
import '@xterm/xterm/css/xterm.css';

import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { onBeforeUnmount, ref, watch } from 'vue';

import {
  dashboardTerminalWebSocketUrl,
  prepareDashboardTerminalConfirmation,
} from '../api';
import {
  copyTextToClipboard,
  isTerminalCopyShortcut,
} from '../utils/terminal-clipboard';
import { MAX_TERMINAL_SCROLLBACK_LINES } from '../utils/terminal-limits';

const props = defineProps<{ active: boolean }>();

type SessionState = 'idle' | 'connecting' | 'connected' | 'closed';

const terminalContainer = ref<HTMLDivElement | null>(null);
const sessionState = ref<SessionState>('idle');
const errorMessage = ref('');

let terminal: Terminal | undefined;
let fitAddon: FitAddon | undefined;
let socket: WebSocket | undefined;
let resizeObserver: ResizeObserver | undefined;
let pendingOutput = '';

const macOS =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

function sendResize(): void {
  if (
    !props.active ||
    !terminal ||
    !socket ||
    socket.readyState !== WebSocket.OPEN
  ) {
    return;
  }

  socket.send(
    JSON.stringify({
      type: 'resize',
      cols: terminal.cols,
      rows: terminal.rows,
    }),
  );
}

function mountTerminal(): void {
  if (!terminalContainer.value || terminal) return;

  terminal = new Terminal({
    convertEol: true,
    scrollback: MAX_TERMINAL_SCROLLBACK_LINES,
    fontSize: 13,
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
    theme: { background: '#0d1117', foreground: '#dbe0f2' },
  });
  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(terminalContainer.value);

  terminal.attachCustomKeyEventHandler((event) => {
    if (
      event.type !== 'keydown' ||
      !terminal ||
      !isTerminalCopyShortcut(event, terminal.hasSelection(), macOS)
    ) {
      return true;
    }

    const selection = terminal.getSelection();
    if (selection) void copyTextToClipboard(selection);
    return false;
  });

  terminal.onData((data) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'input', data }));
    }
  });

  resizeObserver = new ResizeObserver(() => {
    if (!props.active) return;
    fitAddon?.fit();
    sendResize();
  });
  resizeObserver.observe(terminalContainer.value);

  fitAddon.fit();
  if (pendingOutput) {
    terminal.write(pendingOutput);
    pendingOutput = '';
  }
  sendResize();
  terminal.focus();
}

function disposeTerminal(): void {
  resizeObserver?.disconnect();
  resizeObserver = undefined;
  terminal?.dispose();
  terminal = undefined;
  fitAddon = undefined;
  pendingOutput = '';
}

function disconnect(): void {
  socket?.close(1000, 'Sessão encerrada pelo usuário');
  socket = undefined;
}

async function startSession(): Promise<void> {
  if (
    sessionState.value === 'connecting' ||
    sessionState.value === 'connected'
  ) {
    return;
  }

  errorMessage.value = '';
  sessionState.value = 'connecting';

  try {
    const confirmation = await prepareDashboardTerminalConfirmation();
    const newSocket = new WebSocket(
      dashboardTerminalWebSocketUrl(confirmation.token),
    );
    socket = newSocket;

    newSocket.addEventListener('open', () => {
      if (socket !== newSocket) return;
      sessionState.value = 'connected';
      requestAnimationFrame(mountTerminal);
    });

    newSocket.addEventListener('message', (event) => {
      if (socket !== newSocket || typeof event.data !== 'string') return;

      let message: {
        type?: string;
        data?: string;
        code?: number | null;
        message?: string;
      };
      try {
        message = JSON.parse(event.data) as typeof message;
      } catch {
        return;
      }

      if (message.type === 'output' && typeof message.data === 'string') {
        if (terminal) terminal.write(message.data);
        else pendingOutput += message.data;
      } else if (message.type === 'exit') {
        const output = `\r\n\x1b[90m[dev-tools encerrado, código ${message.code ?? '—'}]\x1b[0m\r\n`;
        if (terminal) terminal.write(output);
        else pendingOutput += output;
      } else if (
        message.type === 'error' &&
        typeof message.message === 'string'
      ) {
        errorMessage.value = message.message;
      }
    });

    newSocket.addEventListener('close', () => {
      if (socket !== newSocket) return;
      socket = undefined;
      sessionState.value = 'closed';
      disposeTerminal();
    });

    newSocket.addEventListener('error', () => {
      if (socket !== newSocket) return;
      errorMessage.value = 'A conexão com o modo terminal falhou.';
    });
  } catch (error) {
    sessionState.value = 'idle';
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível iniciar o modo terminal.';
  }
}

watch(
  () => props.active,
  (active) => {
    if (!active) return;

    if (sessionState.value === 'idle' || sessionState.value === 'closed') {
      void startSession();
      return;
    }

    if (sessionState.value === 'connected') {
      requestAnimationFrame(() => {
        fitAddon?.fit();
        sendResize();
        terminal?.focus();
      });
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  disconnect();
  disposeTerminal();
});
</script>

<template>
  <section class="dashboard-terminal-mode" aria-label="Modo terminal">
    <div
      v-if="sessionState === 'connecting'"
      class="dashboard-terminal-state"
      role="status"
      aria-live="polite"
    >
      <span class="dashboard-terminal-state-dot" aria-hidden="true"></span>
      <strong>Iniciando Dev Dashboard no terminal…</strong>
    </div>

    <div
      v-else-if="sessionState === 'idle' || sessionState === 'closed'"
      class="dashboard-terminal-state"
    >
      <strong>Modo terminal</strong>
      <p>
        Executa a interface original <code>dev-tools</code> dentro do Dev
        Dashboard.
      </p>
      <button type="button" class="primary-button" @click="startSession">
        {{ sessionState === 'closed' ? 'Reabrir terminal' : 'Abrir terminal' }}
      </button>
      <p v-if="errorMessage" class="dashboard-terminal-error" role="alert">
        {{ errorMessage }}
      </p>
    </div>

    <div v-else class="dashboard-terminal-session">
      <div ref="terminalContainer" class="dashboard-terminal-canvas"></div>
      <p v-if="errorMessage" class="dashboard-terminal-error" role="alert">
        {{ errorMessage }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.dashboard-terminal-mode {
  width: 100%;
  height: calc(100vh - var(--app-topbar-height, 72px));
  min-height: 480px;
  overflow: hidden;
  background: #0d1117;
}

.dashboard-terminal-session,
.dashboard-terminal-canvas {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.dashboard-terminal-session {
  position: relative;
}

.dashboard-terminal-canvas {
  padding: 12px 14px;
}

.dashboard-terminal-state {
  display: grid;
  height: 100%;
  place-content: center;
  justify-items: center;
  gap: 12px;
  padding: 32px;
  color: var(--text-muted);
  background: var(--surface-0);
  text-align: center;
}

.dashboard-terminal-state strong {
  color: var(--text);
}

.dashboard-terminal-state p {
  max-width: 520px;
  margin: 0;
}

.dashboard-terminal-state-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--accent);
}

.dashboard-terminal-error {
  position: absolute;
  right: 12px;
  bottom: 12px;
  left: 12px;
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--danger-border);
  border-radius: 8px;
  color: var(--danger-text);
  background: var(--danger-bg);
  font-size: 12px;
}
</style>
