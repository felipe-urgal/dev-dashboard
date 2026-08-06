<script setup lang="ts">
import '@xterm/xterm/css/xterm.css';

import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

import type { Project, ProjectTerminalKind } from '@dev-dashboard/contracts';

import {
  fetchProjectTerminalStatus,
  prepareProjectTerminalConfirmation,
  projectTerminalWebSocketUrl,
} from '../api';
import Card from './Card.vue';

const props = defineProps<{
  project: Project;
  kind: ProjectTerminalKind;
  title: string;
  description: string;
}>();

type SessionState = 'idle' | 'connecting' | 'connected' | 'closed';

const loadingStatus = ref(true);
const supported = ref(false);
const statusMessage = ref('');
const sessionState = ref<SessionState>('idle');
const errorMessage = ref('');

const terminalContainer = ref<HTMLDivElement | null>(null);
let terminal: Terminal | undefined;
let fitAddon: FitAddon | undefined;
let socket: WebSocket | undefined;
let resizeObserver: ResizeObserver | undefined;

async function loadStatus(): Promise<void> {
  loadingStatus.value = true;
  try {
    const status = await fetchProjectTerminalStatus(
      props.project.id,
      props.kind,
    );
    supported.value = status.supported;
    statusMessage.value = status.message;
  } catch (error) {
    supported.value = false;
    statusMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível consultar a disponibilidade desta sessão.';
  } finally {
    loadingStatus.value = false;
  }
}

function sendResize(): void {
  if (!terminal || !socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(
    JSON.stringify({
      type: 'resize',
      cols: terminal.cols,
      rows: terminal.rows,
    }),
  );
}

function mountTerminal(): void {
  if (!terminalContainer.value) return;
  terminal = new Terminal({
    convertEol: true,
    fontSize: 13,
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
    theme: { background: '#111827', foreground: '#dbeafe' },
  });
  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(terminalContainer.value);
  fitAddon.fit();

  terminal.onData((data) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'input', data }));
    }
  });

  resizeObserver = new ResizeObserver(() => {
    fitAddon?.fit();
    sendResize();
  });
  resizeObserver.observe(terminalContainer.value);
}

function disposeTerminal(): void {
  resizeObserver?.disconnect();
  resizeObserver = undefined;
  terminal?.dispose();
  terminal = undefined;
  fitAddon = undefined;
}

function disconnect(): void {
  socket?.close(1000, 'Sessão encerrada pelo usuário');
  socket = undefined;
}

async function startSession(): Promise<void> {
  errorMessage.value = '';
  sessionState.value = 'connecting';
  try {
    const confirmation = await prepareProjectTerminalConfirmation(
      props.project.id,
      props.kind,
    );
    const url = projectTerminalWebSocketUrl(
      props.project.id,
      props.kind,
      confirmation.token,
    );
    const newSocket = new WebSocket(url);
    socket = newSocket;

    newSocket.addEventListener('open', () => {
      if (socket !== newSocket) return;
      sessionState.value = 'connected';
      requestAnimationFrame(() => {
        mountTerminal();
        sendResize();
      });
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
        terminal?.write(message.data);
      } else if (message.type === 'exit') {
        terminal?.write(
          `\r\n\x1b[90m[processo encerrado, código ${message.code ?? '—'}]\x1b[0m\r\n`,
        );
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
      void loadStatus();
    });

    newSocket.addEventListener('error', () => {
      if (socket !== newSocket) return;
      errorMessage.value = 'A conexão com a sessão de terminal falhou.';
    });
  } catch (error) {
    sessionState.value = 'idle';
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível iniciar a sessão.';
  }
}

function restartSession(): void {
  disconnect();
  disposeTerminal();
  sessionState.value = 'idle';
  errorMessage.value = '';
  void loadStatus();
}

watch(
  () => `${props.project.id}:${props.kind}`,
  () => {
    disconnect();
    disposeTerminal();
    sessionState.value = 'idle';
    errorMessage.value = '';
    void loadStatus();
  },
);

onMounted(() => void loadStatus());

onBeforeUnmount(() => {
  disconnect();
  disposeTerminal();
});
</script>

<template>
  <div class="terminal-panel">
    <Card class="terminal-card">
      <template #header>
        <h3>{{ title }}</h3>
      </template>

      <p v-if="loadingStatus" class="terminal-empty">
        Verificando disponibilidade…
      </p>

      <div v-else-if="!supported" class="terminal-empty-state">
        <strong>Indisponível para este projeto.</strong>
        <p>{{ statusMessage }}</p>
      </div>

      <template v-else>
        <div
          v-if="sessionState === 'idle' || sessionState === 'closed'"
          class="terminal-start"
        >
          <p class="terminal-description">{{ description }}</p>
          <p class="terminal-warning">
            Esta sessão executa comandos com as mesmas permissões do seu
            usuário, sem restrição de catálogo. Use apenas em projetos e
            comandos em que você confia.
          </p>
          <button type="button" class="primary-button" @click="startSession">
            {{
              sessionState === 'closed' ? 'Abrir nova sessão' : 'Iniciar sessão'
            }}
          </button>
          <p v-if="errorMessage" class="terminal-error" role="alert">
            {{ errorMessage }}
          </p>
        </div>

        <div v-else class="terminal-session">
          <div class="terminal-session-toolbar">
            <span class="terminal-session-status">
              {{
                sessionState === 'connecting' ? 'Conectando…' : 'Sessão ativa'
              }}
            </span>
            <button
              type="button"
              class="rails-text-button"
              @click="restartSession"
            >
              Encerrar sessão
            </button>
          </div>
          <div ref="terminalContainer" class="terminal-surface"></div>
          <p v-if="errorMessage" class="terminal-error" role="alert">
            {{ errorMessage }}
          </p>
        </div>
      </template>
    </Card>
  </div>
</template>

<style scoped>
.terminal-panel {
  display: grid;
  gap: var(--space-4);
}

.terminal-empty,
.terminal-empty-state {
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.terminal-empty-state {
  border: 1px dashed var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-5);
}

.terminal-empty-state strong {
  color: var(--text);
}

.terminal-empty-state p {
  margin: var(--space-2) 0 0;
}

.terminal-start {
  display: grid;
  gap: var(--space-3);
  align-items: start;
}

.terminal-description {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.terminal-warning {
  margin: 0;
  color: var(--warning-text);
  background: var(--warning-surface, transparent);
  font-size: var(--font-xs);
}

.terminal-error {
  color: var(--danger-text);
  background: var(--danger-surface);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  margin: 0;
  font-size: var(--font-sm);
}

.terminal-session {
  display: grid;
  gap: var(--space-2);
}

.terminal-session-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  font-size: var(--font-xs);
  color: var(--text-muted);
}

.terminal-surface {
  height: 480px;
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: #111827;
  overflow: hidden;
}

.rails-text-button {
  border: none;
  background: none;
  color: var(--accent);
  cursor: pointer;
  font-size: var(--font-xs);
  padding: 0;
}

.rails-text-button:hover {
  text-decoration: underline;
}
</style>
