<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

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
import { RequestGeneration } from '../utils/request-generation';
import Card from './Card.vue';
import ProjectTestIntelligenceSummary from './ProjectTestIntelligenceSummary.vue';

type TestsTab = 'execute' | 'history';
type ExecutionTone = 'neutral' | 'running' | 'success' | 'danger';

const props = defineProps<{ project: Project }>();

const overview = ref<ProjectTestOverview | null>(null);
const loadingOverview = ref(false);
const selectedCommandId = ref('');
const snapshot = ref<ProjectTestPtyStatusSnapshot | null>(null);
const starting = ref(false);
const cancelling = ref(false);
const errorMessage = ref('');
const intelligence = ref<TestIntelligenceSuggestion | null>(null);
const loadingIntelligence = ref(false);
const intelligenceErrorMessage = ref('');
const history = ref<TestExecutionHistory | null>(null);
const loadingHistory = ref(false);
const historyErrorMessage = ref('');
const activeTab = ref<TestsTab>('execute');
const intelligenceRequests = new RequestGeneration();

const { terminalContainer, connecting, connect, disconnect, disposeTerminal } =
  usePtyTerminalSocket<ProjectTestPtyStatusSnapshot & { buffer: string }>({
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
      void loadHistory();
    },
    onError: (message) => {
      errorMessage.value = message;
    },
  });

const isRunning = computed(() => snapshot.value?.status === 'running');
const selectedCommand = computed(() =>
  overview.value?.commands.find(
    (command) => command.id === selectedCommandId.value,
  ),
);
const latestRecord = computed(() => history.value?.items[0] ?? null);

const latestExecution = computed<{
  label: string;
  detail: string;
  tone: ExecutionTone;
}>(() => {
  if (isRunning.value) {
    return {
      label: 'Em execução',
      detail: snapshot.value?.startedAt
        ? `Iniciada ${formatDateTime(snapshot.value.startedAt)}`
        : 'Execução em andamento',
      tone: 'running',
    };
  }

  if (snapshot.value?.status === 'exited') {
    const succeeded = snapshot.value.exitCode === 0;
    return {
      label: succeeded ? 'Sucesso' : 'Falhou',
      detail: snapshot.value.startedAt
        ? `Executada ${formatDateTime(snapshot.value.startedAt)}`
        : 'Execução finalizada',
      tone: succeeded ? 'success' : 'danger',
    };
  }

  if (latestRecord.value) {
    return {
      label: recordStatusLabel(latestRecord.value),
      detail: `Executada ${formatDateTime(latestRecord.value.startedAt)}`,
      tone: recordTone(latestRecord.value),
    };
  }

  return {
    label: 'Sem execução',
    detail: 'Nenhuma execução registrada',
    tone: 'neutral',
  };
});

const latestDuration = computed(() => {
  const current = snapshot.value;
  if (current?.endedAt) {
    return formatDuration(current.startedAt, current.endedAt);
  }
  const record = latestRecord.value;
  if (record?.finishedAt) {
    return formatDuration(record.startedAt, record.finishedAt);
  }
  return '—';
});

const coverageDeltaLabel = computed(() => {
  const coverage = intelligence.value?.coverageDelta;
  const lines =
    coverage?.state === 'available' ? coverage.total?.lines : undefined;
  if (lines === undefined) return '—';
  return `${lines > 0 ? '+' : ''}${lines} pp`;
});

const coverageDeltaDetail = computed(() => {
  const coverage = intelligence.value?.coverageDelta;
  if (!coverage || coverage.state === 'unknown') {
    return 'Sem baseline comparável';
  }
  return 'Em relação ao baseline';
});

function commandLabel(commandId: string): string {
  return (
    overview.value?.commands.find((command) => command.id === commandId)
      ?.label ?? commandId
  );
}

function recordStatusLabel(record: TestExecutionRecord): string {
  if (record.status === 'starting') return 'Iniciando';
  if (record.status === 'running') return 'Em execução';
  if (record.status === 'stopping') return 'Encerrando';
  if (record.status === 'failed') return 'Falhou';
  if (record.exitCode === 0) return 'Sucesso';
  if (record.exitCode !== undefined) return 'Falhou';
  return 'Encerrado';
}

function recordTone(record: TestExecutionRecord): ExecutionTone {
  if (record.status === 'starting' || record.status === 'running') {
    return 'running';
  }
  if (record.status === 'failed' || (record.exitCode ?? 0) !== 0) {
    return 'danger';
  }
  if (record.status === 'stopped' && record.exitCode === 0) {
    return 'success';
  }
  return 'neutral';
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

function formatDuration(startedAt: string, finishedAt: string): string {
  const started = new Date(startedAt).getTime();
  const finished = new Date(finishedAt).getTime();
  if (
    !Number.isFinite(started) ||
    !Number.isFinite(finished) ||
    finished < started
  ) {
    return '—';
  }

  const seconds = Math.max(0, Math.round((finished - started) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return remainingSeconds > 0
    ? `${minutes}m ${remainingSeconds}s`
    : `${minutes}m`;
}

function historyDuration(record: TestExecutionRecord): string {
  if (!record.finishedAt) return '—';
  return formatDuration(record.startedAt, record.finishedAt);
}

function shortRevision(record: TestExecutionRecord): string {
  return record.gitRevision ? record.gitRevision.slice(0, 8) : 'sem revisão';
}

function executionScope(record: TestExecutionRecord): string {
  if (record.scope === 'targeted') return 'Direcionado';
  if (record.scope === 'full-suite') return 'Suíte completa';
  return 'Escopo não informado';
}

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

async function loadHistory(): Promise<void> {
  const projectId = props.project.id;
  loadingHistory.value = true;
  historyErrorMessage.value = '';
  try {
    const result = await fetchProjectTestHistory(projectId, 1, 8);
    if (props.project.id === projectId) history.value = result;
  } catch (error) {
    if (props.project.id === projectId) {
      historyErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o histórico de testes.';
    }
  } finally {
    if (props.project.id === projectId) loadingHistory.value = false;
  }
}

async function loadIntelligence(): Promise<void> {
  const projectId = props.project.id;
  const commandId = selectedCommandId.value;
  intelligenceRequests.invalidate();
  intelligence.value = null;
  intelligenceErrorMessage.value = '';

  if (!commandId) {
    loadingIntelligence.value = false;
    return;
  }

  const generation = intelligenceRequests.capture();
  loadingIntelligence.value = true;
  try {
    const suggestion = await fetchProjectTestIntelligence(projectId, commandId);
    if (
      props.project.id === projectId &&
      selectedCommandId.value === commandId &&
      intelligenceRequests.isCurrent(generation)
    ) {
      intelligence.value = suggestion;
    }
  } catch (error) {
    if (
      props.project.id === projectId &&
      selectedCommandId.value === commandId &&
      intelligenceRequests.isCurrent(generation)
    ) {
      intelligenceErrorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível calcular a recomendação de testes.';
    }
  } finally {
    if (
      props.project.id === projectId &&
      selectedCommandId.value === commandId &&
      intelligenceRequests.isCurrent(generation)
    ) {
      loadingIntelligence.value = false;
    }
  }
}

async function loadStatusAndReconnect(): Promise<void> {
  try {
    snapshot.value = await fetchProjectTestPtyStatus(props.project.id);
    if (snapshot.value) connect(projectTestPtyWebSocketUrl(props.project.id));
  } catch {
    // Best-effort: se a consulta inicial falhar, executar testes continua disponível.
  }
}

async function start(): Promise<void> {
  if (!selectedCommandId.value || isRunning.value || starting.value) return;
  activeTab.value = 'execute';
  errorMessage.value = '';
  starting.value = true;
  disposeTerminal();
  try {
    snapshot.value = await startProjectTestPty(
      props.project.id,
      selectedCommandId.value,
    );
    connect(projectTestPtyWebSocketUrl(props.project.id));
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

function closeTerminal(): void {
  disconnect();
  disposeTerminal();
  snapshot.value = null;
  errorMessage.value = '';
}

function selectTab(tab: TestsTab): void {
  activeTab.value = tab;
  if (tab === 'history') void loadHistory();
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
    history.value = null;
    historyErrorMessage.value = '';
    activeTab.value = 'execute';
    void loadOverview();
    void loadStatusAndReconnect();
    void loadHistory();
  },
  { immediate: true },
);

watch(
  [() => props.project.id, selectedCommandId],
  () => {
    void loadIntelligence();
  },
  { immediate: true },
);

onBeforeUnmount(() => intelligenceRequests.invalidate());
</script>

<template>
  <Card padded class="project-detail-card tests-pty-panel">
    <template #header>
      <div class="tests-pty-header">
        <div class="tests-pty-heading">
          <span class="tests-pty-eyebrow">Testes</span>
          <strong>Testes do projeto</strong>
          <small>Execute, acompanhe e consulte as últimas execuções.</small>
        </div>
        <span
          class="tests-pty-state"
          :class="{
            'tests-pty-state-running': isRunning,
            'tests-pty-state-success': !isRunning && snapshot?.exitCode === 0,
            'tests-pty-state-danger':
              Boolean(snapshot) &&
              !isRunning &&
              snapshot?.exitCode !== null &&
              snapshot?.exitCode !== 0,
          }"
        >
          {{ isRunning ? 'Em execução' : snapshot ? 'Finalizado' : 'Pronto' }}
        </span>
      </div>
    </template>

    <section class="tests-overview" aria-label="Resumo dos testes">
      <article class="tests-overview-card">
        <span>Última execução</span>
        <strong :class="`is-${latestExecution.tone}`">
          {{ latestExecution.label }}
        </strong>
        <small>{{ latestExecution.detail }}</small>
      </article>
      <article class="tests-overview-card">
        <span>Histórico</span>
        <strong>{{ loadingHistory && !history ? '…' : (history?.total ?? 0) }}</strong>
        <small>execuções registradas</small>
      </article>
      <article class="tests-overview-card">
        <span>Tempo da última</span>
        <strong>{{ latestDuration }}</strong>
        <small>{{ isRunning ? 'Execução em andamento' : 'Duração registrada' }}</small>
      </article>
      <article class="tests-overview-card">
        <span>Variação de cobertura</span>
        <strong>{{ coverageDeltaLabel }}</strong>
        <small>{{ coverageDeltaDetail }}</small>
      </article>
    </section>

    <div class="tests-tabs" role="tablist" aria-label="Áreas de testes">
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'execute'"
        :class="{ 'is-active': activeTab === 'execute' }"
        @click="selectTab('execute')"
      >
        Executar testes
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="activeTab === 'history'"
        :class="{ 'is-active': activeTab === 'history' }"
        @click="selectTab('history')"
      >
        Histórico
      </button>
    </div>

    <section v-show="activeTab === 'execute'" class="tests-execution-pane">
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
          <small>
            {{ selectedCommand?.description ?? 'Selecione um comando disponível.' }}
          </small>
        </label>

        <div class="tests-control-field">
          <span>Ambiente</span>
          <div class="tests-local-environment">Local</div>
          <small>Executa no diretório do projeto.</small>
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
      </div>

      <ProjectTestIntelligenceSummary
        :suggestion="intelligence"
        :loading="loadingIntelligence"
        :error-message="intelligenceErrorMessage"
      />

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
        <div ref="terminalContainer" class="tests-pty-terminal"></div>
      </section>

      <div v-else class="tests-local-note">
        <strong>Os testes são executados localmente no projeto.</strong>
        <span>
          O dashboard utiliza o comando configurado acima e mantém a saída em
          tempo real.
        </span>
      </div>
    </section>

    <section
      v-show="activeTab === 'history'"
      class="tests-history-pane"
      aria-label="Histórico de testes"
    >
      <div class="tests-history-heading">
        <div>
          <strong>Últimas execuções</strong>
          <small>Registros reais das execuções de teste deste projeto.</small>
        </div>
        <button
          type="button"
          class="secondary-button"
          :disabled="loadingHistory"
          @click="loadHistory"
        >
          {{ loadingHistory ? 'Atualizando…' : 'Atualizar' }}
        </button>
      </div>

      <p v-if="historyErrorMessage" class="tests-pty-error" role="alert">
        {{ historyErrorMessage }}
      </p>

      <div v-if="history?.items.length" class="tests-history-list">
        <article
          v-for="record in history.items"
          :key="record.id"
          class="tests-history-row"
        >
          <span class="tests-history-status" :class="`is-${recordTone(record)}`">
            {{ recordStatusLabel(record) }}
          </span>
          <div class="tests-history-main">
            <strong>{{ commandLabel(record.commandId) }}</strong>
            <small>
              {{ executionScope(record) }} · {{ shortRevision(record) }} ·
              {{ formatDateTime(record.startedAt) }}
            </small>
          </div>
          <div class="tests-history-metric">
            <span>Duração</span>
            <strong>{{ historyDuration(record) }}</strong>
          </div>
          <div class="tests-history-metric">
            <span>Saída</span>
            <strong>{{ record.exitCode === undefined ? '—' : `exit ${record.exitCode}` }}</strong>
          </div>
        </article>
      </div>

      <div v-else-if="!loadingHistory" class="tests-history-empty">
        <strong>Nenhuma execução registrada.</strong>
        <span>Execute uma suíte para começar a construir o histórico.</span>
      </div>
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

.tests-pty-header,
.tests-history-heading,
.tests-output-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.tests-pty-header {
  padding: 14px 16px;
}

.tests-pty-heading,
.tests-history-heading > div,
.tests-output-heading > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.tests-pty-eyebrow {
  color: var(--accent);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tests-pty-heading strong,
.tests-history-heading strong {
  color: var(--text);
  font-size: 14px;
}

.tests-pty-heading small,
.tests-history-heading small,
.tests-output-heading small {
  color: var(--text-muted);
  font-size: 11px;
}

.tests-pty-state,
.tests-history-status {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  justify-content: center;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
}

.tests-pty-state-running,
.tests-history-status.is-running {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.tests-pty-state-success,
.tests-history-status.is-success {
  border-color: var(--success-text);
  color: var(--success-text);
  background: var(--success-surface);
}

.tests-pty-state-danger,
.tests-history-status.is-danger {
  border-color: var(--danger-text);
  color: var(--danger-text);
  background: var(--danger-surface);
}

.tests-overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0 16px var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.tests-overview-card {
  display: grid;
  min-width: 0;
  gap: 4px;
  padding: 14px 16px;
  background: var(--surface-2);
  border-right: 1px solid var(--border);
}

.tests-overview-card:last-child {
  border-right: 0;
}

.tests-overview-card span,
.tests-history-metric span {
  color: var(--text-muted);
  font-size: 10px;
}

.tests-overview-card strong {
  color: var(--text);
  font-size: 17px;
}

.tests-overview-card strong.is-success {
  color: var(--success-text);
}

.tests-overview-card strong.is-danger {
  color: var(--danger-text);
}

.tests-overview-card strong.is-running {
  color: var(--accent);
}

.tests-overview-card small {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tests-tabs {
  display: flex;
  padding: 0 16px;
  border-bottom: 1px solid var(--border);
}

.tests-tabs button {
  min-height: 40px;
  padding: 0 14px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.tests-tabs button.is-active {
  border-bottom-color: var(--accent);
  color: var(--accent);
}

.tests-execution-pane,
.tests-history-pane {
  min-height: 0;
  overflow: auto;
}

.tests-execution-pane {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
}

.tests-execution-controls {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) minmax(180px, 0.45fr) auto;
  align-items: end;
  gap: var(--space-4);
  padding: 14px 16px;
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

.tests-control-field small {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tests-execution-actions {
  display: flex;
  gap: var(--space-2);
  padding-bottom: 17px;
}

.tests-execution-actions button,
.tests-history-heading button,
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
  padding: 10px 16px;
  background: var(--surface-2);
}

.tests-output-heading span {
  color: var(--text);
  font-size: 11px;
  font-weight: 700;
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

.tests-local-note {
  display: grid;
  gap: 3px;
  margin: auto 16px 16px;
  padding: 12px 14px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
}

.tests-local-note strong {
  color: var(--text);
  font-size: 11px;
}

.tests-local-note span {
  color: var(--text-muted);
  font-size: 10px;
}

.tests-history-pane {
  flex: 1 1 auto;
  padding: 14px 16px 16px;
}

.tests-history-heading {
  margin-bottom: var(--space-3);
}

.tests-history-list {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.tests-history-row {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr) 100px 90px;
  align-items: center;
  gap: var(--space-3);
  min-height: 62px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
}

.tests-history-row:last-child {
  border-bottom: 0;
}

.tests-history-main,
.tests-history-metric {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.tests-history-main strong,
.tests-history-metric strong {
  overflow: hidden;
  color: var(--text);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tests-history-main small {
  overflow: hidden;
  color: var(--text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tests-history-empty {
  display: grid;
  place-items: center;
  gap: 5px;
  min-height: 180px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  text-align: center;
}

.tests-history-empty strong {
  color: var(--text);
  font-size: 12px;
}

.tests-history-empty span {
  font-size: 11px;
}

@media (max-width: 980px) {
  .tests-overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tests-overview-card:nth-child(2) {
    border-right: 0;
  }

  .tests-overview-card:nth-child(-n + 2) {
    border-bottom: 1px solid var(--border);
  }

  .tests-execution-controls {
    grid-template-columns: minmax(0, 1fr) minmax(180px, 0.55fr);
  }

  .tests-execution-actions {
    grid-column: 1 / -1;
    padding-bottom: 0;
  }
}

@media (max-width: 700px) {
  .tests-overview {
    grid-template-columns: 1fr;
  }

  .tests-overview-card,
  .tests-overview-card:nth-child(2) {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .tests-overview-card:last-child {
    border-bottom: 0;
  }

  .tests-execution-controls {
    grid-template-columns: 1fr;
  }

  .tests-execution-actions {
    grid-column: auto;
    flex-wrap: wrap;
  }

  .tests-history-row {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .tests-history-metric {
    display: none;
  }
}
</style>
