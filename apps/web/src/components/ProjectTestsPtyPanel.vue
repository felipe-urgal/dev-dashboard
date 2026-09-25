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
import Card from './Card.vue';

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
  <Card padded class="project-detail-card tests-pty-panel">
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
  </Card>
</template>

<style scoped>
:global(.dd-card.project-detail-card.tests-pty-panel) {
  display: flex;
  flex-direction: column;
  align-content: normal;
  grid-template-rows: none;
  min-height: 0;
}

.tests-pty-panel {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.tests-execution-pane {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: auto;
}

.tests-execution-controls {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(180px, 0.35fr) auto;
  align-items: end;
  gap: var(--space-4);
  padding: 16px;
}

.tests-control-field {
  display: grid;
  min-width: 0;
  gap: 6px;
  color: var(--text-muted);
  font-size: 11px;
}

.tests-control-field select,
.tests-local-environment {
  box-sizing: border-box;
  width: 100%;
  min-height: 38px;
}

.tests-local-environment {
  display: flex;
  align-items: center;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
}

.tests-execution-actions {
  display: flex;
  gap: var(--space-2);
}

.tests-execution-actions button,
.tests-output-heading button {
  min-height: 38px;
  white-space: nowrap;
}

.tests-pty-status,
.tests-pty-error {
  margin: 0 16px var(--space-3);
  font-size: var(--font-sm);
}

.tests-pty-status {
  color: var(--text-muted);
}

.tests-pty-error {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--danger-surface);
  color: var(--danger-text);
}

.tests-output {
  display: flex;
  min-height: 280px;
  flex: 1 1 340px;
  flex-direction: column;
  margin-top: 0;
  border-top: 1px solid var(--border);
}

.tests-output-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: 10px 16px;
  background: var(--surface-2);
}

.tests-output-heading > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.tests-output-heading span {
  color: var(--text);
  font-size: 11px;
  font-weight: 700;
}

.tests-output-heading small {
  color: var(--text-muted);
  font-size: 11px;
}

.tests-pty-terminal {
  flex: 1 1 260px;
  min-height: 260px;
  box-sizing: border-box;
  width: 100%;
  background: #10131c;
  padding: 16px 18px 20px;
  overflow: hidden;
}

.tests-pty-terminal :global(.xterm) {
  width: 100%;
  height: 100%;
  padding-inline: 10px;
}

.tests-pty-terminal :global(.xterm-viewport) {
  background-color: #10131c !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
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
  background: transparent;
  color: #dbe0f2;
  font: inherit;
  font-size: var(--font-xs);
  text-align: left;
  cursor: pointer;
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
    grid-template-columns: minmax(0, 1fr) minmax(180px, 0.55fr);
  }

  .tests-execution-actions {
    grid-column: 1 / -1;
  }
}

@media (max-width: 700px) {
  .tests-execution-controls {
    grid-template-columns: 1fr;
  }

  .tests-execution-actions {
    grid-column: auto;
    flex-wrap: wrap;
  }
}
</style>
