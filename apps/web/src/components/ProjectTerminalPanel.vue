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
import ProjectTerminalWindowBar from './ProjectTerminalWindowBar.vue';

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
const terminalFontSize = ref(13);
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
    fontSize: terminalFontSize.value,
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

function setTerminalFontSize(size: number): void {
  terminalFontSize.value = Math.min(20, Math.max(11, size));
  if (!terminal) return;
  terminal.options.fontSize = terminalFontSize.value;
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
        <div class="terminal-card-header">
          <div>
            <span class="terminal-card-kicker">Projeto / Sessão</span>
            <h3>{{ title }}</h3>
            <p>{{ description }}</p>
          </div>
          <span class="terminal-card-status">
            {{ loadingStatus ? 'Verificando' : 'Indisponível' }}
          </span>
        </div>
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
        <div class="terminal-card-header">
          <div>
            <span class="terminal-card-kicker">Projeto / Sessão</span>
            <h3>{{ title }}</h3>
            <p>{{ description }}</p>
          </div>
          <span class="terminal-card-status is-ready">Pronto</span>
        </div>
      </template>
      <div class="terminal-start">
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
        <ProjectTerminalWindowBar
          :project-name="project.name"
          :title="title"
          :status-label="windowStatusLabel"
          :connecting="sessionState === 'connecting'"
          :maximized="maximized"
          :font-size="terminalFontSize"
          @toggle-maximized="toggleMaximized"
          @set-font-size="setTerminalFontSize"
        />
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
  height: 100%;
  min-height: 0;
  min-width: 0;
  max-width: 100%;
  max-height: 100%;
  overflow: hidden;
}

.terminal-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}

.terminal-card-header > div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.terminal-card-kicker {
  color: var(--text-dim);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.terminal-card-header h3,
.terminal-card-header p {
  margin: 0;
}

.terminal-card-header h3 {
  font-size: var(--font-lg);
  line-height: 1.25;
}

.terminal-card-header p {
  color: var(--text-muted);
  font-size: var(--font-sm);
  line-height: 1.5;
}

.terminal-card-status {
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--warning-text) 45%, var(--border));
  color: var(--warning-text);
  font-size: var(--font-xs);
  padding: 4px 8px;
  white-space: nowrap;
}

.terminal-card-status.is-ready {
  border-color: color-mix(in srgb, var(--success-text) 45%, var(--border));
  color: var(--success-text);
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
  height: clamp(320px, 62vh, 640px);
  flex: 0 1 auto;
  min-width: 0;
  min-height: 0;
  max-width: min(100%, calc(100vw - var(--app-sidebar-width, 232px)));
  max-height: calc(100vh - 180px);
  background: #10131c;
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
  left: 0;
  width: auto;
  height: auto;
  max-width: none;
  max-height: none;
  border-radius: 0;
  resize: none;
  z-index: 50;
  box-shadow: var(--shadow-2);
}

@media (max-height: 640px) {
  .terminal-window {
    height: calc(100vh - 140px);
  }
}

.terminal-window-maximized::after {
  display: none;
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
