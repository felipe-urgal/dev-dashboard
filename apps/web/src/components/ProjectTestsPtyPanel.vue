<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import type { Project, ProjectTestOverview } from '@dev-dashboard/contracts';

import {
  cancelProjectTestPty,
  fetchProjectTestPtyStatus,
  fetchProjectTests,
  projectTestPtyWebSocketUrl,
  startProjectTestPty,
  type ProjectTestPtyStatusSnapshot,
} from '../api';
import { usePtyTerminalSocket } from '../composables/usePtyTerminalSocket';

const props = defineProps<{
  project: Project;
  environmentInstanceId?: string | undefined;
}>();

const overview = ref<ProjectTestOverview | null>(null);
const loadingOverview = ref(false);
const selectedCommandId = ref('');
const snapshot = ref<ProjectTestPtyStatusSnapshot | null>(null);
const starting = ref(false);
const cancelling = ref(false);
const errorMessage = ref('');
const terminalContextMenu = ref<{ left: number; top: number } | null>(null);

const {
  terminalContainer,
  connecting,
  connect,
  disconnect,
  disposeTerminal,
  hasTerminalSelection,
  copyTerminalSelection,
  copyShortcutLabel,
} = usePtyTerminalSocket<ProjectTestPtyStatusSnapshot & { buffer: string }>(
  {
    onReady: (readySnapshot) => {
      snapshot.value = readySnapshot;
    },
    onExit: (exitCode, exitSignal) => {
      if (snapshot.value) {
        snapshot.value = {
          ...snapshot.value,
          status: 'exited',
          exitCode,
          exitSignal,
        };
      }
    },
    onError: (message) => {
      errorMessage.value = message;
    },
  },
  { enableClipboard: true },
);

const isRunning = computed(() => snapshot.value?.status === 'running');
const selectedCommand = computed(() =>
  overview.value?.commands.find(
    (command) => command.id === selectedCommandId.value,
  ),
);

async function loadOverview(): Promise<void> {
  loadingOverview.value = true;
  try {
    overview.value = props.environmentInstanceId
      ? await fetchProjectTests(props.project.id, {
          environmentInstanceId: props.environmentInstanceId,
        })
      : await fetchProjectTests(props.project.id);
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

async function loadStatusAndReconnect(): Promise<void> {
  try {
    snapshot.value = props.environmentInstanceId
      ? await fetchProjectTestPtyStatus(
          props.project.id,
          props.environmentInstanceId,
        )
      : await fetchProjectTestPtyStatus(props.project.id);
    if (snapshot.value) {
      connect(
        projectTestPtyWebSocketUrl(
          props.project.id,
          props.environmentInstanceId,
        ),
      );
    }
  } catch {
    // Best-effort: se a consulta inicial falhar, executar testes continua disponível.
  }
}

async function start(): Promise<void> {
  if (!selectedCommandId.value || isRunning.value || starting.value) return;
  errorMessage.value = '';
  starting.value = true;
  disposeTerminal();
  try {
    snapshot.value = props.environmentInstanceId
      ? await startProjectTestPty(
          props.project.id,
          selectedCommandId.value,
          props.environmentInstanceId,
        )
      : await startProjectTestPty(props.project.id, selectedCommandId.value);
    connect(
      projectTestPtyWebSocketUrl(props.project.id, props.environmentInstanceId),
    );
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível iniciar os testes.';
    await loadStatusAndReconnect();
  } finally {
    starting.value = false;
  }
}

async function cancel(): Promise<void> {
  cancelling.value = true;
  try {
    if (props.environmentInstanceId) {
      await cancelProjectTestPty(props.project.id, props.environmentInstanceId);
    } else {
      await cancelProjectTestPty(props.project.id);
    }
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível cancelar a execução.';
  } finally {
    cancelling.value = false;
  }
}

function closeTerminalContextMenu(): void {
  terminalContextMenu.value = null;
}

async function copyTerminalSelectionFromMenu(): Promise<void> {
  closeTerminalContextMenu();
  await copyTerminalSelection();
}

function openTerminalContextMenu(event: MouseEvent): void {
  if (!hasTerminalSelection()) {
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

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeTerminalContextMenu();
}

function closeTerminal(): void {
  closeTerminalContextMenu();
  disconnect();
  disposeTerminal();
  snapshot.value = null;
  errorMessage.value = '';
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('click', closeTerminalContextMenu);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('click', closeTerminalContextMenu);
});

watch(
  () => `${props.project.id}:${props.environmentInstanceId ?? ''}`,
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
</script>

<template>
  <section class="tests-pty-panel">
    <section class="tests-execution-pane">
      <div class="tests-execution-controls">
        <label class="tests-control-field">
          <span>Suíte de testes</span>
          <select
            v-model="selectedCommandId"
            :disabled="
              loadingOverview ||
              isRunning ||
              (overview?.commands.length ?? 0) <= 1
            "
            aria-label="Comando de teste"
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
        </label>

        <div class="tests-control-field">
          <span>Ambiente</span>
          <div
            class="tests-local-environment"
            aria-label="Ambiente de execução"
          >
            {{ environmentInstanceId ? 'Environment Instance' : 'Local' }}
          </div>
        </div>

        <div class="tests-execution-actions">
          <button
            type="button"
            class="primary-button"
            :disabled="
              loadingOverview || !selectedCommand || isRunning || starting
            "
            @click="start"
          >
            {{ starting ? 'Iniciando…' : 'Executar testes' }}
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
      </div>

      <p v-if="connecting" class="tests-pty-status">Conectando à execução…</p>
      <p v-if="errorMessage" class="tests-pty-error" role="alert">
        {{ errorMessage }}
      </p>

      <section v-if="snapshot" class="tests-output">
        <div class="tests-output-heading">
          <div>
            <span>Saída da execução</span>
            <small>{{ selectedCommand?.label ?? 'Testes' }}</small>
          </div>
          <button
            v-if="!isRunning"
            type="button"
            class="secondary-button"
            @click="closeTerminal"
          >
            Fechar saída
          </button>
        </div>
        <div
          ref="terminalContainer"
          class="tests-pty-terminal"
          @contextmenu.capture="openTerminalContextMenu"
        ></div>
        <div
          v-if="terminalContextMenu"
          class="tests-terminal-context-menu"
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
            class="tests-terminal-context-menu-button"
            role="menuitem"
            @click="copyTerminalSelectionFromMenu"
          >
            <span>Copiar</span>
            <kbd>{{ copyShortcutLabel }}</kbd>
          </button>
        </div>
      </section>
    </section>
  </section>
</template>

<style scoped>
.tests-pty-panel {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: calc(100vh - var(--app-topbar-height, 72px));
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-1);
}

.tests-execution-pane {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
}

.tests-execution-controls {
  display: grid;
  min-height: 64px;
  flex: 0 0 auto;
  grid-template-columns: minmax(260px, 1fr) minmax(160px, 0.32fr) auto;
  align-items: end;
  gap: 10px;
  padding: 9px 12px 10px 14px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-1) 96%, var(--surface-2) 4%);
}

.tests-control-field {
  display: grid;
  min-width: 0;
  gap: 4px;
  color: var(--text-muted);
  font-size: 9px;
  font-weight: var(--font-weight-strong);
}

.tests-control-field select,
.tests-local-environment {
  box-sizing: border-box;
  width: 100%;
  min-height: 34px;
  border-radius: var(--radius-sm);
  font-size: 10px;
}

.tests-control-field select {
  padding: 0 9px;
  border: 1px solid var(--border);
  color: var(--text);
  background: var(--surface-2);
}

.tests-local-environment {
  display: flex;
  align-items: center;
  padding: 0 9px;
  border: 1px solid var(--border);
  color: var(--text);
  background: var(--surface-2);
}

.tests-execution-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.tests-execution-actions button,
.tests-output-heading button {
  min-height: 34px;
  padding-inline: 11px;
  white-space: nowrap;
  font-size: 10px;
}

.tests-pty-status,
.tests-pty-error {
  flex: 0 0 auto;
  margin: 0;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  font-size: 10px;
}

.tests-pty-status {
  color: var(--text-muted);
  background: var(--surface-2);
}

.tests-pty-error {
  color: var(--danger-text);
  background: var(--danger-surface);
}

.tests-output {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
  background: #10131c;
}

.tests-output-heading {
  display: flex;
  min-height: 46px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-1) 96%, var(--surface-2) 4%);
}

.tests-output-heading > div {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 8px;
}

.tests-output-heading span {
  color: var(--text);
  font-size: 10px;
  font-weight: var(--font-weight-strong);
}

.tests-output-heading small {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tests-pty-terminal {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  width: 100%;
  overflow: hidden;
  padding: 14px 18px 18px;
  background: #10131c;
}

.tests-pty-terminal :global(.xterm) {
  width: 100%;
  height: 100%;
}

.tests-pty-terminal :global(.xterm-viewport) {
  overflow-x: hidden !important;
  overflow-y: auto !important;
  background-color: #10131c !important;
  scrollbar-width: none;
}

.tests-pty-terminal :global(.xterm-viewport::-webkit-scrollbar) {
  display: none;
}

.tests-terminal-context-menu {
  position: fixed;
  z-index: 70;
  min-width: 156px;
  padding: 4px;
  border: 1px solid #30374d;
  border-radius: 8px;
  background: #171b28;
  box-shadow: 0 10px 28px rgb(0 0 0 / 35%);
}

.tests-terminal-context-menu-button {
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

.tests-terminal-context-menu-button:hover,
.tests-terminal-context-menu-button:focus-visible {
  background: rgb(124 139 255 / 22%);
  outline: none;
}

.tests-terminal-context-menu-button kbd {
  color: #7d84a3;
  font: inherit;
  font-size: 10px;
}

@media (max-width: 980px) {
  .tests-execution-controls {
    grid-template-columns: minmax(0, 1fr) minmax(160px, 0.55fr);
  }

  .tests-execution-actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }
}

@media (max-width: 700px) {
  .tests-execution-controls {
    grid-template-columns: 1fr;
  }

  .tests-execution-actions {
    grid-column: auto;
    flex-wrap: wrap;
    justify-content: stretch;
  }

  .tests-execution-actions button {
    flex: 1 1 auto;
  }

  .tests-output-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .tests-output-heading > div {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }
}
</style>
