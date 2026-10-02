<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import type {
  Project,
  ProjectTestOverview,
  TestExecutionHistory,
  TestExecutionRecord,
  TestIntelligenceSuggestion,
} from '@dev-dashboard/contracts';

import {
  cancelProjectTestPty,
  fetchProjectTestHistory,
  fetchProjectTestIntelligence,
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
const connectionLost = ref(false);
const contextOpen = ref(false);
const history = ref<TestExecutionHistory | null>(null);
const loadingHistory = ref(false);
const historyErrorMessage = ref('');
const intelligence = ref<TestIntelligenceSuggestion | null>(null);
const loadingIntelligence = ref(false);
const intelligenceErrorMessage = ref('');
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
      selectedCommandId.value = readySnapshot.commandId;
      connectionLost.value = false;
    },
    onExit: (exitCode, exitSignal, exitSnapshot) => {
      snapshot.value =
        exitSnapshot ??
        (snapshot.value
          ? {
              ...snapshot.value,
              status: 'exited',
              exitCode,
              exitSignal,
            }
          : null);
      connectionLost.value = false;
      if (contextOpen.value) void loadHistory();
    },
    onError: (message) => {
      errorMessage.value = message;
    },
    onOpen: () => {
      connectionLost.value = false;
    },
    onClose: () => {
      if (isRunning.value) connectionLost.value = true;
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
const executionStateLabel = computed(() => {
  if (!snapshot.value) return '';
  if (isRunning.value)
    return connectionLost.value ? 'Conexão perdida' : 'Executando';
  if (snapshot.value.cancelled) return 'Cancelado';
  return snapshot.value.exitCode === 0 ? 'Sucesso' : 'Falhou';
});
const executionStateTone = computed(() => {
  if (!snapshot.value) return 'neutral';
  if (isRunning.value) return connectionLost.value ? 'warning' : 'running';
  if (snapshot.value.cancelled) return 'neutral';
  return snapshot.value.exitCode === 0 ? 'success' : 'danger';
});
const relatedTestCount = computed(() =>
  intelligence.value?.recommendation === 'targeted'
    ? intelligence.value.testFiles.length
    : 0,
);

async function loadOverview(refresh = false): Promise<void> {
  loadingOverview.value = true;
  errorMessage.value = '';
  try {
    overview.value = await fetchProjectTests(props.project.id, {
      ...(refresh ? { refresh: true } : {}),
      ...(props.environmentInstanceId
        ? { environmentInstanceId: props.environmentInstanceId }
        : {}),
    });
    if (
      (!selectedCommandId.value ||
        !overview.value.commands.some(
          (command) => command.id === selectedCommandId.value,
        )) &&
      overview.value.commands.length > 0
    ) {
      selectedCommandId.value = overview.value.commands[0]!.id;
    }
    if (overview.value.commands.length === 0) selectedCommandId.value = '';
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar os comandos de teste.';
  } finally {
    loadingOverview.value = false;
  }
}

async function loadHistory(): Promise<void> {
  loadingHistory.value = true;
  historyErrorMessage.value = '';
  try {
    history.value = await fetchProjectTestHistory(
      props.project.id,
      1,
      5,
      props.environmentInstanceId,
    );
  } catch (error) {
    historyErrorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível carregar o histórico de testes.';
  } finally {
    loadingHistory.value = false;
  }
}

async function loadIntelligence(): Promise<void> {
  if (!selectedCommandId.value) {
    intelligence.value = null;
    return;
  }
  loadingIntelligence.value = true;
  intelligenceErrorMessage.value = '';
  try {
    intelligence.value = await fetchProjectTestIntelligence(
      props.project.id,
      selectedCommandId.value,
      props.environmentInstanceId,
    );
  } catch (error) {
    intelligence.value = null;
    intelligenceErrorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível calcular a recomendação de testes.';
  } finally {
    loadingIntelligence.value = false;
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
      selectedCommandId.value = snapshot.value.commandId;
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

async function start(
  mode: 'full-suite' | 'related' = 'full-suite',
): Promise<void> {
  if (!selectedCommandId.value || isRunning.value || starting.value) return;
  errorMessage.value = '';
  starting.value = true;
  disposeTerminal();
  try {
    snapshot.value = await startProjectTestPty(
      props.project.id,
      selectedCommandId.value,
      props.environmentInstanceId,
      { mode },
    );
    connectionLost.value = false;
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

function reconnect(): void {
  errorMessage.value = '';
  connectionLost.value = false;
  disconnect();
  connect(
    projectTestPtyWebSocketUrl(props.project.id, props.environmentInstanceId),
  );
}

function handleContextToggle(event: Event): void {
  const details = event.currentTarget as HTMLDetailsElement;
  contextOpen.value = details.open;
  if (!details.open) return;
  void loadHistory();
  void loadIntelligence();
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDuration(record: TestExecutionRecord): string {
  if (!record.finishedAt) return '—';
  const started = new Date(record.startedAt).getTime();
  const finished = new Date(record.finishedAt).getTime();
  if (
    !Number.isFinite(started) ||
    !Number.isFinite(finished) ||
    finished < started
  )
    return '—';
  const seconds = Math.round((finished - started) / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function historyStatus(record: TestExecutionRecord): string {
  if (record.cancelled) return 'Cancelado';
  if (record.status === 'running' || record.status === 'starting')
    return 'Executando';
  if (record.status === 'failed' || (record.exitCode ?? 0) !== 0)
    return 'Falhou';
  return 'Sucesso';
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
  connectionLost.value = false;
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
    connectionLost.value = false;
    contextOpen.value = false;
    history.value = null;
    intelligence.value = null;
    errorMessage.value = '';
    selectedCommandId.value = '';
    overview.value = null;
    void loadOverview();
    void loadStatusAndReconnect();
  },
  { immediate: true },
);

watch(selectedCommandId, () => {
  intelligence.value = null;
  if (contextOpen.value) void loadIntelligence();
});
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
            <option v-else-if="overview && !overview.supported" value="">
              Nenhuma suíte detectada
            </option>
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
            {{ environmentInstanceId ? 'Environment Instance' : 'Principal' }}
          </div>
        </div>

        <div class="tests-execution-actions">
          <button
            type="button"
            class="primary-button"
            :disabled="
              loadingOverview || !selectedCommand || isRunning || starting
            "
            @click="start('full-suite')"
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

      <div
        v-if="!loadingOverview && overview && !overview.supported"
        class="tests-empty-state"
      >
        <span>Nenhuma suíte de testes foi detectada neste ambiente.</span>
        <button
          type="button"
          class="secondary-button"
          @click="loadOverview(true)"
        >
          Detectar novamente
        </button>
      </div>

      <p v-if="connecting" class="tests-pty-status">Conectando à execução…</p>
      <p v-if="errorMessage" class="tests-pty-error" role="alert">
        {{ errorMessage }}
      </p>
      <div v-if="connectionLost && isRunning" class="tests-connection-lost">
        <span
          >A execução continua ativa, mas a conexão com a saída foi
          interrompida.</span
        >
        <button type="button" class="secondary-button" @click="reconnect">
          Reconectar
        </button>
      </div>

      <details class="tests-context" @toggle="handleContextToggle">
        <summary>
          <span>Contexto de execução</span>
          <small>Histórico e Test Intelligence</small>
        </summary>
        <div class="tests-context-grid">
          <section class="tests-intelligence" aria-label="Test Intelligence">
            <header>
              <strong>Test Intelligence</strong>
              <span v-if="loadingIntelligence">Calculando…</span>
              <span v-else-if="intelligence">
                {{
                  intelligence.recommendation === 'targeted'
                    ? `${intelligence.testFiles.length} relacionados`
                    : 'Suíte completa'
                }}
              </span>
            </header>
            <p v-if="intelligenceErrorMessage" class="tests-context-error">
              {{ intelligenceErrorMessage }}
            </p>
            <template v-else-if="intelligence">
              <p>
                {{ intelligence.baseBranch }} →
                {{ intelligence.currentBranch }} ·
                {{ intelligence.changedFiles.length }} arquivo(s) alterado(s)
              </p>
              <button
                v-if="relatedTestCount > 0"
                type="button"
                class="secondary-button"
                :disabled="isRunning || starting"
                @click="start('related')"
              >
                Executar {{ relatedTestCount }} relacionados
              </button>
            </template>
          </section>

          <section class="tests-history" aria-label="Histórico de testes">
            <header>
              <strong>Últimas execuções</strong>
              <span v-if="loadingHistory">Atualizando…</span>
              <span v-else>{{ history?.total ?? 0 }}</span>
            </header>
            <p v-if="historyErrorMessage" class="tests-context-error">
              {{ historyErrorMessage }}
            </p>
            <ul v-else-if="history?.items.length">
              <li v-for="record in history.items" :key="record.id">
                <span>{{ historyStatus(record) }}</span>
                <strong>{{ record.commandId }}</strong>
                <small>
                  {{ formatDateTime(record.startedAt) }} ·
                  {{ formatDuration(record) }}
                </small>
              </li>
            </ul>
            <p v-else-if="!loadingHistory">Nenhuma execução registrada.</p>
          </section>
        </div>
      </details>

      <section v-if="snapshot" class="tests-output">
        <div class="tests-output-heading">
          <div>
            <span>Saída da execução</span>
            <small>{{ selectedCommand?.label ?? snapshot.commandId }}</small>
            <span
              class="tests-execution-state"
              :class="`is-${executionStateTone}`"
            >
              {{ executionStateLabel }}
            </span>
            <small v-if="snapshot.truncated">saída anterior truncada</small>
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

.tests-empty-state,
.tests-connection-lost {
  display: flex;
  min-height: 42px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 10px;
  background: var(--surface-2);
}

.tests-context {
  flex: 0 0 auto;
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
}

.tests-context > summary {
  display: flex;
  min-height: 34px;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  cursor: pointer;
  color: var(--text);
  font-size: 10px;
}

.tests-context > summary small {
  color: var(--text-muted);
}

.tests-context-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-top: 1px solid var(--border);
}

.tests-intelligence,
.tests-history {
  display: grid;
  align-content: start;
  gap: 7px;
  min-width: 0;
  padding: 10px 14px;
  font-size: 10px;
}

.tests-intelligence {
  border-right: 1px solid var(--border);
}

.tests-intelligence header,
.tests-history header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tests-intelligence p,
.tests-history p {
  margin: 0;
  color: var(--text-muted);
}

.tests-history ul {
  display: grid;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.tests-history li {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.tests-history li strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tests-history li small {
  color: var(--text-muted);
  white-space: nowrap;
}

.tests-context-error {
  color: var(--danger-text) !important;
}

.tests-execution-state {
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 9px;
  font-weight: var(--font-weight-strong);
}

.tests-execution-state.is-running {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.tests-execution-state.is-success {
  color: var(--success-text);
  background: var(--success-surface);
}

.tests-execution-state.is-danger {
  color: var(--danger-text);
  background: var(--danger-surface);
}

.tests-execution-state.is-warning {
  color: var(--text-muted);
  background: var(--surface-2);
}

.tests-execution-state.is-neutral {
  color: var(--text-muted);
  background: var(--surface-2);
}

@media (max-width: 980px) {
  .tests-execution-controls {
    grid-template-columns: minmax(0, 1fr) minmax(160px, 0.55fr);
  }

  .tests-execution-actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
  }

  .tests-context-grid {
    grid-template-columns: 1fr;
  }

  .tests-intelligence {
    border-right: 0;
    border-bottom: 1px solid var(--border);
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
