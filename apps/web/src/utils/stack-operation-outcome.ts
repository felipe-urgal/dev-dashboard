import type {
  StackRestartResult,
  StackStartResult,
  StackStopResult,
} from '@dev-dashboard/contracts';

import type { StatusBadgeTone } from '../components/status-badge-types';

export type StackOperationOutcome =
  | { kind: 'start'; result: StackStartResult }
  | { kind: 'stop'; result: StackStopResult }
  | { kind: 'restart'; result: StackRestartResult };

export function outcomeActionLabel(
  kind: StackOperationOutcome['kind'],
): string {
  if (kind === 'start') return 'Iniciar';
  if (kind === 'stop') return 'Parar';
  return 'Reiniciar';
}

export function outcomeStateLabel(
  state: StackOperationOutcome['result']['state'],
): string {
  if (state === 'completed') return 'Concluído';
  if (state === 'restarted') return 'Reiniciado';
  if (state === 'blocked') return 'Bloqueado';
  return 'Falhou';
}

export function outcomeStateTone(
  state: StackOperationOutcome['result']['state'],
): StatusBadgeTone {
  if (state === 'completed' || state === 'restarted') return 'success';
  if (state === 'blocked') return 'warning';
  return 'danger';
}

export type StackOperationStep = {
  nodeId: string;
  state: string;
  diagnostic?: string;
};

/** Only the result of an actual Start/Stop/Restart response, never a preview. */
export function outcomeSteps(
  outcome: StackOperationOutcome,
): StackOperationStep[] {
  if (outcome.kind === 'restart') {
    return [
      {
        nodeId: outcome.result.nodeId,
        state: outcome.result.state,
        ...(outcome.result.diagnostic
          ? { diagnostic: outcome.result.diagnostic }
          : {}),
      },
    ];
  }
  return outcome.result.steps;
}

export function outcomeStepLabel(state: string): string {
  switch (state) {
    case 'already-ready':
      return 'Já estava pronto (não executado)';
    case 'already-stopped':
      return 'Já estava parado (não executado)';
    case 'started':
      return 'Iniciado';
    case 'stopped':
      return 'Parado';
    case 'retained':
      return 'Mantido (não encerrado)';
    case 'blocked':
      return 'Bloqueado (não executado)';
    case 'failed':
      return 'Falhou';
    case 'restarted':
      return 'Reiniciado';
    default:
      return 'Estado não reconhecido';
  }
}

export function outcomeStepTone(state: string): StatusBadgeTone {
  if (state === 'started' || state === 'stopped' || state === 'restarted')
    return 'success';
  if (state === 'blocked' || state === 'retained') return 'warning';
  if (state === 'failed') return 'danger';
  return 'neutral';
}
