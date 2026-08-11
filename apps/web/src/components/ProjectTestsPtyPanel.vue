<script setup lang="ts">
import '@xterm/xterm/css/xterm.css';

import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import type { Project, ProjectTestOverview } from '@dev-dashboard/contracts';

import {
  cancelProjectTestPty,
  fetchProjectTestPtyStatus,
  fetchProjectTests,
  projectTestPtyWebSocketUrl,
  startProjectTestPty,
  type ProjectTestPtyStatusSnapshot,
} from '../api';
import Card from './Card.vue';

const props = defineProps<{ project: Project }>();

interface ReadyFrame {
  type: 'ready';
  snapshot: ProjectTestPtyStatusSnapshot & { buffer: string };
}
interface OutputFrame {
  type: 'output';
  data: string;
}
interface ExitFrame {
  type: 'exit';
  exitCode: number | null;
  exitSignal: number | null;
}
interface ErrorFrame {
  type: 'error';
  message: string;
}
type ServerFrame = ReadyFrame | OutputFrame | ExitFrame | ErrorFrame;

const overview = ref<ProjectTestOverview | null>(null);
const loadingOverview = ref(false);
const selectedCommandId = ref('');
const snapshot = ref<ProjectTestPtyStatusSnapshot | null>(null);
const connecting = ref(false);
const starting = ref(false);
const cancelling = ref(false);
const errorMessage = ref('');

const terminalContainer = ref<HTMLDivElement | null>(null);
let terminal: Terminal | undefined;
let fitAddon: FitAddon | undefined;
let resizeObserver: ResizeObserver | undefined;
let socket: WebSocket | undefined;

const isRunning = computed(() => snapshot.value?.status === 'running');
const selectedCommand = computed(() =>
  overview.value?.commands.find(
    (command) => command.id === selectedCommandId.value,
  ),
);
const exitLabel = computed(() => {
  if (!snapshot.value || snapshot.value.status !== 'exited') return '';
  const code = snapshot.value.exitCode;
  return code === 0
    ? 'Concluído com sucesso'
    : `Encerrado (código ${code ?? '—'})`;
});

async function loadOverview(): Promise<void> {
  loadingOverview.value = true;
  try {
    overview.value = await fetchProjectTests(props.project.id);
    if (!selectedCommandId.value && (overview.value.commands.length ?? 0) > 0) {
      selectedCommandId.value = overview.value.commands[0]!.id;
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar os comandos de teste.';
  } finally {
    loadingOverview.value = false;
  }
}

function mountTerminal(): void {
  if (!terminalContainer.value || terminal) return;
  terminal = new Terminal({
    convertEol: true,
    disableStdin: true,
    fontSize: 13,
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
    theme: { background: '#10131c', foreground: '#dbe0f2' },
  });
  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(terminalContainer.value);
  fitAddon.fit();
  resizeObserver = new ResizeObserver(() => fitAddon?.fit());
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
  socket?.close(1000, 'Painel fechado');
  socket = undefined;
}

function connect(): void {
  if (socket) return;
  connecting.value = true;
  const newSocket = new WebSocket(projectTestPtyWebSocketUrl(props.project.id));
  socket = newSocket;

  newSocket.addEventListener('open', () => {
    if (socket !== newSocket) return;
    connecting.value = false;
  });

  newSocket.addEventListener('message', (event) => {
    if (socket !== newSocket || typeof event.data !== 'string') return;
    let message: ServerFrame;
    try {
      message = JSON.parse(event.data) as ServerFrame;
    } catch {
      return;
    }

    if (message.type === 'ready') {
      snapshot.value = message.snapshot;
      requestAnimationFrame(() => {
        mountTerminal();
        if (message.snapshot.buffer) terminal?.write(message.snapshot.buffer);
      });
    } else if (message.type === 'output') {
      mountTerminal();
      terminal?.write(message.data);
    } else if (message.type === 'exit') {
      if (snapshot.value) {
        snapshot.value = {
          ...snapshot.value,
          status: 'exited',
          exitCode: message.exitCode,
          exitSignal: message.exitSignal,
        };
      }
      terminal?.write(
        `\r\n\x1b[90m[execução encerrada, código ${message.exitCode ?? '—'}]\x1b[0m\r\n`,
      );
    } else if (message.type === 'error') {
      errorMessage.value = message.message;
    }
  });

  newSocket.addEventListener('close', () => {
    if (socket !== newSocket) return;
    socket = undefined;
    connecting.value = false;
  });

  newSocket.addEventListener('error', () => {
    if (socket !== newSocket) return;
    errorMessage.value = 'A conexão com a execução de testes falhou.';
  });
}

async function loadStatusAndReconnect(): Promise<void> {
  try {
    snapshot.value = await fetchProjectTestPtyStatus(props.project.id);
    if (snapshot.value) connect();
  } catch {
    // best-effort: se a consulta inicial falhar, o botão "Executar" ainda funciona.
  }
}

async function start(): Promise<void> {
  if (!selectedCommandId.value || isRunning.value || starting.value) return;
  errorMessage.value = '';
  starting.value = true;
  disposeTerminal();
  try {
    snapshot.value = await startProjectTestPty(
      props.project.id,
      selectedCommandId.value,
    );
    connect();
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível iniciar os testes.';
  } finally {
    starting.value = false;
  }
}

async function cancel(): Promise<void> {
  cancelling.value = true;
  try {
    await cancelProjectTestPty(props.project.id);
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível cancelar a execução.';
  } finally {
    cancelling.value = false;
  }
}

watch(
  () => props.project.id,
  () => {
    disconnect();
    disposeTerminal();
    snapshot.value = null;
    errorMessage.value = '';
    selectedCommandId.value = '';
    overview.value = null;
    void loadOverview();
    void loadStatusAndReconnect();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  disconnect();
  disposeTerminal();
});
</script>

<template>
  <Card padded class="project-detail-card tests-pty-panel">
    <template #header>
      <h3>Testes</h3>
    </template>

    <p class="tests-pty-note">
      Prova de conceito: roda a suíte completa num terminal de verdade — cores e
      formatação idênticas ao que você veria rodando o comando localmente.
      Execução por arquivo/caso específico e testes relacionados à branch ainda
      não migraram para cá.
    </p>

    <div class="tests-pty-controls">
      <select
        v-model="selectedCommandId"
        :disabled="
          loadingOverview || isRunning || (overview?.commands.length ?? 0) <= 1
        "
      >
        <option v-if="loadingOverview" value="">Carregando…</option>
        <option
          v-for="command in overview?.commands ?? []"
          :key="command.id"
          :value="command.id"
        >
          {{ command.label }}
        </option>
      </select>

      <button
        type="button"
        class="primary-button"
        :disabled="!selectedCommand || isRunning || starting"
        @click="start"
      >
        {{ starting ? 'Iniciando…' : 'Executar suíte completa' }}
      </button>

      <button
        v-if="isRunning"
        type="button"
        class="secondary-button"
        :disabled="cancelling"
        @click="cancel"
      >
        {{ cancelling ? 'Cancelando…' : 'Cancelar' }}
      </button>
    </div>

    <p v-if="connecting" class="tests-pty-status">Conectando…</p>
    <p v-else-if="isRunning" class="tests-pty-status">Executando…</p>
    <p v-else-if="exitLabel" class="tests-pty-status">{{ exitLabel }}</p>

    <p v-if="errorMessage" class="tests-pty-error" role="alert">
      {{ errorMessage }}
    </p>

    <div
      v-if="snapshot"
      ref="terminalContainer"
      class="tests-pty-terminal"
    ></div>
  </Card>
</template>

<style scoped>
.tests-pty-panel {
  display: grid;
  gap: var(--space-3);
}

.tests-pty-note {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.tests-pty-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

.tests-pty-status {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.tests-pty-error {
  color: var(--danger-text);
  background: var(--danger-surface);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  margin: 0;
  font-size: var(--font-sm);
}

.tests-pty-terminal {
  height: 420px;
  background: #10131c;
  border: 1px solid #262c40;
  border-radius: var(--radius-md);
  padding: var(--space-3);
  overflow: hidden;
}
</style>
