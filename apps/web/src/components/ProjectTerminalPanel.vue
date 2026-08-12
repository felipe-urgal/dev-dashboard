<script setup lang="ts">
import '@xterm/xterm/css/xterm.css';

import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import type { Project, ProjectTerminalKind } from '@dev-dashboard/contracts';

import {
  fetchProjectTerminalStatus,
  prepareProjectTerminalConfirmation,
  projectTerminalWebSocketUrl,
} from '../api';
import Card from './Card.vue';

const props = withDefaults(
  defineProps<{
    project: Project;
    kind: ProjectTerminalKind;
    title: string;
    description: string;
    autoStart?: boolean;
  }>(),
  { autoStart: false },
);

type SessionState = 'idle' | 'connecting' | 'connected' | 'closed';

const loadingStatus = ref(true);
const supported = ref(false);
const statusMessage = ref('');
const sessionState = ref<SessionState>('idle');
const errorMessage = ref('');
const maximized = ref(false);
const hasAutoStarted = ref(false);

const terminalContainer = ref<HTMLDivElement | null>(null);
let terminal: Terminal | undefined;
let fitAddon: FitAddon | undefined;
let socket: WebSocket | undefined;
let resizeObserver: ResizeObserver | undefined;

const windowStatusLabel = computed(() =>
  sessionState.value === 'connecting' ? 'Conectando…' : 'Sessão ativa',
);

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

  if (
    props.autoStart &&
    supported.value &&
    !hasAutoStarted.value &&
    sessionState.value === 'idle'
  ) {
    hasAutoStarted.value = true;
    void startSession();
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
    theme: { background: '#10131c', foreground: '#dbe0f2' },
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
      maximized.value = false;
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

function toggleMaximized(): void {
  maximized.value = !maximized.value;
  requestAnimationFrame(() => {
    fitAddon?.fit();
    sendResize();
  });
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && maximized.value) maximized.value = false;
}

watch(
  () => `${props.project.id}:${props.kind}`,
  () => {
    disconnect();
    disposeTerminal();
    sessionState.value = 'idle';
    maximized.value = false;
    errorMessage.value = '';
    hasAutoStarted.value = false;
    void loadStatus();
  },
);

onMounted(() => {
  void loadStatus();
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  disconnect();
  disposeTerminal();
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="terminal-panel">
    <Card v-if="loadingStatus || !supported" class="terminal-card">
      <template #header>
        <h3>{{ title }}</h3>
      </template>
      <p v-if="loadingStatus" class="terminal-empty">
        Verificando disponibilidade…
      </p>
      <div v-else class="terminal-empty-state">
        <strong>Indisponível para este projeto.</strong>
        <p>{{ statusMessage }}</p>
      </div>
    </Card>

    <Card
      v-else-if="sessionState === 'idle' || sessionState === 'closed'"
      class="terminal-card"
    >
      <template #header>
        <h3>{{ title }}</h3>
      </template>
      <div class="terminal-start">
        <p class="terminal-description">{{ description }}</p>
        <p class="terminal-warning">
          Esta sessão executa comandos com as mesmas permissões do seu usuário,
          sem restrição de catálogo. Use apenas em projetos e comandos em que
          você confia.
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
    </Card>

    <template v-else>
      <div
        v-if="maximized"
        class="terminal-backdrop"
        @click="toggleMaximized"
      ></div>

      <div
        class="terminal-window"
        :class="{ 'terminal-window-maximized': maximized }"
        role="dialog"
        :aria-label="title"
      >
        <div class="terminal-window-bar">
          <div class="terminal-window-dots" aria-hidden="true">
            <span></span><span></span><span></span>
          </div>
          <div class="terminal-window-title">
            <span
              class="terminal-status-dot"
              :class="{
                'terminal-status-dot-connecting': sessionState === 'connecting',
              }"
            ></span>
            <strong>{{ project.name }}</strong>
            <span>— {{ title }} · {{ windowStatusLabel }}</span>
          </div>
          <div class="terminal-window-actions">
            <button
              type="button"
              class="terminal-icon-button"
              :title="maximized ? 'Restaurar' : 'Expandir'"
              :aria-label="maximized ? 'Restaurar' : 'Expandir'"
              @click="toggleMaximized"
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
        <div ref="terminalContainer" class="terminal-window-body"></div>
        <p
          v-if="errorMessage"
          class="terminal-error terminal-window-error"
          role="alert"
        >
          {{ errorMessage }}
        </p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.terminal-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: 100%;
  height: calc(100vh - 116px);
  min-height: 0;
  min-width: 0;
  max-width: 100%;
  max-height: calc(100vh - 116px);
  overflow-x: hidden;
}

.terminal-empty,
.terminal-empty-state {
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.terminal-empty-state {
  border: 1px dashed var(--border);
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

/* Janela flutuante: sem card nem fundo ao redor, redimensionável pelo mouse
   (arrastando o canto inferior direito) e com um botão para expandir em
   tela cheia — ver tasks/118-project-terminal-console.md para o histórico
   dos protótipos avaliados. */

.terminal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(10, 12, 20, 0.55);
  backdrop-filter: blur(2px);
  z-index: 40;
}

.terminal-window {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: auto;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  max-width: min(100%, calc(100vw - var(--app-sidebar-width, 232px)));
  max-height: 100%;
  max-height: none;
  background: #10131c;
  border: 1px solid #262c40;
  box-shadow: var(--shadow-1);
  overflow: hidden;
  resize: both;
  position: relative;
}

.terminal-window::after {
  content: '';
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 10px;
  height: 10px;
  pointer-events: none;
  background-image: radial-gradient(circle, #7d84a3 1px, transparent 1.2px);
  background-size: 3.5px 3.5px;
  background-position: bottom right;
  background-repeat: repeat;
  opacity: 0.7;
}

.terminal-window-maximized {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: var(--app-sidebar-width, 232px);
  width: auto;
  height: auto;
  max-width: none;
  max-height: none;
  border-radius: 0;
  resize: none;
  z-index: 50;
  box-shadow: var(--shadow-2);
}

.terminal-window-maximized::after {
  display: none;
}

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
  font-size: var(--font-xs);
  color: #7d84a3;
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

.terminal-icon-button:hover {
  color: #fff;
  background: rgba(124, 139, 255, 0.22);
}

.terminal-icon-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.terminal-window-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: var(--space-3) var(--space-4);
  overflow: hidden;
}

.terminal-window-body :deep(.xterm) {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.terminal-window-body :deep(.xterm-viewport) {
  max-width: 100%;
  overflow-x: hidden !important;
  overflow-y: auto;
}

.terminal-window-error {
  margin: 0 var(--space-3) var(--space-3);
}
</style>
