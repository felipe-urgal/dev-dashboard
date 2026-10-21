import { describe, expect, it } from 'vitest';
import type {
  StackCheck,
  StackRestartResult,
  StackStartResult,
  StackStopResult,
} from '@dev-dashboard/contracts';

import {
  outcomeActionLabel,
  outcomeStateLabel,
  outcomeStateTone,
  outcomeStepLabel,
  outcomeStepTone,
  outcomeSteps,
} from '../src/utils/stack-operation-outcome';

const check = {} as StackCheck;

describe('Stack operation outcome (not a plan or a live Check)', () => {
  it('preserves the exact blocked multi-node Start steps without claiming unattempted nodes ran', () => {
    const result: StackStartResult = {
      stackId: 'local',
      state: 'blocked',
      check,
      steps: [
        { nodeId: 'postgres', state: 'started' },
        {
          nodeId: 'api',
          state: 'blocked',
          diagnostic: 'Database readiness was not proven.',
        },
      ],
    };
    const steps = outcomeSteps({ kind: 'start', result });
    expect(steps).toEqual(result.steps);
    expect(steps).toHaveLength(2);
    expect(outcomeActionLabel('start')).toBe('Iniciar');
    expect(outcomeStateLabel(result.state)).toBe('Bloqueado');
    expect(outcomeStateTone(result.state)).toBe('warning');
    expect(outcomeStepLabel('started')).toBe('Iniciado');
    expect(outcomeStepLabel('blocked')).toContain('não executado');
    expect(outcomeStepTone('blocked')).toBe('warning');
    expect(steps.some((step) => step.nodeId === 'unattempted')).toBe(false);
  });

  it('distinguishes retained/shared service, already stopped and real failed Stop', () => {
    const result: StackStopResult = {
      stackId: 'local',
      state: 'failed',
      check,
      steps: [
        {
          nodeId: 'shared-db',
          state: 'retained',
          diagnostic: 'Shared dependency stays running.',
        },
        { nodeId: 'observer', state: 'already-stopped' },
        {
          nodeId: 'api',
          state: 'failed',
          diagnostic: 'Owner could not confirm stop.',
        },
      ],
    };
    const steps = outcomeSteps({ kind: 'stop', result });
    expect(steps).toHaveLength(3);
    expect(steps[0]?.diagnostic).toContain('Shared dependency');
    expect(outcomeActionLabel('stop')).toBe('Parar');
    expect(outcomeStateLabel(result.state)).toBe('Falhou');
    expect(outcomeStateTone(result.state)).toBe('danger');
    expect(outcomeStepLabel('retained')).toContain('não encerrado');
    expect(outcomeStepLabel('already-stopped')).toContain('não executado');
    expect(outcomeStepTone('retained')).toBe('warning');
    expect(outcomeStepTone('failed')).toBe('danger');
  });

  it('does not claim a retained node was stopped when the overall Stop completed', () => {
    const result: StackStopResult = {
      stackId: 'shared',
      state: 'completed',
      check,
      steps: [
        { nodeId: 'api', state: 'stopped' },
        {
          nodeId: 'postgres',
          state: 'retained',
          diagnostic: 'Shared service is required by another project.',
        },
        { nodeId: 'environment', state: 'already-stopped' },
      ],
    };
    const steps = outcomeSteps({ kind: 'stop', result });
    expect(outcomeStateLabel(result.state)).toBe('Concluído');
    expect(outcomeStepLabel(steps[0]!.state)).toBe('Parado');
    expect(outcomeStepLabel(steps[1]!.state)).toBe('Mantido (não encerrado)');
    expect(outcomeStepTone(steps[1]!.state)).toBe('warning');
    expect(steps[1]!.diagnostic).toContain('another project');
    expect(steps[2]!.state).toBe('already-stopped');
  });

  it('keeps Restart scoped to its single node and never creates synthetic steps', () => {
    const result: StackRestartResult = {
      stackId: 'local',
      nodeId: 'api',
      state: 'blocked',
      diagnostic: 'Ownership changed.',
      check,
    };
    expect(outcomeSteps({ kind: 'restart', result })).toEqual([
      {
        nodeId: 'api',
        state: 'blocked',
        diagnostic: 'Ownership changed.',
      },
    ]);
    expect(outcomeActionLabel('restart')).toBe('Reiniciar');
    expect(outcomeStepLabel('restarted')).toBe('Reiniciado');
    expect(outcomeStepTone('restarted')).toBe('success');
  });
});
