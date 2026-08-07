import { onUnmounted, ref, watch, type Ref } from 'vue';

import type {
  Project,
  ProjectScript,
  ScriptExecution,
  ScriptExecutionHistory,
  ScriptExecutionLog,
  ScriptExecutionVariables,
} from '@dev-dashboard/contracts';

import {
  cancelScriptExecution,
  clearScriptExecutionHistory,
  fetchLatestScriptExecution,
  fetchScriptExecution,
  fetchScriptExecutionHistory,
  fetchScriptExecutionLog,
  followScriptExecutionEvents,
  prepareScriptExecution,
  startScriptExecution,
} from '../api';
import { confirmDialog } from '../stores/app-dialog';
import { noticeCenterStore } from '../stores/notice-center';
import { durationInMilliseconds } from '../stores/native-notifications';

const realtimeRecoveryMessage =
  'A conexão em tempo real foi interrompida. Recuperando o estado atual…';

type ScriptNoticeRouteName = 'project-scripts' | 'project-dependencies';

export function useScriptExecution<ScriptSection extends string>(
  getProject: () => Project,
  activeSection: Ref<ScriptSection>,
  selectedActionId: Ref<string>,
  executionsSection: ScriptSection,
  errorMessage: Ref<string>,
  noticeRouteName?: ScriptNoticeRouteName,
) {
  const execution = ref<ScriptExecution | null>(null);
  const history = ref<ScriptExecutionHistory | null>(null);
  const executionLogSnapshot = ref<ScriptExecutionLog | null>(null);
  const executionLog = ref('');
  const maskedLogEntries = ref(0);
  const startingActionId = ref<string | null>(null);
  const clearingHistory = ref(false);
  const resolvedNoticeRouteName: ScriptNoticeRouteName =
    noticeRouteName ??
    (executionsSection === 'execution'
      ? 'project-dependencies'
      : 'project-scripts');

  let generation = 0;
  let executionGeneration = 0;
  let hasObservedRunning = false;
  let closeExecutionEvents: (() => void) | null = null;

  function applyLogSnapshot(log: ScriptExecutionLog | null): void {
    executionLogSnapshot.value = log;
    executionLog.value = log?.content ?? '';
    maskedLogEntries.value = log?.redactionCount ?? 0;
  }

  async function followExecution(
    initial: ScriptExecution,
    projectId: string,
    current: number,
    currentExecutionGeneration: number,
  ): Promise<void> {
    let currentExecution = initial;
    let reconnectDelay = 500;
    closeExecutionEvents?.();
    closeExecutionEvents = null;

    while (
      current === generation &&
      currentExecutionGeneration === executionGeneration &&
      projectId === getProject().id
    ) {
      const [recoveredExecution, recoveredLog] = await Promise.all([
        fetchScriptExecution(projectId, initial.id),
        fetchScriptExecutionLog(projectId, initial.id),
      ]);
      if (
        current !== generation ||
        currentExecutionGeneration !== executionGeneration
      )
        return;

      currentExecution = recoveredExecution;
      execution.value = recoveredExecution;
      applyLogSnapshot(recoveredLog);
      if (errorMessage.value === realtimeRecoveryMessage)
        errorMessage.value = '';
      if (currentExecution.status !== 'running') return;

      const stream = followScriptExecutionEvents(
        projectId,
        initial.id,
        (event) => {
          if (
            current !== generation ||
            currentExecutionGeneration !== executionGeneration
          )
            return;
          if (event.type === 'state') {
            currentExecution = event.execution;
            execution.value = event.execution;
          } else {
            applyLogSnapshot(event.log);
          }
        },
      );
      closeExecutionEvents = stream.close;

      try {
        await stream.done;
      } catch {
        if (
          current === generation &&
          currentExecutionGeneration === executionGeneration
        ) {
          errorMessage.value = realtimeRecoveryMessage;
        }
      }

      if (closeExecutionEvents === stream.close) closeExecutionEvents = null;
      if (currentExecution.status !== 'running') {
        const finalLog = await fetchScriptExecutionLog(projectId, initial.id);
        if (
          current === generation &&
          currentExecutionGeneration === executionGeneration
        ) {
          applyLogSnapshot(finalLog);
        }
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, reconnectDelay));
      reconnectDelay = Math.min(reconnectDelay * 2, 5_000);
    }
  }

  async function loadHistory(
    projectId = getProject().id,
    current = generation,
  ): Promise<void> {
    try {
      const result = await fetchScriptExecutionHistory(projectId);
      if (current === generation && projectId === getProject().id)
        history.value = result;
    } catch (error) {
      if (current === generation) {
        errorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar o histórico.';
      }
    }
  }

  async function restoreExecution(
    projectId: string,
    current: number,
  ): Promise<void> {
    const currentExecution = ++executionGeneration;
    try {
      const latest = await fetchLatestScriptExecution(projectId);
      if (
        current !== generation ||
        currentExecution !== executionGeneration ||
        projectId !== getProject().id ||
        !latest
      )
        return;
      execution.value = latest;
      await followExecution(latest, projectId, current, currentExecution);
    } catch (error) {
      if (current === generation && currentExecution === executionGeneration) {
        errorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível recuperar a última execução.';
      }
    }
  }

  async function run(
    item: ProjectScript,
    variables: ScriptExecutionVariables = {},
  ): Promise<void> {
    if (startingActionId.value || execution.value?.status === 'running') return;
    const projectId = getProject().id;
    const current = generation;

    if (item.risk !== 'read-only') {
      const riskLabel = item.risk === 'destructive' ? 'destrutiva' : 'mutável';
      const confirmed = await confirmDialog({
        title: `Executar ação ${riskLabel}?`,
        message:
          `A ação “${item.name}” executará código do projeto localmente ` +
          'com os valores exibidos.',
        confirmLabel: 'Executar ação',
        tone: item.risk === 'destructive' ? 'danger' : 'warning',
      });
      if (!confirmed) return;
    }

    selectedActionId.value = item.id;
    startingActionId.value = item.id;
    const currentExecution = ++executionGeneration;
    errorMessage.value = '';

    try {
      const confirmation =
        item.risk === 'read-only'
          ? undefined
          : await prepareScriptExecution(projectId, item.id, variables);
      const started = await startScriptExecution(
        projectId,
        item.id,
        confirmation?.token,
        variables,
      );
      execution.value = started;
      applyLogSnapshot(null);
      activeSection.value = executionsSection;
      startingActionId.value = null;
      await followExecution(started, projectId, current, currentExecution);
      await loadHistory(projectId, current);
    } catch (error) {
      if (current === generation && currentExecution === executionGeneration) {
        errorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível executar a ação.';
      }
    } finally {
      if (current === generation && currentExecution === executionGeneration) {
        startingActionId.value = null;
      }
    }
  }

  async function selectHistory(item: ScriptExecution): Promise<void> {
    const currentExecution = ++executionGeneration;
    const current = generation;
    const projectId = getProject().id;
    execution.value = item;
    applyLogSnapshot(null);
    activeSection.value = executionsSection;
    await followExecution(item, projectId, current, currentExecution);
  }

  async function cancel(): Promise<void> {
    if (!execution.value) return;
    try {
      execution.value = await cancelScriptExecution(
        getProject().id,
        execution.value.id,
      );
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : 'Não foi possível cancelar.';
    }
  }

  async function clearHistory(): Promise<void> {
    if (clearingHistory.value) return;
    const confirmed = await confirmDialog({
      title: 'Limpar histórico de execuções?',
      message:
        'As execuções finalizadas e seus logs salvos serão removidos. Uma execução em andamento será mantida.',
      confirmLabel: 'Limpar histórico',
      tone: 'danger',
    });
    if (!confirmed) return;

    const projectId = getProject().id;
    const current = generation;
    clearingHistory.value = true;
    errorMessage.value = '';
    try {
      await clearScriptExecutionHistory(projectId);
      if (current !== generation || projectId !== getProject().id) return;
      if (execution.value?.status !== 'running') {
        executionGeneration += 1;
        execution.value = null;
        applyLogSnapshot(null);
      }
      await loadHistory(projectId, current);
    } catch (error) {
      if (current === generation) {
        errorMessage.value =
          error instanceof Error
            ? error.message
            : 'Não foi possível limpar o histórico.';
      }
    } finally {
      if (current === generation) clearingHistory.value = false;
    }
  }

  watch(
    () => getProject().id,
    () => {
      closeExecutionEvents?.();
      closeExecutionEvents = null;
      generation += 1;
      executionGeneration += 1;
      const current = generation;
      const projectId = getProject().id;
      history.value = null;
      execution.value = null;
      applyLogSnapshot(null);
      startingActionId.value = null;
      clearingHistory.value = false;
      hasObservedRunning = false;
      void loadHistory(projectId, current);
      void restoreExecution(projectId, current);
    },
    { immediate: true },
  );

  watch(execution, (exec) => {
    if (!exec) return;
    if (exec.status === 'running') {
      hasObservedRunning = true;
      return;
    }
    if (!hasObservedRunning) return;

    noticeCenterStore.publishTerminalNotice({
      origin: 'script',
      dedupeKey: `script:${exec.id}:${exec.status}`,
      outcome: exec.status,
      projectId: getProject().id,
      projectName: getProject().name,
      label: exec.actionName,
      durationMs: durationInMilliseconds(exec.startedAt, exec.finishedAt),
      routeTo: {
        name: resolvedNoticeRouteName,
        params: { projectId: getProject().id },
      },
    });
  });

  onUnmounted(() => {
    closeExecutionEvents?.();
    closeExecutionEvents = null;
    generation += 1;
    executionGeneration += 1;
  });

  return {
    execution,
    history,
    executionLog,
    executionLogSnapshot,
    maskedLogEntries,
    startingActionId,
    clearingHistory,
    errorMessage,
    run,
    loadHistory,
    selectHistory,
    cancel,
    clearHistory,
  };
}
