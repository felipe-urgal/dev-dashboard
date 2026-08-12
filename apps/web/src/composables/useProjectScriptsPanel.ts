import { ref } from 'vue';

import type {
  Project,
  ScriptExecution,
  ScriptExecutionStatus,
} from '@dev-dashboard/contracts';

import { useAutoDismiss } from './useAutoDismiss';
import { useScriptExecution } from './useScriptExecution';

export const scriptExecutionStatusLabels: Record<
  ScriptExecutionStatus,
  string
> = {
  running: 'Em execução',
  succeeded: 'Concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};

export function formatScriptExecutionDate(value?: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function scriptExecutionDuration(item: ScriptExecution | null): string {
  if (!item) return '—';
  const start = new Date(item.startedAt).getTime();
  const end = item.finishedAt
    ? new Date(item.finishedAt).getTime()
    : Date.now();
  const seconds = Math.max(0, Math.round((end - start) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

export function useProjectScriptsPanel(getProject: () => Project) {
  const activeSection = ref<'executions'>('executions');
  const selectedActionId = ref('');
  const errorMessage = ref('');

  const executionState = useScriptExecution(
    getProject,
    activeSection,
    selectedActionId,
    'executions',
    errorMessage,
  );

  useAutoDismiss(errorMessage, '');

  return {
    ...executionState,
    errorMessage,
    executionStatusLabels: scriptExecutionStatusLabels,
  };
}
