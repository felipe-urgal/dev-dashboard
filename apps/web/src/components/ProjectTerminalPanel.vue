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
import {
  copyTextToClipboard,
  isTerminalCopyShortcut,
} from '../utils/terminal-clipboard';
import { MAX_TERMINAL_SCROLLBACK_LINES } from '../utils/terminal-limits';
import ProjectTerminalWindowBar from './ProjectTerminalWindowBar.vue';

const props = withDefaults(
  defineProps<{
    project: Project;
    kind: ProjectTerminalKind;
    title: string;
    description: string;
    autoStart?: boolean;
    environmentInstanceId?: string | undefined;
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
const terminalContextMenu = ref<{ left: number; top: number } | null>(null);
const macOS =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const copyShortcutLabel = macOS ? '⌘C' : 'Ctrl+C';

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
      props.environmentInstanceId,
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
    scrollback: MAX_TERMINAL_SCROLLBACK_LINES,
    fontSize: terminalFontSize.value,
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
    theme: { background: '#10131c', foreground: '#dbe0f2' },
  });
  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(terminalContainer.value);
  fitAddon.fit();

  terminal.attachCustomKeyEventHandler((event) => {
    if (
      event.type !== 'keydown' ||
      !terminal ||
      !isTerminalCopyShortcut(event, terminal.hasSelection(), macOS)
    ) {
      return true;
    }

    void copyTerminalSelection();
    return false;
  });

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

function closeTerminalContextMenu(): void {
  terminalContextMenu.value = null;
}

async function copyTerminalSelection(): Promise<void> {
  const selection = terminal?.getSelection() ?? '';
  closeTerminalContextMenu();
  if (!selection) return;

  await copyTextToClipboard(selection);
  terminal?.focus();
}

function openTerminalContextMenu(event: MouseEvent): void {
  if (!terminal?.hasSelection()) {
    closeTerminalContextMenu();
    return;
  }

  event.preventDefault();

  const margin = 8;
  const menuWidth = 156;
  const menuHeight = 40;
  terminalContextMenu.value = {
    left: Math.max(
      margin,
      Math.min(event.clientX, window.innerWidth - menuWidth - margin),
    ),
    top: Math.max(
      margin,
      Math.min(event.clientY, window.innerHeight - menuHeight - margin),
    ),
  };
}

function disposeTerminal(): void {
  closeTerminalContextMenu();
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
      props.environmentInstanceId,
    );
    const url = projectTerminalWebSocketUrl(
      props.project.id,
      props.kind,
      confirmation.token,
      props.environmentInstanceId,
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
  if (event.key !== 'Escape') return;
  closeTerminalContextMenu();
  if (maximized.value) maximized.value = false;
}

watch(
  () =>
    `${props.project.id}:${props.kind}:${props.environmentInstanceId ?? 'primary'}`,
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
  window.addEventListener('click', closeTerminalContextMenu);
});

onBeforeUnmount(() => {
  disconnect();
  disposeTerminal();
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('click', closeTerminalContextMenu);
});
</script>

<template>
  <div class="terminal-panel">
    <div
      v-if="loadingStatus"
      class="terminal-state"
      role="status"
      aria-live="polite"
    >
      <span class="terminal-state-dot" aria-hidden="true"></span>
      <p>Verificando disponibilidade da sessão…</p>
    </div>

    <div v-else-if="!supported" class="terminal-state terminal-state-error">
      <strong>Terminal indisponível para este projeto.</strong>
      <p>{{ statusMessage }}</p>
    </div>

    <div
      v-else-if="sessionState === 'idle' || sessionState === 'closed'"
      class="terminal-state terminal-state-ready"
    >
      <div class="terminal-state-copy">
        <strong>{{ description }}</strong>
        <p class="terminal-warning">
          Esta sessão permite comandos interativos no ambiente selecionado.
          Execute apenas comandos em que você confia.
        </p>
      </div>
      <button type="button" class="primary-button" @click="startSession">
        {{ sessionState === 'closed' ? 'Abrir nova sessão' : 'Iniciar sessão' }}
      </button>
      <p v-if="errorMessage" class="terminal-error" role="alert">
        {{ errorMessage }}
      </p>
    </div>

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
          :maximized="maximized"
          :font-size="terminalFontSize"
          @toggle-maximized="toggleMaximized"
          @set-font-size="setTerminalFontSize"
        />
        <div
          ref="terminalContainer"
          class="terminal-window-body"
          @contextmenu.capture="openTerminalContextMenu"
        ></div>
        <div
          v-if="terminalContextMenu"
          class="terminal-context-menu"
          :style="{
            left: `${terminalContextMenu.left}px`,
            top: `${terminalContextMenu.top}px`,
          }"
          role="menu"
          @click.stop
          @contextmenu.prevent
        >
          <button
            type="button"
            class="terminal-context-menu-button"
            role="menuitem"
            @click="copyTerminalSelection"
          >
            <span>Copiar</span>
            <kbd>{{ copyShortcutLabel }}</kbd>
          </button>
        </div>
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
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: #10131c;
}

.terminal-state {
  display: grid;
  min-height: 100%;
  place-content: center;
  justify-items: center;
  gap: 12px;
  padding: 32px;
  color: var(--text-muted);
  background: var(--surface-1);
  text-align: center;
}

.terminal-state p,
.terminal-state strong {
  margin: 0;
}

.terminal-state strong {
  color: var(--text);
  font-size: 13px;
}

.terminal-state-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--warning-text);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--warning-text) 12%, transparent);
}

.terminal-state-error {
  color: var(--danger-text);
}

.terminal-state-ready {
  align-content: center;
}

.terminal-state-copy {
  display: grid;
  max-width: 620px;
  gap: 8px;
}

.terminal-warning {
  margin: 0;
  color: var(--warning-text);
  font-size: var(--font-xs);
  line-height: 1.5;
}

.terminal-error {
  margin: 0;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--danger-text);
  background: var(--danger-surface);
  font-size: var(--font-sm);
}

.terminal-backdrop {
  position: fixed;
  z-index: 40;
  inset: 0;
  background: rgba(10, 12, 20, 0.55);
  backdrop-filter: blur(2px);
}

.terminal-window {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
  background: #10131c;
}

.terminal-window-maximized {
  position: fixed;
  z-index: 50;
  inset: 0;
  width: auto;
  height: auto;
}

.terminal-window-body {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 14px 18px 18px;
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

.terminal-context-menu {
  position: fixed;
  z-index: 70;
  min-width: 156px;
  padding: 4px;
  border: 1px solid #30374d;
  border-radius: 8px;
  background: #171b28;
  box-shadow: 0 10px 28px rgb(0 0 0 / 35%);
}

.terminal-context-menu-button {
  display: flex;
  width: 100%;
  min-height: 32px;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  color: #dbe0f2;
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: var(--font-xs);
  text-align: left;
}

.terminal-context-menu-button:hover,
.terminal-context-menu-button:focus-visible {
  background: rgb(124 139 255 / 22%);
  outline: none;
}

.terminal-context-menu-button kbd {
  color: #7d84a3;
  font: inherit;
  font-size: 10px;
}

.terminal-window-error {
  margin: 0 var(--space-3) var(--space-3);
}

@media (max-width: 720px) {
  .terminal-window-body {
    padding: 10px 12px 14px;
  }

  .terminal-state {
    padding: 24px 18px;
  }
}
</style>
