import {
  computed,
  ref,
  watch,
} from 'vue';
import type {
  Project,
  ProjectTestCommand,
  ProjectTestFile,
  ProjectTestOverview,
  ProjectTestRunner,
} from '@dev-dashboard/contracts';

import {
  fetchProjectRelatedTests,
  fetchProjectTestFiles,
  fetchProjectTests,
  type ProjectRelatedTests,
} from '../api';
import { useAutoDismiss } from './useAutoDismiss';
import {
  extractTargetFile,
  formatTimestamp,
  isDetailLine,
  isErrorLine,
  isWarningLine,
  logLineTone,
  matchNumber,
  stripAnsi,
  type TestLogLine,
  type TestRunSummary,
} from './project-test-log';
import {
  useProjectTestProcess,
  type TestExecutionScope,
  type TestExecutionTarget,
} from './useProjectTestProcess';

type ExecutionScope = TestExecutionScope;

interface ExecutionChoice {
  key: string;
  commandId: string;
  scope: ExecutionScope;
  label: string;
  description: string;
}

const runnerLabels: Record<ProjectTestRunner, string> = {
  vitest: 'Vitest',
  jest: 'Jest',
  'node-test': 'Node Test Runner',
  rspec: 'RSpec',
  'rails-test': 'Rails Test',
  minitest: 'Minitest',
  pytest: 'pytest',
};

export function useProjectTestsPanel(props: { project: Project }) {
  const overview = ref<ProjectTestOverview | null>(null);
  const loadingOverview = ref(false);
  const selectedExecutionKey = ref('');
  const loadingFilesCommandId = ref<string | null>(null);
  const testFiles = ref<ProjectTestFile[]>([]);
  const selectedFilePath = ref('');
  const fileErrorMessage = ref('');
  const loadingRelatedCommandId = ref<string | null>(null);
  const relatedTests = ref<ProjectRelatedTests | null>(null);
  const relatedErrorMessage = ref('');

  useAutoDismiss(fileErrorMessage, '');
  useAutoDismiss(relatedErrorMessage, '');

  const process = useProjectTestProcess(props, overview);
  const {
    activeLogTab,
    copyMessage,
    currentCommandText,
    currentStatusTone,
    currentTarget,
    duration,
    errorMessage,
    handleClearLogs,
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
  } = process;

  const executionChoices = computed<ExecutionChoice[]>(() =>
    (overview.value?.commands ?? []).flatMap((command) => {
      const runner = runnerLabels[command.runner];
      const choices: ExecutionChoice[] = [{
        key: choiceKey(command.id, 'suite'),
        commandId: command.id,
        scope: 'suite',
        label: `${runner} — suíte completa`,
        description: command.label,
      }];
      if (command.supportsFileTarget) {
        choices.push(
          {
            key: choiceKey(command.id, 'file'),
            commandId: command.id,
            scope: 'file',
            label: `${runner} — arquivo específico`,
            description: command.label,
          },
          {
            key: choiceKey(command.id, 'related'),
            commandId: command.id,
            scope: 'related',
            label: `${runner} — alterações da branch`,
            description: command.label,
          },
        );
      }
      return choices;
    }));

  const selectedChoice = computed(() =>
    executionChoices.value.find((choice) => choice.key === selectedExecutionKey.value));

  const selectedCommand = computed<ProjectTestCommand | undefined>(() => {
    const commandId = selectedChoice.value?.commandId;
    return overview.value?.commands.find((command) => command.id === commandId);
  });

  const selectionConfigured = computed(() => Boolean(
    selectedChoice.value && (
      selectedChoice.value.scope === 'suite' ||
      (selectedChoice.value.scope === 'file' && selectedFilePath.value) ||
      (selectedChoice.value.scope === 'related' && (relatedTests.value?.testFiles.length ?? 0) > 0)
    ),
  ));

  const canExecuteSelection = computed(() => Boolean(
    selectionConfigured.value && !isRunning.value && startingCommandId.value === null,
  ));

  const executionPreview = computed(() => {
    const command = selectedCommand.value;
    if (!command) return 'Selecione como deseja executar os testes.';
    if (selectedChoice.value?.scope === 'file') {
      return selectedFilePath.value
        ? `${command.label} ${selectedFilePath.value}`
        : `${command.label} <arquivo>`;
    }
    if (selectedChoice.value?.scope === 'related') {
      const files = relatedTests.value?.testFiles ?? [];
      return files.length > 0
        ? `${command.label} ${files.map((entry) => entry.path).join(' ')}`
        : `${command.label} <testes relacionados>`;
    }
    return command.label;
  });

  const cleanLogContent = computed(() => stripAnsi(logContent.value));
  const logLines = computed<TestLogLine[]>(() => {
    const lines = cleanLogContent.value.replace(/\r/g, '').split('\n');
    while (lines.length > 0 && lines.at(-1) === '') lines.pop();
    return lines.map((text, index) => ({ number: index + 1, text, tone: logLineTone(text) }));
  });
  const errorLogLines = computed(() => logLines.value.filter((line) => isErrorLine(line.text)));
  const warningLogLines = computed(() => logLines.value.filter((line) => isWarningLine(line.text)));
  const detailLogLines = computed(() => logLines.value.filter((line) => isDetailLine(line.text)));
  const visibleLogLines = computed(() => {
    if (activeLogTab.value === 'errors') return errorLogLines.value;
    if (activeLogTab.value === 'warnings') return warningLogLines.value;
    if (activeLogTab.value === 'details') return detailLogLines.value;
    return logLines.value;
  });
  const activeLogEmptyLabel = computed(() => {
    if (activeLogTab.value === 'errors') return 'Nenhuma linha de erro identificada.';
    if (activeLogTab.value === 'warnings') return 'Nenhum aviso identificado.';
    if (activeLogTab.value === 'details') return 'Nenhum detalhe estruturado identificado.';
    return 'Sem saída registrada ainda.';
  });

  const currentCommand = computed(() => {
    const commandId = currentTarget.value?.commandId;
    return overview.value?.commands.find((command) => command.id === commandId);
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
      failed = Number(rspec[2]);
      passed = Math.max(0, Number(rspec[1]) - failed);
    } else if (rails) {
      failed = Number(rails[3]) + Number(rails[4]);
      passed = Math.max(0, Number(rails[1]) - failed);
    }
    const runner = currentCommand.value ? runnerLabels[currentCommand.value.runner] : projectRunnerFallback();
    const targetFile = currentTarget.value?.scope === 'related'
      ? 'Alterações da branch'
      : currentTarget.value?.targetFile ?? extractTargetFile(text) ?? 'Suíte completa';
    const testDuration = /\btests\s+([\d.]+(?:ms|s))\b/i.exec(text)?.[1]
      ?? /\bFinished in\s+([^\n]+)/i.exec(text)?.[1]?.trim()
      ?? /\bDone in\s+([\d.]+s)\b/i.exec(text)?.[1]
      ?? duration.value;
    const version = /\b(?:Vitest|Jest|RSpec|pytest)\s+v?([\d.]+)/i.exec(text)?.[1]
      ?? /\bv(\d+\.\d+\.\d+)\b/.exec(text)?.[1];
    return {
      targetFile,
      ...(passed !== undefined ? { passed } : {}),
      ...(failed !== undefined ? { failed } : {}),
      duration: testDuration || '—',
      runner,
      ...(version ? { runnerVersion: `v${version}` } : {}),
    };
  });

  const totalTests = computed(() => {
    if (runSummary.value.passed === undefined && runSummary.value.failed === undefined) return undefined;
    return (runSummary.value.passed ?? 0) + (runSummary.value.failed ?? 0);
  });

  function choiceKey(commandId: string, scope: ExecutionScope): string {
    return `${commandId}::${scope}`;
  }

  function projectRunnerFallback(): string {
    if (props.project.type === 'rails') return 'Rails';
    if (props.project.type === 'node') return 'Node.js';
    return 'Testes';
  }

  function syncSelectionFromProcess(): void {
    const target = currentTarget.value;
    if (!target || !overview.value) return;
    const scope: ExecutionScope = target.scope ?? (target.targetFile ? 'file' : 'suite');
    const key = choiceKey(target.commandId, scope);
    if (!executionChoices.value.some((choice) => choice.key === key)) return;
    selectedExecutionKey.value = key;
    selectedFilePath.value = target.targetFile ?? '';
    if (scope === 'file' && loadingFilesCommandId.value !== target.commandId && testFiles.value.length === 0) {
      void loadFilesForCommand(target.commandId);
    }
    if (scope === 'related' && loadingRelatedCommandId.value !== target.commandId && relatedTests.value === null) {
      void loadRelatedForCommand(target.commandId);
    }
  }

  function ensureDefaultSelection(): void {
    if (executionChoices.value.length === 0) {
      selectedExecutionKey.value = '';
      return;
    }
    syncSelectionFromProcess();
    if (!executionChoices.value.some((choice) => choice.key === selectedExecutionKey.value)) {
      selectedExecutionKey.value = executionChoices.value[0]!.key;
    }
  }

  async function loadOverview(refresh = false): Promise<void> {
    const projectId = props.project.id;
    loadingOverview.value = true;
    errorMessage.value = '';
    try {
      const result = await fetchProjectTests(projectId, { refresh });
      if (projectId !== props.project.id) return;
      overview.value = result;
      ensureDefaultSelection();
    } catch (error) {
      if (projectId === props.project.id) {
        errorMessage.value = error instanceof Error ? error.message : 'Não foi possível carregar as opções de teste.';
      }
    } finally {
      if (projectId === props.project.id) loadingOverview.value = false;
    }
  }

  async function handleExecutionChoiceChange(): Promise<void> {
    selectedFilePath.value = '';
    testFiles.value = [];
    fileErrorMessage.value = '';
    relatedTests.value = null;
    relatedErrorMessage.value = '';
    const choice = selectedChoice.value;
    if (choice?.scope === 'file') await loadFilesForCommand(choice.commandId);
    if (choice?.scope === 'related') await loadRelatedForCommand(choice.commandId);
  }

  async function loadFilesForCommand(commandId: string): Promise<void> {
    const projectId = props.project.id;
    loadingFilesCommandId.value = commandId;
    fileErrorMessage.value = '';
    testFiles.value = [];
    try {
      const files = await fetchProjectTestFiles(projectId, commandId);
      const choice = selectedChoice.value;
      if (projectId !== props.project.id || choice?.commandId !== commandId || choice.scope !== 'file') return;
      testFiles.value = files;
      const target = currentTarget.value;
      if (target?.commandId === commandId && target.targetFile && files.some((file) => file.path === target.targetFile)) {
        selectedFilePath.value = target.targetFile;
      }
    } catch (error) {
      const choice = selectedChoice.value;
      if (projectId === props.project.id && choice?.commandId === commandId && choice.scope === 'file') {
        fileErrorMessage.value = error instanceof Error ? error.message : 'Não foi possível listar os arquivos de teste.';
      }
    } finally {
      if (loadingFilesCommandId.value === commandId) loadingFilesCommandId.value = null;
    }
  }

  async function loadRelatedForCommand(commandId: string): Promise<void> {
    const projectId = props.project.id;
    loadingRelatedCommandId.value = commandId;
    relatedErrorMessage.value = '';
    relatedTests.value = null;
    try {
      const related = await fetchProjectRelatedTests(projectId, commandId);
      const choice = selectedChoice.value;
      if (projectId !== props.project.id || choice?.commandId !== commandId || choice.scope !== 'related') return;
      relatedTests.value = related;
    } catch (error) {
      const choice = selectedChoice.value;
      if (projectId === props.project.id && choice?.commandId === commandId && choice.scope === 'related') {
        relatedErrorMessage.value = error instanceof Error
          ? error.message
          : 'Não foi possível identificar os testes relacionados às alterações.';
      }
    } finally {
      if (loadingRelatedCommandId.value === commandId) loadingRelatedCommandId.value = null;
    }
  }

  async function handleExecuteSelection(): Promise<void> {
    const choice = selectedChoice.value;
    if (!choice || !canExecuteSelection.value) return;
    await startExecution({
      commandId: choice.commandId,
      scope: choice.scope,
      ...(choice.scope === 'file' && selectedFilePath.value ? { targetFile: selectedFilePath.value } : {}),
    });
  }

  async function handleRepeat(target: TestExecutionTarget): Promise<void> {
    if (isRunning.value || startingCommandId.value !== null) return;
    const scope: ExecutionScope = target.scope ?? (target.targetFile ? 'file' : 'suite');
    selectedExecutionKey.value = choiceKey(target.commandId, scope);
    selectedFilePath.value = target.targetFile ?? '';
    if (scope === 'related') await loadRelatedForCommand(target.commandId);
    await startExecution({ ...target, scope });
  }

  async function handleCopyLogs(): Promise<void> {
    await process.handleCopyLogs(cleanLogContent.value);
  }

  watch(currentTarget, syncSelectionFromProcess);
  watch(
    () => props.project.id,
    () => {
      overview.value = null;
      selectedExecutionKey.value = '';
      loadingFilesCommandId.value = null;
      testFiles.value = [];
      selectedFilePath.value = '';
      fileErrorMessage.value = '';
      loadingRelatedCommandId.value = null;
      relatedTests.value = null;
      relatedErrorMessage.value = '';
      void loadOverview();
    },
    { immediate: true },
  );

  return {
    activeLogEmptyLabel,
    activeLogTab,
    canExecuteSelection,
    cleanLogContent,
    copyMessage,
    currentCommandText,
    currentStatusTone,
    currentTarget,
    duration,
    errorLogLines,
    errorMessage,
    executionChoices,
    executionPreview,
    fileErrorMessage,
    formatTimestamp,
    handleClearLogs,
    handleCopyLogs,
    handleExecutionChoiceChange,
    handleExecuteSelection,
    handleRepeat,
    handleStop,
    isRunning,
    loadOverview,
    loadingFilesCommandId,
    loadingOverview,
    loadingRelatedCommandId,
    logTruncated,
    logViewport,
    managedProcess,
    overview,
    relatedErrorMessage,
    relatedTests,
    runSummary,
    scrollLogToEnd,
    selectedChoice,
    selectedExecutionKey,
    selectedFilePath,
    selectionConfigured,
    startingCommandId,
    statusLabel,
    stopping,
    testFiles,
    totalTests,
    visibleLogLines,
    warningLogLines,
  };
}
