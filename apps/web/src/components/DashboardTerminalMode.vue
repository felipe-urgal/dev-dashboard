<script setup lang="ts">
import '@xterm/xterm/css/xterm.css';

import { FitAddon } from '@xterm/addon-fit';
import { Terminal, type ITheme } from '@xterm/xterm';
import { onBeforeUnmount, ref, watch } from 'vue';

import {
  dashboardTerminalWebSocketUrl,
  prepareDashboardTerminalConfirmation,
  type DashboardTerminalReconnectCredentials,
} from '../api';
import {
  copyTextToClipboard,
  isTerminalCopyShortcut,
} from '../utils/terminal-clipboard';
import { MAX_TERMINAL_SCROLLBACK_LINES } from '../utils/terminal-limits';
import { currentTheme } from '../utils/visual-preferences';

const props = defineProps<{ active: boolean }>();

type SessionState =
  'idle' | 'connecting' | 'connected' | 'disconnected' | 'exited' | 'closed';

const SESSION_STORAGE_KEY = 'dev-dashboard-terminal-session';
const MAX_PENDING_OUTPUT_BYTES = 262_144;
const RECONNECT_DELAY_MS = 500;

const terminalContainer = ref<HTMLDivElement | null>(null);
const sessionState = ref<SessionState>('idle');
const errorMessage = ref('');

let terminal: Terminal | undefined;
let fitAddon: FitAddon | undefined;
let socket: WebSocket | undefined;
let resizeObserver: ResizeObserver | undefined;
let resizeFrame: number | undefined;
let reconnectTimer: number | undefined;
let pendingOutput = '';
let intentionalClose = false;

const macOS =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

function terminalTheme(): ITheme {
  if (currentTheme.value === 'light') {
    return {
      background: '#ffffff',
      foreground: '#1f2937',
      cursor: '#111827',
      selectionBackground: '#bfdbfe',
    };
  }
  return {
    background: '#0d1117',
    foreground: '#dbe0f2',
    cursor: '#f8fafc',
    selectionBackground: '#334155',
  };
}

function boundedPendingOutput(value: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  if (bytes.byteLength <= MAX_PENDING_OUTPUT_BYTES) return value;
  const tail = bytes.slice(bytes.byteLength - MAX_PENDING_OUTPUT_BYTES);
  return new TextDecoder().decode(tail);
}

function readReconnectCredentials(): DashboardTerminalReconnectCredentials | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(
      raw,
    ) as Partial<DashboardTerminalReconnectCredentials>;
    if (
      typeof parsed.sessionId !== 'string' ||
      typeof parsed.reconnectToken !== 'string'
    ) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return {
      sessionId: parsed.sessionId,
      reconnectToken: parsed.reconnectToken,
    };
  } catch {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

function storeReconnectCredentials(
  credentials: DashboardTerminalReconnectCredentials,
): void {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(credentials));
}

function clearReconnectCredentials(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

function queueResize(): void {
  if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = undefined;
    if (!props.active || !terminal || !fitAddon) return;
    fitAddon.fit();
    sendResize();
  });
}

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
    theme: terminalTheme(),
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
    if (props.active) queueResize();
  });
  resizeObserver.observe(terminalContainer.value);

  queueResize();
  if (pendingOutput) {
    terminal.write(pendingOutput);
    pendingOutput = '';
  }
  terminal.focus();
}

function disposeTerminal(): void {
  resizeObserver?.disconnect();
  resizeObserver = undefined;
  if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
  resizeFrame = undefined;
  terminal?.dispose();
  terminal = undefined;
  fitAddon = undefined;
  pendingOutput = '';
}

function appendOutput(value: string): void {
  if (terminal) {
    terminal.write(value);
  } else {
    pendingOutput = boundedPendingOutput(pendingOutput + value);
  }
}

function clearReconnectTimer(): void {
  if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
  reconnectTimer = undefined;
}

function scheduleReconnect(): void {
  clearReconnectTimer();
  if (!props.active || intentionalClose) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = undefined;
    void startSession(true);
  }, RECONNECT_DELAY_MS);
}

function disconnect(): void {
  intentionalClose = true;
  clearReconnectTimer();
  clearReconnectCredentials();
  socket?.close(1000, 'Sessão encerrada pelo usuário');
  socket = undefined;
}

async function startSession(preferReconnect = true): Promise<void> {
  if (
    sessionState.value === 'connecting' ||
    sessionState.value === 'connected'
  ) {
    return;
  }

  errorMessage.value = '';
  sessionState.value = 'connecting';
  intentionalClose = false;

  try {
    const reconnect = preferReconnect ? readReconnectCredentials() : null;
    let connectionReady = false;
    const url = reconnect
      ? dashboardTerminalWebSocketUrl(reconnect)
      : dashboardTerminalWebSocketUrl({
          confirmationToken: (await prepareDashboardTerminalConfirmation())
            .token,
        });

    const newSocket = new WebSocket(url);
    socket = newSocket;

    newSocket.addEventListener('open', () => {
      if (socket !== newSocket) return;
      sessionState.value = 'connecting';
    });

    newSocket.addEventListener('message', (event) => {
      if (socket !== newSocket || typeof event.data !== 'string') return;

      let message: {
        type?: string;
        data?: string;
        code?: number | null;
        message?: string;
        sessionId?: string;
        reconnectToken?: string;
        reconnected?: boolean;
      };
      try {
        message = JSON.parse(event.data) as typeof message;
      } catch {
        errorMessage.value = 'O terminal recebeu uma resposta inválida.';
        return;
      }

      if (
        message.type === 'ready' &&
        typeof message.sessionId === 'string' &&
        typeof message.reconnectToken === 'string'
      ) {
        storeReconnectCredentials({
          sessionId: message.sessionId,
          reconnectToken: message.reconnectToken,
        });
        connectionReady = true;
        sessionState.value = 'connected';
        errorMessage.value = '';
        requestAnimationFrame(() => {
          mountTerminal();
          queueResize();
          if (props.active) terminal?.focus();
        });
      } else if (
        message.type === 'output' &&
        typeof message.data === 'string'
      ) {
        appendOutput(message.data);
      } else if (message.type === 'exit') {
        appendOutput(
          `\r\n\x1b[90m[dev-tools encerrado, código ${message.code ?? '—'}]\x1b[0m\r\n`,
        );
        clearReconnectCredentials();
        sessionState.value = 'exited';
      } else if (
        message.type === 'error' &&
        typeof message.message === 'string'
      ) {
        errorMessage.value = message.message;
      }
    });

    newSocket.addEventListener('close', (event) => {
      if (socket !== newSocket) return;
      socket = undefined;

      if (intentionalClose) {
        sessionState.value = 'closed';
        return;
      }

      if (sessionState.value === 'exited' || event.code === 1000) {
        clearReconnectCredentials();
        sessionState.value = 'exited';
        return;
      }

      if (event.code === 1008 || event.code === 1013) {
        clearReconnectCredentials();
        sessionState.value = 'closed';
        errorMessage.value =
          errorMessage.value ||
          (event.code === 1013
            ? 'O limite de sessões do Terminal foi atingido. Feche outra sessão e tente novamente.'
            : 'A sessão anterior não está mais disponível. Abra uma nova sessão.');
        return;
      }

      if (!connectionReady && !reconnect) {
        sessionState.value = 'closed';
        errorMessage.value =
          errorMessage.value || 'Não foi possível abrir a sessão do Terminal.';
        return;
      }

      sessionState.value = 'disconnected';
      errorMessage.value =
        'Conexão interrompida. Tentando recuperar a sessão do terminal…';
      scheduleReconnect();
    });

    newSocket.addEventListener('error', () => {
      if (socket !== newSocket) return;
      errorMessage.value = 'A conexão com o modo terminal falhou.';
    });
  } catch (error) {
    sessionState.value = 'closed';
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

    if (
      sessionState.value === 'idle' ||
      sessionState.value === 'closed' ||
      sessionState.value === 'disconnected'
    ) {
      void startSession(true);
      return;
    }

    if (sessionState.value === 'connected') {
      requestAnimationFrame(() => {
        queueResize();
        terminal?.focus();
      });
    }
  },
  { immediate: true },
);

watch(currentTheme, () => {
  if (terminal) terminal.options.theme = terminalTheme();
});

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
      <strong>Conectando ao terminal…</strong>
      <p>
        Uma sessão anterior será recuperada quando ainda estiver disponível.
      </p>
    </div>

    <div
      v-else-if="sessionState === 'idle' || sessionState === 'closed'"
      class="dashboard-terminal-state"
    >
      <strong>Modo terminal</strong>
      <p>
        Executa a interface <code>dev-tools</code> usando uma sessão isolada do
        Dev Dashboard.
      </p>
      <button type="button" class="primary-button" @click="startSession(false)">
        {{ sessionState === 'closed' ? 'Abrir nova sessão' : 'Abrir terminal' }}
      </button>
      <p
        v-if="errorMessage"
        class="dashboard-terminal-inline-error"
        role="alert"
      >
        {{ errorMessage }}
      </p>
    </div>

    <div v-else class="dashboard-terminal-session">
      <div ref="terminalContainer" class="dashboard-terminal-canvas"></div>

      <div
        v-if="sessionState === 'disconnected'"
        class="dashboard-terminal-overlay"
        role="status"
        aria-live="polite"
      >
        <strong>Terminal desconectado</strong>
        <span>Tentando reconectar sem encerrar o processo…</span>
        <button
          type="button"
          class="primary-button"
          @click="startSession(true)"
        >
          Reconectar agora
        </button>
      </div>

      <div
        v-else-if="sessionState === 'exited'"
        class="dashboard-terminal-overlay"
        role="status"
      >
        <strong>Sessão encerrada</strong>
        <button
          type="button"
          class="primary-button"
          @click="startSession(false)"
        >
          Abrir nova sessão
        </button>
      </div>

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
  background: var(--surface-0);
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
  background: var(--surface-0);
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

.dashboard-terminal-state strong,
.dashboard-terminal-overlay strong {
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

.dashboard-terminal-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 10px;
  padding: 24px;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--surface-0) 88%, transparent);
  text-align: center;
  backdrop-filter: blur(2px);
}

.dashboard-terminal-error,
.dashboard-terminal-inline-error {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid var(--danger-border);
  border-radius: 8px;
  color: var(--danger-text);
  background: var(--danger-bg);
  font-size: 12px;
}

.dashboard-terminal-error {
  position: absolute;
  right: 12px;
  bottom: 12px;
  left: 12px;
}

.dashboard-terminal-inline-error {
  max-width: 560px;
}
</style>
