import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
  type Ref,
} from 'vue';
import type {
  ManagedProcess,
  Project,
  ProjectTestOverview,
} from '@dev-dashboard/contracts';

import {
  clearProjectTestLog,
  fetchProjectTestLog,
  fetchProjectTestProcess,
  followTestExecutionEvents,
  startProjectRelatedTests,
  startProjectTest,
  startProjectTestFile,
  stopProjectTest,
} from '../api';
import { noticeCenterStore } from '../stores/notice-center';
import { useAutoDismiss } from './useAutoDismiss';
import {
  formatDurationBetween,
  type TestLogTab,
} from './project-test-log';

export type TestStatusTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';
export type TestExecutionScope = 'suite' | 'file' | 'related';

export interface TestExecutionTarget {
  commandId: string;
  scope?: TestExecutionScope;
  targetFile?: string;
}

export function useProjectTestProcess(
  props: { project: Project },
  overview: Ref<ProjectTestOverview | null>,
) {
  const managedProcess = ref<ManagedProcess | null>(null);
  const logContent = ref('');
  const logTruncated = ref(false);
  const startingCommandId = ref<string | null>(null);
  const stopping = ref(false);
  const errorMessage = ref('');
  const copyMessage = ref('');
  const activeLogTab = ref<TestLogTab>('log');
  const logViewport = ref<HTMLElement | null>(null);

  useAutoDismiss(errorMessage, '');
  useAutoDismiss(copyMessage, '');

  let hasObservedRunning = false;
  let lastStartedCommandId: string | null = null;
  let generation = 0;
  let closeExecutionEvents: (() => void) | null = null;
  const recoveryMessage = 'A conexão em tempo real foi interrompida. Recuperando o estado atual…';

  const status = computed(() => managedProcess.value?.status ?? 'idle');
  const statusLabel = computed(() => {
    const value = managedProcess.value;
    if (!value) return 'Pronto para executar';
    if (value.status === 'starting') return 'Iniciando';
    if (value.status === 'running') return 'Executando';
    if (value.status === 'stopping') return 'Interrompendo';
    if (value.status === 'stopped') return value.exitCode === 0 ? 'Concluído com sucesso' : 'Encerrado';
    if (value.status === 'failed') return value.exitCode !== undefined ? `Falhou (código ${value.exitCode})` : 'Falhou';
    return value.status;
  });

  const currentStatusTone = computed<TestStatusTone>(() => {
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

  const isRunning = computed(() =>
    status.value === 'starting' || status.value === 'running' || status.value === 'stopping');

  const currentTarget = computed<TestExecutionTarget | null>(() => {
    const process = managedProcess.value;
    if (!process) return null;
    const prefix = `${process.projectId}:${process.kind}:`;
    const rawId = process.id.startsWith(prefix) ? process.id.slice(prefix.length) : process.id;
    const relatedExecution = rawId.endsWith(':related');
    const fileExecution = rawId.endsWith(':file');
    const commandId = relatedExecution
      ? rawId.slice(0, -':related'.length)
      : fileExecution
        ? rawId.slice(0, -':file'.length)
        : rawId;
    const targetFile = fileExecution ? process.args?.at(-1) : undefined;
    return {
      commandId,
      scope: relatedExecution ? 'related' : fileExecution ? 'file' : 'suite',
      ...(targetFile ? { targetFile } : {}),
    };
  });

  const currentCommandText = computed(() => {
    const process = managedProcess.value;
    return process ? [process.command, ...(process.args ?? [])].filter(Boolean).join(' ') : '—';
  });

  function currentRequest(projectId: string, requestGeneration: number): boolean {
    return props.project.id === projectId && generation === requestGeneration;
  }

  async function refreshProcess(): Promise<boolean> {
    const projectId = props.project.id;
    const requestGeneration = generation;
    try {
      const result = await fetchProjectTestProcess(projectId);
      if (!currentRequest(projectId, requestGeneration)) return true;
      managedProcess.value = result;
      if (result) {
        const log = await fetchProjectTestLog(projectId).catch(() => null);
        if (!currentRequest(projectId, requestGeneration)) return true;
        if (log) {
          logContent.value = log.content;
          logTruncated.value = log.truncated;
        }
      } else {
        logContent.value = '';
        logTruncated.value = false;
      }
      if (errorMessage.value === recoveryMessage) errorMessage.value = '';
      return true;
    } catch (error) {
      if (currentRequest(projectId, requestGeneration)) {
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

    while (currentRequest(projectId, requestGeneration)) {
      const succeeded = await refreshProcess();
      if (!currentRequest(projectId, requestGeneration)) return;
      if (!succeeded) {
        await new Promise((resolve) => setTimeout(resolve, reconnectDelay));
        reconnectDelay = Math.min(reconnectDelay * 2, 5_000);
        continue;
      }
      if (!isRunning.value) return;

      const stream = followTestExecutionEvents(projectId, (event) => {
        if (!currentRequest(projectId, requestGeneration)) return;
        if (event.type === 'state') managedProcess.value = event.process;
        else {
          logContent.value = event.log.content;
          logTruncated.value = event.log.truncated;
        }
      });
      closeExecutionEvents = stream.close;
      try {
        await stream.done;
        reconnectDelay = 500;
      } catch {
        if (currentRequest(projectId, requestGeneration)) errorMessage.value = recoveryMessage;
      }
      if (closeExecutionEvents === stream.close) closeExecutionEvents = null;
      if (!currentRequest(projectId, requestGeneration)) return;
      if (!isRunning.value) {
        await refreshProcess();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, reconnectDelay));
      reconnectDelay = Math.min(reconnectDelay * 2, 5_000);
    }
  }

  async function startExecution(target: TestExecutionTarget): Promise<void> {
    const projectId = props.project.id;
    const requestGeneration = generation;
    startingCommandId.value = target.commandId;
    lastStartedCommandId = target.commandId;
    errorMessage.value = '';
    activeLogTab.value = 'log';
    try {
      const result = target.scope === 'related'
        ? await startProjectRelatedTests(projectId, target.commandId)
        : target.targetFile
          ? await startProjectTestFile(projectId, target.commandId, target.targetFile)
          : await startProjectTest(projectId, target.commandId);
      if (!currentRequest(projectId, requestGeneration)) return;
      managedProcess.value = result;
      logContent.value = '';
      logTruncated.value = false;
      void followProcess();
    } catch (error) {
      if (currentRequest(projectId, requestGeneration)) {
        errorMessage.value = error instanceof Error ? error.message : 'Não foi possível iniciar os testes.';
      }
    } finally {
      if (currentRequest(projectId, requestGeneration)) startingCommandId.value = null;
    }
  }

  async function handleStop(): Promise<void> {
    const projectId = props.project.id;
    const requestGeneration = generation;
    stopping.value = true;
    errorMessage.value = '';
    try {
      const result = await stopProjectTest(projectId);
      if (!currentRequest(projectId, requestGeneration)) return;
      managedProcess.value = result;
      await refreshProcess();
    } catch (error) {
      if (currentRequest(projectId, requestGeneration)) {
        errorMessage.value = error instanceof Error ? error.message : 'Não foi possível interromper os testes.';
      }
    } finally {
      if (currentRequest(projectId, requestGeneration)) stopping.value = false;
    }
  }

  async function handleClearLogs(): Promise<void> {
    const projectId = props.project.id;
    const requestGeneration = generation;
    errorMessage.value = '';
    try {
      const log = await clearProjectTestLog(projectId);
      if (!currentRequest(projectId, requestGeneration)) return;
      logContent.value = log.content;
      logTruncated.value = log.truncated;
      activeLogTab.value = 'log';
    } catch (error) {
      if (currentRequest(projectId, requestGeneration)) {
        errorMessage.value = error instanceof Error ? error.message : 'Não foi possível limpar o log.';
      }
    }
  }

  async function handleCopyLogs(cleanLogContent: string): Promise<void> {
    if (!cleanLogContent) return;
    try {
      await navigator.clipboard.writeText(cleanLogContent);
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

  watch(managedProcess, (process) => {
    if (!process) return;
    if (process.status === 'starting' || process.status === 'running' || process.status === 'stopping') {
      hasObservedRunning = true;
      return;
    }
    if (!hasObservedRunning || (process.status !== 'stopped' && process.status !== 'failed')) return;
    const effectiveCommandId = startingCommandId.value || lastStartedCommandId;
    const commandLabel = overview.value?.commands.find((command) => command.id === effectiveCommandId)?.label ?? 'Testes';
    noticeCenterStore.publishTerminalNotice({
      origin: 'test',
      dedupeKey: `test:${process.id}:${process.status}`,
      outcome: process.status,
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
      managedProcess.value = null;
      logContent.value = '';
      logTruncated.value = false;
      startingCommandId.value = null;
      stopping.value = false;
      errorMessage.value = '';
      copyMessage.value = '';
      activeLogTab.value = 'log';
      void followProcess();
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    closeExecutionEvents?.();
    closeExecutionEvents = null;
  });

  return {
    activeLogTab,
    copyMessage,
    currentCommandText,
    currentStatusTone,
    currentTarget,
    duration,
    errorMessage,
    handleClearLogs,
    handleCopyLogs,
    handleStop,
    isRunning,
    logContent,
    logTruncated,
    logViewport,
    managedProcess,
    scrollLogToEnd,
    startExecution,
    startingCommandId,
    statusLabel,
    stopping,
  };
}
