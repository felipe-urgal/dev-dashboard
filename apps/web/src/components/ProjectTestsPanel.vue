<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';
import {
  ArrowDownIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  PlayIcon,
  StopIcon,
  TrashIcon,
  XCircleIcon,
} from '@heroicons/vue/24/outline';
import type {
  ManagedProcess,
  Project,
  ProjectTestCommand,
  ProjectTestFile,
  ProjectTestOverview,
  ProjectTestRunner,
  TestExecutionRecord,
} from '@dev-dashboard/contracts';

import {
  clearProjectTestHistory,
  clearProjectTestLog,
  fetchProjectTestFiles,
  fetchProjectTestHistory,
  fetchProjectTestLog,
  fetchProjectTestProcess,
  fetchProjectTests,
  followTestExecutionEvents,
  startProjectTest,
  startProjectTestFile,
  stopProjectTest,
} from '../api';
import { useAutoDismiss } from '../composables/useAutoDismiss';
import { noticeCenterStore } from '../stores/notice-center';
import Card from './Card.vue';

const props = defineProps<{ project: Project }>();

type LogTab = 'log' | 'errors' | 'warnings' | 'details';
type LogLineTone = 'default' | 'success' | 'error' | 'warning' | 'muted';
type StatusTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

interface ExecutionTarget {
  commandId: string;
  targetFile?: string;
}

interface LogLine {
  number: number;
  text: string;
  tone: LogLineTone;
}

interface TestRunSummary {
  targetFile: string;
  passed?: number;
  failed?: number;
  duration: string;
  runner: string;
  runnerVersion?: string;
}

const overview = ref<ProjectTestOverview | null>(null);
const managedProcess = ref<ManagedProcess | null>(null);
const logContent = ref('');
const logTruncated = ref(false);
const loadingOverview = ref(false);
const startingCommandId = ref<string | null>(null);
const stopping = ref(false);
const errorMessage = ref('');
const copyMessage = ref('');
const activeLogTab = ref<LogTab>('log');
const logViewport = ref<HTMLElement | null>(null);

const openFilePickerCommandId = ref<string | null>(null);
const loadingFilesCommandId = ref<string | null>(null);
const testFiles = ref<ProjectTestFile[]>([]);
const selectedFilePath = ref('');
const fileErrorMessage = ref('');

const historyItems = ref<TestExecutionRecord[]>([]);
const historyPage = ref(1);
const historyTotalPages = ref(0);
const loadingHistory = ref(false);
const historyErrorMessage = ref('');
const clearingHistory = ref(false);
const HISTORY_PAGE_SIZE = 10;

useAutoDismiss(errorMessage, '');
useAutoDismiss(fileErrorMessage, '');
useAutoDismiss(historyErrorMessage, '');
useAutoDismiss(copyMessage, '');

let hasObservedRunning = false;
let lastStartedCommandId: string | null = null;
let generation = 0;
let closeExecutionEvents: (() => void) | null = null;
const realtimeRecoveryMessage = 'A conexão em tempo real foi interrompida. Recuperando o estado atual…';

const runnerLabels: Record<ProjectTestRunner, string> = {
  vitest: 'Vitest',
  jest: 'Jest',
  'node-test': 'Node Test Runner',
  rspec: 'RSpec',
  'rails-test': 'Rails Test',
  minitest: 'Minitest',
  pytest: 'pytest',
};

const status = computed(() => managedProcess.value?.status ?? 'idle');

const statusLabel = computed(() => {
  const value = managedProcess.value;
  if (!value) return 'Ocioso';
  switch (value.status) {
    case 'starting':
      return 'Iniciando';
    case 'running':
      return 'Executando';
    case 'stopping':
      return 'Interrompendo';
    case 'stopped':
      return value.exitCode === 0 ? 'Concluído com sucesso' : 'Encerrado';
    case 'failed':
      return value.exitCode !== undefined ? `Falhou (código ${value.exitCode})` : 'Falhou';
    default:
      return value.status;
  }
});

const currentStatusTone = computed<StatusTone>(() => {
  const value = managedProcess.value;
  if (!value) return 'neutral';
  if (value.status === 'starting' || value.status === 'running') return 'info';
  if (value.status === 'stopping') return 'warning';
  if (value.status === 'failed') return 'danger';
  if (value.status === 'stopped' && value.exitCode === 0) return 'success';
  if (value.status === 'stopped' && value.exitCode !== undefined) return 'danger';
  return 'neutral';
});

const duration = computed(() => formatDurationBetween(
  managedProcess.value?.startedAt,
  managedProcess.value?.stoppedAt,
));

const isRunning = computed(
  () =>
    status.value === 'starting' ||
    status.value === 'running' ||
    status.value === 'stopping',
);

const currentTarget = computed<ExecutionTarget | null>(() => {
  const process = managedProcess.value;
  if (!process) return null;

  const prefix = `${process.projectId}:${process.kind}:`;
  const rawId = process.id.startsWith(prefix)
    ? process.id.slice(prefix.length)
    : process.id;
  const fileExecution = rawId.endsWith(':file');
  const commandId = fileExecution ? rawId.slice(0, -':file'.length) : rawId;
  const targetFile = fileExecution ? process.args?.at(-1) : undefined;

  return {
    commandId,
    ...(targetFile ? { targetFile } : {}),
  };
});

const currentCommand = computed<ProjectTestCommand | undefined>(() => {
  const commandId = currentTarget.value?.commandId;
  return overview.value?.commands.find((command) => command.id === commandId);
});

const currentCommandText = computed(() => {
  const process = managedProcess.value;
  if (!process) return '—';
  return [process.command, ...(process.args ?? [])].filter(Boolean).join(' ');
});

const cleanLogContent = computed(() => stripAnsi(logContent.value));

const logLines = computed<LogLine[]>(() => {
  const lines = cleanLogContent.value.replace(/\r/g, '').split('\n');
  while (lines.length > 0 && lines.at(-1) === '') lines.pop();
  return lines.map((text, index) => ({
    number: index + 1,
    text,
    tone: logLineTone(text),
  }));
});

const errorLogLines = computed(() => logLines.value.filter((line) => isErrorLine(line.text)));
const warningLogLines = computed(() => logLines.value.filter((line) => isWarningLine(line.text)));
const detailLogLines = computed(() => logLines.value.filter((line) => isDetailLine(line.text)));

const visibleLogLines = computed(() => {
  switch (activeLogTab.value) {
    case 'errors':
      return errorLogLines.value;
    case 'warnings':
      return warningLogLines.value;
    case 'details':
      return detailLogLines.value;
    default:
      return logLines.value;
  }
});

const activeLogEmptyLabel = computed(() => {
  if (activeLogTab.value === 'errors') return 'Nenhuma linha de erro identificada.';
  if (activeLogTab.value === 'warnings') return 'Nenhum aviso identificado.';
  if (activeLogTab.value === 'details') return 'Nenhum detalhe estruturado identificado.';
  return 'Sem saída registrada ainda.';
});

const runSummary = computed<TestRunSummary>(() => {
  const text = cleanLogContent.value;
  const vitestPassed = matchNumber(text, /\bTests\s+(\d+)\s+passed\b/i)
    ?? matchNumber(text, /\b(\d+)\s+tests?\s+passed\b/i);
  const vitestFailed = matchNumber(text, /\bTests\s+(?:\d+\s+passed\s*\|\s*)?(\d+)\s+failed\b/i)
    ?? matchNumber(text, /\b(\d+)\s+tests?\s+failed\b/i);
  const rspec = /\b(\d+)\s+examples?,\s*(\d+)\s+failures?/i.exec(text);
  const rails = /\b(\d+)\s+runs?,\s*(\d+)\s+assertions?,\s*(\d+)\s+failures?,\s*(\d+)\s+errors?/i.exec(text);

  let passed = vitestPassed;
  let failed = vitestFailed;
  if (rspec) {
    const examples = Number(rspec[1]);
    failed = Number(rspec[2]);
    passed = Math.max(0, examples - failed);
  } else if (rails) {
    const runs = Number(rails[1]);
    const failures = Number(rails[3]);
    const errors = Number(rails[4]);
    failed = failures + errors;
    passed = Math.max(0, runs - failed);
  }

  const targetFromOutput = extractTargetFile(text);
  const targetFile = currentTarget.value?.targetFile ?? targetFromOutput ?? 'Suíte completa';
  const testDuration = /\btests\s+([\d.]+(?:ms|s))\b/i.exec(text)?.[1]
    ?? /\bFinished in\s+([^\n]+)/i.exec(text)?.[1]?.trim()
    ?? /\bDone in\s+([\d.]+s)\b/i.exec(text)?.[1]
    ?? duration.value;
  const version = /\b(?:Vitest|Jest|RSpec|pytest)\s+v?([\d.]+)/i.exec(text)?.[1]
    ?? /\bv(\d+\.\d+\.\d+)\b/.exec(text)?.[1];
  const runner = currentCommand.value
    ? runnerLabels[currentCommand.value.runner]
    : projectRunnerFallback();

  return {
    targetFile,
    ...(passed !== undefined ? { passed } : {}),
    ...(failed !== undefined ? { failed } : {}),
    duration: testDuration || '—',
    runner,
    ...(version ? { runnerVersion: `v${version}` } : {}),
  };
});

const latestHistoryByCommand = computed(() => {
  const latest = new Map<string, TestExecutionRecord>();
  for (const item of historyItems.value) {
    if (!latest.has(item.commandId)) latest.set(item.commandId, item);
  }
  return latest;
});

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

function matchNumber(value: string, pattern: RegExp): number | undefined {
  const match = pattern.exec(value);
  if (!match?.[1]) return undefined;
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : undefined;
}

function isErrorLine(value: string): boolean {
  if (/\b0\s+(?:failed|failures|errors)\b/i.test(value)) return false;
  return /\b(?:error|failed|failure|syntaxerror|exception|unexpected|undefined method|cannot|enoent)\b/i.test(value);
}

function isWarningLine(value: string): boolean {
  return /\b(?:warning|warn|deprecated|deprecation)\b/i.test(value);
}

function isDetailLine(value: string): boolean {
  return /\b(?:run|test files?|tests?|examples?|assertions?|start at|duration|finished in|done in|seed|environment|transform|setup|collect|prepare)\b/i.test(value);
}

function logLineTone(value: string): LogLineTone {
  if (isErrorLine(value)) return 'error';
  if (isWarningLine(value)) return 'warning';
  if (/\b(?:passed|success|done)\b/i.test(value) && !/\b0\s+passed\b/i.test(value)) return 'success';
  if (/^\s*(?:RUN|Test Files|Tests|Start at|Duration|Finished in)/i.test(value)) return 'muted';
  return 'default';
}

function extractTargetFile(value: string): string | undefined {
  const candidates = value.match(/[\w./@-]+(?:\.spec|\.test|_spec|_test)\.(?:[cm]?[jt]sx?|rb|py)/gi);
  return candidates?.at(-1);
}

function projectRunnerFallback(): string {
  if (props.project.type === 'rails') return 'Rails';
  if (props.project.type === 'node') return 'Node.js';
  return 'Testes';
}

function formatTimestamp(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(date);
}

function formatCompactTimestamp(value: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDurationBetween(startedAt?: string, finishedAt?: string): string {
  if (!startedAt) return '—';
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '—';

  const totalSeconds = Math.max(0, Math.round((end - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function historyStatusLabel(item: TestExecutionRecord): string {
  if (item.status === 'starting' || item.status === 'running') return 'Em andamento';
  if (item.status === 'stopping') return 'Interrompendo';
  if (item.status === 'failed') return 'Falha';
  if (item.exitCode === 0) return 'Sucesso';
  if (item.exitCode !== undefined) return 'Falha';
  return 'Interrompido';
}

function historyStatusTone(item: TestExecutionRecord): StatusTone {
  if (item.status === 'starting' || item.status === 'running') return 'info';
  if (item.status === 'stopping') return 'warning';
  if (item.status === 'failed') return 'danger';
  if (item.exitCode === 0) return 'success';
  if (item.exitCode !== undefined) return 'danger';
  return 'neutral';
}

function statusIconForTone(tone: StatusTone) {
  if (tone === 'success') return CheckCircleIcon;
  if (tone === 'danger') return XCircleIcon;
  if (tone === 'warning') return ExclamationTriangleIcon;
  if (tone === 'info') return ClockIcon;
  return InformationCircleIcon;
}

function commandLatestExecution(commandId: string): TestExecutionRecord | undefined {
  return latestHistoryByCommand.value.get(commandId);
}

function commandIsCurrent(commandId: string): boolean {
  return Boolean(managedProcess.value && currentTarget.value?.commandId === commandId);
}

function historyExecutionTarget(item: TestExecutionRecord): ExecutionTarget {
  return {
    commandId: item.commandId,
    ...(item.targetFile ? { targetFile: item.targetFile } : {}),
  };
}

function isCurrentProjectRequest(
  projectId: string,
  requestGeneration: number,
): boolean {
  return props.project.id === projectId && generation === requestGeneration;
}

async function loadOverview(refresh = false): Promise<void> {
  const projectId = props.project.id;
  const requestGeneration = generation;
  loadingOverview.value = true;
  errorMessage.value = '';
  try {
    const result = await fetchProjectTests(projectId, { refresh });
    if (isCurrentProjectRequest(projectId, requestGeneration)) overview.value = result;
  } catch (error) {
    if (isCurrentProjectRequest(projectId, requestGeneration)) {
      errorMessage.value = error instanceof Error
        ? error.message
        : 'Não foi possível carregar os comandos de teste.';
    }
  } finally {
    if (isCurrentProjectRequest(projectId, requestGeneration)) loadingOverview.value = false;
  }
}

async function refreshProcess(): Promise<boolean> {
  const projectId = props.project.id;
  const requestGeneration = generation;
  try {
    const result = await fetchProjectTestProcess(projectId);
    if (!isCurrentProjectRequest(projectId, requestGeneration)) return true;
    managedProcess.value = result;

    if (result) {
      const log = await fetchProjectTestLog(projectId).catch(() => null);
      if (!isCurrentProjectRequest(projectId, requestGeneration)) return true;
      if (log) {
        logContent.value = log.content;
        logTruncated.value = log.truncated;
      }
    } else {
      logContent.value = '';
      logTruncated.value = false;
    }
    if (errorMessage.value === realtimeRecoveryMessage) errorMessage.value = '';
    return true;
  } catch (error) {
    if (isCurrentProjectRequest(projectId, requestGeneration)) {
      errorMessage.value = error instanceof Error
        ? error.message
        : 'Não foi possível atualizar o processo de testes.';
    }
    return false;
  }
}

async function followProcess(): Promise<void> {
  const projectId = props.project.id;
  const requestGeneration = generation;
  closeExecutionEvents?.();
  closeExecutionEvents = null;
  let reconnectDelay = 500;

  while (isCurrentProjectRequest(projectId, requestGeneration)) {
    const succeeded = await refreshProcess();
    if (!isCurrentProjectRequest(projectId, requestGeneration)) return;
    if (!succeeded) {
      await new Promise((resolve) => setTimeout(resolve, reconnectDelay));
      reconnectDelay = Math.min(reconnectDelay * 2, 5_000);
      continue;
    }
    if (!isRunning.value) {
      void loadHistory(1);
      return;
    }

    const stream = followTestExecutionEvents(projectId, (event) => {
      if (!isCurrentProjectRequest(projectId, requestGeneration)) return;
      if (event.type === 'state') {
        managedProcess.value = event.process;
      } else {
        logContent.value = event.log.content;
        logTruncated.value = event.log.truncated;
      }
    });
    closeExecutionEvents = stream.close;
    try {
      await stream.done;
      reconnectDelay = 500;
    } catch {
      if (isCurrentProjectRequest(projectId, requestGeneration)) {
        errorMessage.value = realtimeRecoveryMessage;
      }
    }
    if (closeExecutionEvents === stream.close) closeExecutionEvents = null;
    if (!isCurrentProjectRequest(projectId, requestGeneration)) return;

    if (!isRunning.value) {
      await refreshProcess();
      void loadHistory(1);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, reconnectDelay));
    reconnectDelay = Math.min(reconnectDelay * 2, 5_000);
  }
}

async function startExecution(target: ExecutionTarget): Promise<void> {
  const projectId = props.project.id;
  const requestGeneration = generation;
  startingCommandId.value = target.commandId;
  lastStartedCommandId = target.commandId;
  errorMessage.value = '';
  fileErrorMessage.value = '';
  activeLogTab.value = 'log';

  try {
    const result = target.targetFile
      ? await startProjectTestFile(projectId, target.commandId, target.targetFile)
      : await startProjectTest(projectId, target.commandId);
    if (!isCurrentProjectRequest(projectId, requestGeneration)) return;
    managedProcess.value = result;
    logContent.value = '';
    logTruncated.value = false;
    openFilePickerCommandId.value = null;
    void followProcess();
  } catch (error) {
    if (isCurrentProjectRequest(projectId, requestGeneration)) {
      errorMessage.value = error instanceof Error
        ? error.message
        : 'Não foi possível iniciar os testes.';
    }
  } finally {
    if (isCurrentProjectRequest(projectId, requestGeneration)) startingCommandId.value = null;
  }
}

async function handleStart(commandId: string): Promise<void> {
  await startExecution({ commandId });
}

async function handleRepeat(target: ExecutionTarget): Promise<void> {
  if (isRunning.value || startingCommandId.value !== null) return;
  await startExecution(target);
}

async function toggleFilePicker(commandId: string): Promise<void> {
  if (openFilePickerCommandId.value === commandId) {
    openFilePickerCommandId.value = null;
    return;
  }
  const projectId = props.project.id;
  openFilePickerCommandId.value = commandId;
  selectedFilePath.value = '';
  fileErrorMessage.value = '';
  loadingFilesCommandId.value = commandId;
  testFiles.value = [];
  try {
    const files = await fetchProjectTestFiles(projectId, commandId);
    if (projectId !== props.project.id || openFilePickerCommandId.value !== commandId) return;
    testFiles.value = files;
  } catch (error) {
    if (projectId === props.project.id && openFilePickerCommandId.value === commandId) {
      fileErrorMessage.value = error instanceof Error
        ? error.message
        : 'Não foi possível listar os arquivos de teste.';
    }
  } finally {
    if (loadingFilesCommandId.value === commandId) loadingFilesCommandId.value = null;
  }
}

async function handleStartFile(commandId: string): Promise<void> {
  if (!selectedFilePath.value) return;
  await startExecution({ commandId, targetFile: selectedFilePath.value });
}

async function loadHistory(page = historyPage.value): Promise<void> {
  const projectId = props.project.id;
  const requestGeneration = generation;
  loadingHistory.value = true;
  historyErrorMessage.value = '';
  try {
    const result = await fetchProjectTestHistory(projectId, page, HISTORY_PAGE_SIZE);
    if (!isCurrentProjectRequest(projectId, requestGeneration)) return;
    historyItems.value = result.items;
    historyPage.value = result.page;
    historyTotalPages.value = result.totalPages;
  } catch (error) {
    if (isCurrentProjectRequest(projectId, requestGeneration)) {
      historyErrorMessage.value = error instanceof Error
        ? error.message
        : 'Não foi possível carregar o histórico de execuções.';
    }
  } finally {
    if (isCurrentProjectRequest(projectId, requestGeneration)) loadingHistory.value = false;
  }
}

async function handleClearHistory(): Promise<void> {
  if (clearingHistory.value || historyItems.value.length === 0) return;

  const confirmed =
    typeof window === 'undefined' ||
    window.confirm(
      'Remover o histórico de execuções deste projeto? Execuções em andamento serão preservadas.',
    );
  if (!confirmed) return;

  const projectId = props.project.id;
  const requestGeneration = generation;
  clearingHistory.value = true;
  historyErrorMessage.value = '';
  try {
    await clearProjectTestHistory(projectId);
    if (!isCurrentProjectRequest(projectId, requestGeneration)) return;
    await loadHistory(1);
  } catch (error) {
    if (isCurrentProjectRequest(projectId, requestGeneration)) {
      historyErrorMessage.value = error instanceof Error
        ? error.message
        : 'Não foi possível limpar o histórico de execuções.';
    }
  } finally {
    if (isCurrentProjectRequest(projectId, requestGeneration)) clearingHistory.value = false;
  }
}

async function handleStop(): Promise<void> {
  const projectId = props.project.id;
  const requestGeneration = generation;
  stopping.value = true;
  errorMessage.value = '';
  try {
    const result = await stopProjectTest(projectId);
    if (!isCurrentProjectRequest(projectId, requestGeneration)) return;
    managedProcess.value = result;
    await refreshProcess();
  } catch (error) {
    if (isCurrentProjectRequest(projectId, requestGeneration)) {
      errorMessage.value = error instanceof Error
        ? error.message
        : 'Não foi possível interromper os testes.';
    }
  } finally {
    if (isCurrentProjectRequest(projectId, requestGeneration)) stopping.value = false;
  }
}

async function handleClearLogs(): Promise<void> {
  const projectId = props.project.id;
  const requestGeneration = generation;
  errorMessage.value = '';
  try {
    const log = await clearProjectTestLog(projectId);
    if (!isCurrentProjectRequest(projectId, requestGeneration)) return;
    logContent.value = log.content;
    logTruncated.value = log.truncated;
    activeLogTab.value = 'log';
  } catch (error) {
    if (isCurrentProjectRequest(projectId, requestGeneration)) {
      errorMessage.value = error instanceof Error
        ? error.message
        : 'Não foi possível limpar o log.';
    }
  }
}

async function handleCopyLogs(): Promise<void> {
  if (!cleanLogContent.value) return;
  try {
    await navigator.clipboard.writeText(cleanLogContent.value);
    copyMessage.value = 'Log copiado.';
  } catch {
    copyMessage.value = 'Não foi possível copiar o log.';
  }
}

async function scrollLogToEnd(): Promise<void> {
  await nextTick();
  const viewport = logViewport.value;
  if (viewport) viewport.scrollTop = viewport.scrollHeight;
}

watch(managedProcess, (proc) => {
  if (!proc) return;
  if (proc.status === 'starting' || proc.status === 'running' || proc.status === 'stopping') {
    hasObservedRunning = true;
    return;
  }
  if (!hasObservedRunning) return;
  if (proc.status !== 'stopped' && proc.status !== 'failed') return;

  const effectiveCommandId = startingCommandId.value || lastStartedCommandId;
  const commandLabel = overview.value?.commands.find(
    (command) => command.id === effectiveCommandId,
  )?.label ?? 'Testes';

  noticeCenterStore.publishTerminalNotice({
    origin: 'test',
    dedupeKey: `test:${proc.id}:${proc.status}`,
    outcome: proc.status,
    projectId: props.project.id,
    projectName: props.project.name,
    label: commandLabel,
    routeTo: { name: 'project-tests', params: { projectId: props.project.id } },
  });
});

watch(
  () => props.project.id,
  () => {
    generation += 1;
    closeExecutionEvents?.();
    closeExecutionEvents = null;
    hasObservedRunning = false;
    lastStartedCommandId = null;
    overview.value = null;
    managedProcess.value = null;
    logContent.value = '';
    logTruncated.value = false;
    startingCommandId.value = null;
    stopping.value = false;
    errorMessage.value = '';
    copyMessage.value = '';
    activeLogTab.value = 'log';
    openFilePickerCommandId.value = null;
    loadingFilesCommandId.value = null;
    testFiles.value = [];
    selectedFilePath.value = '';
    fileErrorMessage.value = '';
    historyItems.value = [];
    historyPage.value = 1;
    historyTotalPages.value = 0;
    historyErrorMessage.value = '';
    void loadOverview();
    void followProcess();
    void loadHistory(1);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  closeExecutionEvents?.();
  closeExecutionEvents = null;
});
</script>

<template>
  <Card padded class="project-detail-card tests-dashboard">
    <template #header>
      <div class="project-panel-heading">
        <span class="section-kicker">Qualidade</span>
        <h3>Testes</h3>
        <p>
          Estado: <strong>{{ statusLabel }}</strong>
          <span v-if="duration !== '—'"> · {{ duration }}</span>
        </p>
      </div>
    </template>
    <template #actions>
      <button
        type="button"
        class="secondary-button tests-button-with-icon"
        :disabled="loadingOverview"
        @click="loadOverview(true)"
      >
        <ArrowPathIcon aria-hidden="true" />
        {{ loadingOverview ? 'Atualizando...' : 'Atualizar comandos' }}
      </button>
    </template>

    <div v-if="errorMessage" class="project-error" role="alert">
      {{ errorMessage }}
    </div>

    <div v-if="overview && !overview.supported" class="git-empty-state">
      <strong>Nenhum runner de testes reconhecido para este projeto.</strong>
      <p>
        Verificamos scripts do package.json, binários em node_modules,
        Gemfile e configurações de pytest. Nada foi identificado.
      </p>
    </div>

    <section v-else-if="overview" class="tests-commands" aria-labelledby="tests-commands-title">
      <div class="tests-section-heading">
        <div>
          <h4 id="tests-commands-title">Comandos detectados</h4>
          <p>{{ overview.commands.length }} {{ overview.commands.length === 1 ? 'runner disponível' : 'runners disponíveis' }}</p>
        </div>
      </div>

      <ul>
        <li
          v-for="command in overview.commands"
          :key="command.id"
          class="tests-command-item"
          :class="{ 'tests-command-item-current': commandIsCurrent(command.id) }"
        >
          <div class="tests-runner-mark" aria-hidden="true">
            {{ runnerLabels[command.runner].slice(0, 1) }}
          </div>
          <div class="tests-command-copy">
            <div class="tests-command-title">
              <strong>{{ runnerLabels[command.runner] }}</strong>
              <code>{{ command.label }}</code>
            </div>
            <p>{{ command.description }}</p>
            <small>
              Origem: {{ command.origin }}<span v-if="command.originDetail"> · {{ command.originDetail }}</span>
            </small>
          </div>

          <div v-if="commandLatestExecution(command.id)" class="tests-command-last-run">
            <span>Última execução</span>
            <strong :class="`tests-tone-${historyStatusTone(commandLatestExecution(command.id)!)}`">
              {{ historyStatusLabel(commandLatestExecution(command.id)!) }}
            </strong>
            <small>{{ formatCompactTimestamp(commandLatestExecution(command.id)!.startedAt) }}</small>
          </div>

          <div class="tests-command-actions">
            <button
              type="button"
              class="primary-button tests-button-with-icon"
              :disabled="isRunning || startingCommandId !== null"
              @click="handleStart(command.id)"
            >
              <PlayIcon aria-hidden="true" />
              {{ startingCommandId === command.id ? 'Iniciando...' : 'Executar' }}
            </button>
            <button
              v-if="command.supportsFileTarget"
              type="button"
              class="secondary-button"
              :disabled="isRunning || startingCommandId !== null"
              @click="toggleFilePicker(command.id)"
            >
              {{ openFilePickerCommandId === command.id ? 'Fechar' : 'Executar arquivo' }}
            </button>
          </div>

          <div
            v-if="command.supportsFileTarget && openFilePickerCommandId === command.id"
            class="tests-file-picker"
          >
            <p v-if="fileErrorMessage" class="project-error" role="alert">{{ fileErrorMessage }}</p>
            <p v-else-if="loadingFilesCommandId === command.id" class="tests-log-empty">Carregando arquivos…</p>
            <p v-else-if="testFiles.length === 0" class="tests-log-empty">Nenhum arquivo de teste encontrado.</p>
            <template v-else>
              <label>
                <span>Arquivo de teste</span>
                <select v-model="selectedFilePath">
                  <option value="" disabled>Selecione um arquivo</option>
                  <option v-for="file in testFiles" :key="file.path" :value="file.path">{{ file.path }}</option>
                </select>
              </label>
              <button
                type="button"
                class="primary-button tests-button-with-icon"
                :disabled="isRunning || startingCommandId !== null || !selectedFilePath"
                @click="handleStartFile(command.id)"
              >
                <PlayIcon aria-hidden="true" />
                {{ startingCommandId === command.id ? 'Iniciando...' : 'Executar arquivo selecionado' }}
              </button>
            </template>
          </div>
        </li>
      </ul>
    </section>

    <div class="tests-workspace">
      <section class="tests-run-panel" aria-labelledby="tests-current-title">
        <div class="tests-section-heading">
          <div>
            <h4 id="tests-current-title">Execução atual</h4>
            <p>Acompanhe o resultado e a saída do runner em tempo real.</p>
          </div>
        </div>

        <div v-if="managedProcess" class="tests-run-details">
          <div class="tests-run-status" :class="`tests-run-status-${currentStatusTone}`">
            <component :is="statusIconForTone(currentStatusTone)" aria-hidden="true" />
            <div>
              <span>{{ isRunning ? 'Estado atual' : 'Conclusão' }}</span>
              <strong>{{ statusLabel }}</strong>
              <code>{{ currentCommandText }}</code>
            </div>
            <div class="tests-run-status-actions">
              <button
                v-if="!isRunning && currentTarget"
                type="button"
                class="secondary-button tests-button-with-icon"
                :disabled="startingCommandId !== null"
                @click="handleRepeat(currentTarget)"
              >
                <ArrowPathIcon aria-hidden="true" />
                Repetir execução
              </button>
              <button
                v-if="isRunning"
                type="button"
                class="secondary-button tests-button-with-icon"
                :disabled="stopping"
                @click="handleStop"
              >
                <StopIcon aria-hidden="true" />
                {{ stopping ? 'Interrompendo...' : 'Interromper' }}
              </button>
            </div>
          </div>

          <dl class="tests-run-metadata">
            <div><dt>Início</dt><dd>{{ formatTimestamp(managedProcess.startedAt) }}</dd></div>
            <div><dt>Término</dt><dd>{{ formatTimestamp(managedProcess.stoppedAt) }}</dd></div>
            <div><dt>Duração</dt><dd>{{ duration }}</dd></div>
            <div><dt>Exit code</dt><dd>{{ managedProcess.exitCode ?? '—' }}</dd></div>
            <div class="tests-run-command"><dt>Comando</dt><dd><code>{{ currentCommandText }}</code></dd></div>
          </dl>

          <div class="tests-summary" aria-label="Resumo da execução">
            <div>
              <span>Arquivo alvo</span>
              <strong>{{ runSummary.targetFile }}</strong>
              <small>{{ currentTarget?.targetFile ? '1 arquivo' : 'Execução completa' }}</small>
            </div>
            <div>
              <span>Testes</span>
              <strong v-if="runSummary.passed !== undefined || runSummary.failed !== undefined">
                <b class="tests-summary-success">{{ runSummary.passed ?? 0 }} passaram</b>
                <b class="tests-summary-danger">{{ runSummary.failed ?? 0 }} falharam</b>
              </strong>
              <strong v-else>—</strong>
              <small>Extraído da saída do runner</small>
            </div>
            <div>
              <span>Duração dos testes</span>
              <strong>{{ runSummary.duration }}</strong>
              <small>Tempo informado pelo runner</small>
            </div>
            <div>
              <span>Ambiente</span>
              <strong>{{ runSummary.runner }}</strong>
              <small>{{ runSummary.runnerVersion ?? project.type }}</small>
            </div>
          </div>

          <div class="tests-log-shell">
            <div class="tests-log-header">
              <div class="tests-log-tabs" role="tablist" aria-label="Filtros do log">
                <button
                  type="button"
                  role="tab"
                  :aria-selected="activeLogTab === 'log'"
                  :class="{ active: activeLogTab === 'log' }"
                  @click="activeLogTab = 'log'"
                >
                  Log
                </button>
                <button
                  type="button"
                  role="tab"
                  :aria-selected="activeLogTab === 'errors'"
                  :class="{ active: activeLogTab === 'errors' }"
                  @click="activeLogTab = 'errors'"
                >
                  Erros ({{ errorLogLines.length }})
                </button>
                <button
                  type="button"
                  role="tab"
                  :aria-selected="activeLogTab === 'warnings'"
                  :class="{ active: activeLogTab === 'warnings' }"
                  @click="activeLogTab = 'warnings'"
                >
                  Avisos ({{ warningLogLines.length }})
                </button>
                <button
                  type="button"
                  role="tab"
                  :aria-selected="activeLogTab === 'details'"
                  :class="{ active: activeLogTab === 'details' }"
                  @click="activeLogTab = 'details'"
                >
                  Detalhes
                </button>
              </div>
              <div class="tests-log-actions">
                <span v-if="copyMessage" role="status">{{ copyMessage }}</span>
                <button
                  type="button"
                  class="secondary-button tests-button-with-icon"
                  :disabled="!cleanLogContent"
                  @click="handleCopyLogs"
                >
                  <ClipboardDocumentIcon aria-hidden="true" />
                  Copiar log
                </button>
                <button
                  type="button"
                  class="secondary-button tests-button-with-icon"
                  :disabled="isRunning"
                  @click="handleClearLogs"
                >
                  <TrashIcon aria-hidden="true" />
                  Limpar logs
                </button>
              </div>
            </div>

            <div ref="logViewport" class="tests-log-output" role="log" aria-live="polite">
              <div v-if="logTruncated" class="tests-log-truncated">
                O início do log foi truncado para manter a leitura responsiva.
              </div>
              <ol v-if="visibleLogLines.length" class="tests-log-lines">
                <li
                  v-for="line in visibleLogLines"
                  :key="`${activeLogTab}-${line.number}`"
                  :class="`tests-log-line-${line.tone}`"
                >
                  <span aria-hidden="true">{{ line.number }}</span>
                  <code>{{ line.text || ' ' }}</code>
                </li>
              </ol>
              <p v-else class="tests-log-empty">{{ activeLogEmptyLabel }}</p>
            </div>

            <div class="tests-log-footer">
              <span>Exibindo {{ visibleLogLines.length }} {{ visibleLogLines.length === 1 ? 'linha' : 'linhas' }}</span>
              <button
                type="button"
                class="tests-log-tail"
                :disabled="visibleLogLines.length === 0"
                @click="scrollLogToEnd"
              >
                Ir para o final
                <ArrowDownIcon aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <div v-else class="tests-run-empty">
          <DocumentTextIcon aria-hidden="true" />
          <strong>Nenhuma execução selecionada.</strong>
          <p>Execute um dos comandos detectados para acompanhar o resultado e os logs aqui.</p>
        </div>
      </section>

      <aside class="tests-history" aria-labelledby="tests-history-title">
        <div class="tests-history-heading">
          <div>
            <h4 id="tests-history-title">Histórico de execuções</h4>
            <p>Resultados recentes deste projeto.</p>
          </div>
          <div class="tests-history-heading-actions">
            <button
              type="button"
              class="secondary-button tests-icon-button"
              :disabled="clearingHistory || historyItems.length === 0"
              aria-label="Limpar histórico"
              title="Limpar histórico"
              @click="handleClearHistory"
            >
              <TrashIcon aria-hidden="true" />
            </button>
            <button
              type="button"
              class="secondary-button tests-icon-button"
              :disabled="loadingHistory"
              aria-label="Atualizar histórico"
              title="Atualizar histórico"
              @click="loadHistory()"
            >
              <ArrowPathIcon aria-hidden="true" />
            </button>
          </div>
        </div>

        <p v-if="historyErrorMessage" class="project-error" role="alert">{{ historyErrorMessage }}</p>
        <div v-else-if="historyItems.length === 0" class="tests-history-empty">
          <ClockIcon aria-hidden="true" />
          <p>Nenhuma execução registrada ainda.</p>
        </div>
        <ul v-else class="tests-history-list">
          <li v-for="item in historyItems" :key="item.id">
            <component
              :is="statusIconForTone(historyStatusTone(item))"
              class="tests-history-icon"
              :class="`tests-tone-${historyStatusTone(item)}`"
              aria-hidden="true"
            />
            <div class="tests-history-copy">
              <strong>
                {{ overview?.commands.find((command) => command.id === item.commandId)?.label ?? item.commandId }}
              </strong>
              <code v-if="item.targetFile">{{ item.targetFile }}</code>
              <div>
                <span>{{ formatCompactTimestamp(item.startedAt) }}</span>
                <span>{{ formatDurationBetween(item.startedAt, item.finishedAt) }}</span>
              </div>
            </div>
            <div class="tests-history-result">
              <strong :class="`tests-tone-${historyStatusTone(item)}`">{{ historyStatusLabel(item) }}</strong>
              <span>exit {{ item.exitCode ?? '—' }}</span>
            </div>
            <button
              type="button"
              class="tests-history-repeat"
              :disabled="isRunning || startingCommandId !== null"
              :aria-label="`Repetir ${item.targetFile ?? item.commandId}`"
              title="Repetir execução"
              @click="handleRepeat(historyExecutionTarget(item))"
            >
              <ArrowPathIcon aria-hidden="true" />
            </button>
          </li>
        </ul>

        <div v-if="historyTotalPages > 1" class="tests-history-pagination">
          <button
            type="button"
            class="secondary-button"
            :disabled="loadingHistory || historyPage <= 1"
            @click="loadHistory(historyPage - 1)"
          >
            Anterior
          </button>
          <span>Página {{ historyPage }} de {{ historyTotalPages }}</span>
          <button
            type="button"
            class="secondary-button"
            :disabled="loadingHistory || historyPage >= historyTotalPages"
            @click="loadHistory(historyPage + 1)"
          >
            Próxima
          </button>
        </div>

        <div class="tests-history-legend" aria-label="Legenda de estados">
          <span><i class="tests-legend-success"></i>Sucesso</span>
          <span><i class="tests-legend-danger"></i>Falha</span>
          <span><i class="tests-legend-neutral"></i>Interrompido</span>
          <span><i class="tests-legend-info"></i>Em andamento</span>
        </div>
      </aside>
    </div>
  </Card>
</template>

<style scoped src="../project-tests-redesign.css"></style>
