<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ArrowPathIcon, PlayIcon, StopIcon } from '@heroicons/vue/24/outline';

import type {
  Project,
  ProjectTestOverview,
  TestExecutionHistory,
  TestExecutionRecord,
  TestIntelligenceSuggestion,
  TestRunResult,
} from '@dev-dashboard/contracts';

import {
  cancelProjectTestPty,
  fetchProjectTestFiles,
  fetchProjectTestHistory,
  fetchProjectTestIntelligence,
  fetchProjectTestPtyResult,
  fetchProjectTestPtyStatus,
  fetchProjectTests,
  projectTestPtyWebSocketUrl,
  startProjectTestPty,
  type ProjectTestPtyStatusSnapshot,
} from '../api';
import { usePtyTerminalSocket } from '../composables/usePtyTerminalSocket';
import TestFilePicker from './project-tests/TestFilePicker.vue';
import TestInsights from './project-tests/TestInsights.vue';
import TestResults from './project-tests/TestResults.vue';
import UiButton from './ui/UiButton.vue';
import UiTag from './ui/UiTag.vue';

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
const tab = ref<'results' | 'output' | 'history'>('output');
const result = ref<TestRunResult | null>(null);
const history = ref<TestExecutionHistory | null>(null);
const loadingHistory = ref(false);
const historyErrorMessage = ref('');
const intelligence = ref<TestIntelligenceSuggestion | null>(null);
const files = ref<string[]>([]);
const loadingFiles = ref(false);
const filesErrorMessage = ref('');
const selectedFiles = ref<string[]>([]);
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
} = usePtyTerminalSocket<ProjectTestPtyStatusSnapshot & { buffer: string }>({
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
    void loadHistory();
    void loadResult(true);
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
});

const isRunning = computed(() => snapshot.value?.status === 'running');
const selectedCommand = computed(() =>
  overview.value?.commands.find(
    (command) => command.id === selectedCommandId.value,
  ),
);
const canPickFiles = computed(
  () => selectedCommand.value?.supportsFileTarget === true,
);
const relatedFiles = computed(() => {
  if (intelligence.value?.recommendation !== 'targeted') return [];
  const available = new Set(files.value);
  return intelligence.value.testFiles.filter((file) => available.has(file));
});
const executionStateLabel = computed(() => {
  if (!snapshot.value) return '';
  if (isRunning.value)
    return connectionLost.value ? 'Conexão perdida' : 'Executando';
  if (snapshot.value.cancelled) return 'Cancelado';
  return snapshot.value.exitCode === 0 ? 'Sucesso' : 'Falhou';
});
const executionStateTone = computed<
  'neutral' | 'accent' | 'warning' | 'success' | 'danger'
>(() => {
  if (!snapshot.value) return 'neutral';
  if (isRunning.value) return connectionLost.value ? 'warning' : 'accent';
  if (snapshot.value.cancelled) return 'neutral';
  return snapshot.value.exitCode === 0 ? 'success' : 'danger';
});
const runLabel = computed(() => {
  if (starting.value) return 'Iniciando…';
  const count = selectedFiles.value.length;
  return count > 0 ? `Executar selecionados (${count})` : 'Executar todos';
});

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

async function loadFiles(): Promise<void> {
  files.value = [];
  selectedFiles.value = [];
  filesErrorMessage.value = '';
  if (!selectedCommandId.value || !canPickFiles.value) return;
  const commandId = selectedCommandId.value;
  loadingFiles.value = true;
  try {
    const result = await fetchProjectTestFiles(
      props.project.id,
      commandId,
      props.environmentInstanceId,
    );
    if (commandId !== selectedCommandId.value) return;
    files.value = result.map((file) => file.path);
  } catch (error) {
    if (commandId !== selectedCommandId.value) return;
    filesErrorMessage.value =
      error instanceof Error
        ? error.message
        : 'Não foi possível listar os arquivos de teste.';
  } finally {
    if (commandId === selectedCommandId.value) loadingFiles.value = false;
  }
}

async function loadResult(showTab = false): Promise<void> {
  try {
    const next = await fetchProjectTestPtyResult(
      props.project.id,
      props.environmentInstanceId,
    );
    result.value = next;
    if (next && showTab) tab.value = 'results';
  } catch {
    // Sem o resultado estruturado, a saída do terminal continua disponível.
    result.value = null;
  }
}

async function loadHistory(): Promise<void> {
  loadingHistory.value = true;
  historyErrorMessage.value = '';
  try {
    history.value = await fetchProjectTestHistory(
      props.project.id,
      1,
      10,
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
  intelligence.value = null;
  if (!selectedCommandId.value || !canPickFiles.value) return;
  const commandId = selectedCommandId.value;
  try {
    const result = await fetchProjectTestIntelligence(
      props.project.id,
      commandId,
      props.environmentInstanceId,
    );
    if (commandId === selectedCommandId.value) intelligence.value = result;
  } catch {
    // Sem a recomendação, escolher e executar arquivos continua disponível.
    intelligence.value = null;
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
      if (snapshot.value.status === 'exited') void loadResult();
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

async function start(only?: string[]): Promise<void> {
  if (!selectedCommandId.value || isRunning.value || starting.value) return;
  errorMessage.value = '';
  starting.value = true;
  disposeTerminal();
  tab.value = 'output';
  result.value = null;
  const paths = only ? [...only] : [...selectedFiles.value];
  try {
    snapshot.value = await startProjectTestPty(
      props.project.id,
      selectedCommandId.value,
      props.environmentInstanceId,
      paths.length > 0 ? { mode: 'files', paths } : { mode: 'full-suite' },
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

/** Barras de duração das últimas execuções (da mais antiga para a mais nova). */
const durationBars = computed(() => {
  const records = [...(history.value?.items ?? [])].reverse();
  const durations = records.map((record) => {
    if (!record.finishedAt) return 0;
    const started = new Date(record.startedAt).getTime();
    const finished = new Date(record.finishedAt).getTime();
    return Number.isFinite(started) && Number.isFinite(finished)
      ? Math.max(0, finished - started)
      : 0;
  });
  const longest = Math.max(...durations, 1);
  return records.map((record, index) => ({
    id: record.id,
    height: Math.max(8, Math.round(((durations[index] ?? 0) / longest) * 100)),
    tone: historyStatus(record).tone,
    title: `${historyStatus(record).label} · ${formatDuration(record)}`,
  }));
});

function canRerun(record: TestExecutionRecord): boolean {
  if (record.scope !== 'targeted') return true;
  return (record.targetFiles?.length ?? (record.targetFile ? 1 : 0)) > 0;
}

function rerunRecord(record: TestExecutionRecord): void {
  if (isRunning.value || starting.value || !canRerun(record)) return;
  if (overview.value?.commands.some((c) => c.id === record.commandId)) {
    selectedCommandId.value = record.commandId;
  }
  const paths =
    record.scope === 'targeted'
      ? (record.targetFiles ?? (record.targetFile ? [record.targetFile] : []))
      : [];
  void start(paths);
}

function rerunFailed(): void {
  const failed = result.value?.failedFiles ?? [];
  if (failed.length === 0) return;
  selectedFiles.value = [...failed];
  void start(failed);
}

function selectRelated(): void {
  selectedFiles.value = [
    ...new Set([...selectedFiles.value, ...relatedFiles.value]),
  ];
}

function reconnect(): void {
  errorMessage.value = '';
  connectionLost.value = false;
  disconnect();
  connect(
    projectTestPtyWebSocketUrl(props.project.id, props.environmentInstanceId),
  );
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

function historyStatus(record: TestExecutionRecord): {
  label: string;
  tone: 'neutral' | 'accent' | 'success' | 'danger';
} {
  if (record.cancelled) return { label: 'Cancelado', tone: 'neutral' };
  if (record.status === 'running' || record.status === 'starting')
    return { label: 'Executando', tone: 'accent' };
  if (record.status === 'failed' || (record.exitCode ?? 0) !== 0)
    return { label: 'Falhou', tone: 'danger' };
  return { label: 'Sucesso', tone: 'success' };
}

function historyScope(record: TestExecutionRecord): string {
  if (record.scope !== 'targeted') return 'Todos os testes';
  const count = record.targetFiles?.length ?? (record.targetFile ? 1 : 0);
  return count === 1 ? '1 arquivo' : `${count} arquivos`;
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
    history.value = null;
    result.value = null;
    intelligence.value = null;
    files.value = [];
    selectedFiles.value = [];
    errorMessage.value = '';
    selectedCommandId.value = '';
    overview.value = null;
    tab.value = 'output';
    void loadOverview();
    void loadStatusAndReconnect();
    void loadHistory();
  },
  { immediate: true },
);

watch(selectedCommandId, () => {
  void loadFiles();
  void loadIntelligence();
});
</script>

<template>
  <section class="tests-page">
    <header class="tests-toolbar">
      <label v-if="(overview?.commands.length ?? 0) > 1" class="tests-suite">
        <span class="visually-hidden">Suíte de testes</span>
        <select
          v-model="selectedCommandId"
          :disabled="loadingOverview || isRunning"
          aria-label="Comando de teste"
        >
          <option
            v-for="command in overview?.commands ?? []"
            :key="command.id"
            :value="command.id"
          >
            {{ command.label }}
          </option>
        </select>
      </label>
      <code v-else-if="selectedCommand" class="tests-suite-label">
        {{ selectedCommand.label }}
      </code>
      <span v-else-if="loadingOverview" class="tests-muted">Carregando…</span>

      <UiTag v-if="snapshot" :tone="executionStateTone">
        {{ executionStateLabel }}
      </UiTag>

      <span class="tests-spacer" />

      <UiButton
        v-if="canPickFiles && relatedFiles.length > 0"
        :disabled="isRunning || starting"
        title="Marca os testes relacionados aos arquivos alterados na branch"
        @click="selectRelated"
      >
        Selecionar relacionados ({{ relatedFiles.length }})
      </UiButton>
      <UiButton v-if="isRunning" :disabled="cancelling" @click="cancel">
        <StopIcon aria-hidden="true" />
        {{ cancelling ? 'Cancelando…' : 'Cancelar' }}
      </UiButton>
      <UiButton
        variant="primary"
        class="tests-run-button"
        :disabled="loadingOverview || !selectedCommand || isRunning || starting"
        :busy="starting"
        @click="start()"
      >
        <PlayIcon aria-hidden="true" />
        {{ runLabel }}
      </UiButton>
    </header>

    <div
      v-if="!loadingOverview && overview && !overview.supported"
      class="tests-note"
    >
      <span>Nenhuma suíte de testes foi detectada neste projeto.</span>
      <UiButton @click="loadOverview(true)">Detectar novamente</UiButton>
    </div>

    <p v-if="connecting" class="tests-banner">Conectando à execução…</p>
    <p v-if="errorMessage" class="tests-banner is-error" role="alert">
      {{ errorMessage }}
    </p>
    <div v-if="connectionLost && isRunning" class="tests-banner is-warning">
      <span>
        A execução continua ativa, mas a conexão com a saída foi interrompida.
      </span>
      <UiButton @click="reconnect">Reconectar</UiButton>
    </div>

    <div
      v-if="overview?.supported"
      class="tests-body"
      :class="{ 'has-files': canPickFiles }"
    >
      <TestFilePicker
        v-if="canPickFiles"
        v-model:selected="selectedFiles"
        :files="files"
        :failed-files="result?.failedFiles ?? []"
        :loading="loadingFiles"
        :error="filesErrorMessage"
        :disabled="isRunning || starting"
        @retry="loadFiles"
      />

      <section class="tests-results">
        <div class="tests-results-tabs" role="tablist">
          <button
            v-if="result"
            type="button"
            role="tab"
            :aria-selected="tab === 'results'"
            @click="tab = 'results'"
          >
            Resultados
            <span v-if="result.summary.failed > 0">{{
              result.summary.failed
            }}</span>
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="tab === 'output'"
            @click="tab = 'output'"
          >
            Saída
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="tab === 'history'"
            @click="tab = 'history'"
          >
            Histórico
            <span v-if="history?.total">{{ history.total }}</span>
          </button>
          <span class="tests-spacer" />
          <UiButton
            v-if="tab === 'history'"
            icon
            variant="ghost"
            aria-label="Atualizar histórico"
            :disabled="loadingHistory"
            @click="loadHistory"
          >
            <ArrowPathIcon
              :class="{ spinning: loadingHistory }"
              aria-hidden="true"
            />
          </UiButton>
          <UiButton
            v-if="tab === 'output' && snapshot && !isRunning"
            @click="closeTerminal"
          >
            Fechar saída
          </UiButton>
        </div>

        <TestResults
          v-if="tab === 'results' && result"
          :result="result"
          :disabled="isRunning || starting"
          @rerun-failed="rerunFailed"
        />

        <div v-show="tab === 'output'" class="tests-output">
          <div v-if="snapshot" class="tests-output-meta">
            <span>
              {{
                snapshot.scope === 'targeted'
                  ? `${snapshot.targetFiles.length} arquivo(s)`
                  : 'Todos os testes'
              }}
            </span>
            <small v-if="snapshot.truncated">saída anterior truncada</small>
          </div>
          <div
            v-if="snapshot"
            ref="terminalContainer"
            class="tests-pty-terminal"
            @contextmenu.capture="openTerminalContextMenu"
          ></div>
          <div v-else class="tests-empty">
            <strong>Nenhuma execução em andamento</strong>
            <p>
              {{
                canPickFiles
                  ? 'Marque os arquivos que quer testar ou execute todos.'
                  : 'Execute a suíte para ver a saída aqui.'
              }}
            </p>
          </div>
        </div>

        <div v-show="tab === 'history'" class="tests-history">
          <p v-if="historyErrorMessage" class="tests-banner is-error">
            {{ historyErrorMessage }}
          </p>
          <TestInsights :intelligence="intelligence" />
          <div
            v-if="durationBars.length > 1"
            class="tests-duration"
            aria-label="Duração das últimas execuções"
          >
            <span
              v-for="bar in durationBars"
              :key="bar.id"
              :data-tone="bar.tone"
              :style="{ height: `${bar.height}%` }"
              :title="bar.title"
            />
          </div>
          <ul v-if="history?.items.length">
            <li v-for="record in history.items" :key="record.id">
              <UiTag :tone="historyStatus(record).tone">
                {{ historyStatus(record).label }}
              </UiTag>
              <strong>{{ historyScope(record) }}</strong>
              <code>{{ record.commandId }}</code>
              <small>
                {{ formatDateTime(record.startedAt) }} ·
                {{ formatDuration(record) }}
              </small>
              <UiButton
                size="sm"
                class="tests-rerun"
                :disabled="isRunning || starting || !canRerun(record)"
                @click="rerunRecord(record)"
              >
                Rodar de novo
              </UiButton>
            </li>
          </ul>
          <p
            v-if="!history?.items.length && !loadingHistory"
            class="tests-muted"
          >
            Nenhuma execução registrada.
          </p>
        </div>

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
    </div>
  </section>
</template>

<style scoped>
.tests-page {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 12px;
}

.tests-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.tests-suite select {
  height: 34px;
  max-width: 320px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: 9px;
  color: var(--text);
  background: var(--surface-0);
  font: inherit;
  font-size: 13px;
}

.tests-suite-label {
  color: var(--text);
  font-family: var(--font-family-mono);
  font-size: 13px;
  font-weight: 600;
}

.tests-muted {
  color: var(--text-dim);
  font-size: 13px;
}

.tests-spacer {
  flex: 1 1 0;
}

.tests-note,
.tests-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  background: var(--surface-1);
  font-size: 13px;
}

.tests-note {
  justify-content: space-between;
  padding: 24px;
}

.tests-banner.is-error {
  border-color: transparent;
  color: var(--danger-text, #f85149);
  background: color-mix(in srgb, var(--danger-text, #f85149) 12%, transparent);
}

.tests-banner.is-warning {
  justify-content: space-between;
  border-color: transparent;
  color: var(--warning-text);
  background: color-mix(in srgb, var(--warning-text) 12%, transparent);
}

.tests-body {
  display: grid;
  min-height: 0;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.tests-body.has-files {
  grid-template-columns: 340px minmax(0, 1fr);
  align-items: start;
}

@media (max-width: 960px) {
  .tests-body.has-files {
    grid-template-columns: minmax(0, 1fr);
  }
}

.tests-results {
  display: flex;
  min-width: 0;
  min-height: 480px;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.tests-results-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
}

.tests-results-tabs button[role='tab'] {
  display: inline-flex;
  height: 30px;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  color: var(--text-muted);
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.tests-results-tabs button[aria-selected='true'] {
  color: var(--accent);
  background: var(--accent-soft);
}

.tests-results-tabs button span {
  color: var(--text-dim);
  font-size: 11.5px;
}

.tests-output {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  background: #10131c;
}

.tests-output-meta {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 8px 18px 0;
  color: #9aa3bd;
  font-size: 12px;
}

.tests-pty-terminal {
  flex: 1 1 0;
  min-width: 0;
  min-height: 420px;
  box-sizing: border-box;
  width: 100%;
  overflow: hidden;
  padding: 10px 18px 18px;
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

.tests-empty {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 40px 24px;
  color: #9aa3bd;
  text-align: center;
}

.tests-empty strong {
  color: #dbe0f2;
}

.tests-empty p {
  margin: 0;
  font-size: 13px;
}

.tests-history {
  min-height: 0;
  flex: 1 1 auto;
  padding: 6px 0;
}

.tests-history ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.tests-history li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
}

.tests-history li:first-child {
  border-top: 0;
}

.tests-history li code {
  color: var(--text-dim);
  font-family: var(--font-family-mono);
  font-size: 12px;
}

.tests-history li small {
  margin-left: auto;
  color: var(--text-dim);
}

.tests-duration {
  display: flex;
  height: 56px;
  align-items: flex-end;
  gap: 4px;
  padding: 10px 16px 0;
}

.tests-duration span {
  width: 14px;
  min-height: 4px;
  border-radius: 3px 3px 0 0;
  background: var(--border-strong);
}

.tests-duration span[data-tone='success'] {
  background: var(--success-text);
}

.tests-duration span[data-tone='danger'] {
  background: var(--danger-text, #f85149);
}

.tests-duration span[data-tone='accent'] {
  background: var(--accent);
}

.tests-history .tests-muted {
  padding: 20px 16px;
}

.spinning {
  animation: tests-spin 1s linear infinite;
}

@keyframes tests-spin {
  to {
    transform: rotate(360deg);
  }
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
  background: #252c43;
}

.tests-terminal-context-menu-button kbd {
  color: #8b93b0;
  font-family: var(--font-family-mono);
  font-size: 11px;
}
</style>
