import { describe, expect, it } from 'vitest';

import type { GitSyncProgressEvent } from '@dev-dashboard/contracts';

import {
  buildTimeline,
  formatDuration,
  formatRelativeTime,
} from '../src/utils/git-sync-status';

const event = (
  stepId: string,
  status: GitSyncProgressEvent['status'],
  at: string,
  runId = 'r1',
): GitSyncProgressEvent => ({
  runId,
  operation: 'main',
  stepId,
  status,
  message: stepId,
  occurredAt: `2026-09-10T12:00:${at}.000Z`,
});

describe('buildTimeline', () => {
  it('agrupa eventos por passo, calcula duração e conclui com o passo operation', () => {
    const result = buildTimeline([
      event('fetch-origin', 'running', '00'),
      event('fetch-origin', 'success', '02'),
      event('merge-main', 'running', '02'),
      event('merge-main', 'success', '05'),
      event('operation', 'success', '05'),
    ]);

    expect(result.steps.map((step) => [step.id, step.durationMs])).toEqual([
      ['fetch-origin', 2_000],
      ['merge-main', 3_000],
    ]);
    expect(result.outcome).toBe('success');
    expect(result.totalMs).toBe(5_000);
  });

  it('considera só a última execução e marca falha', () => {
    const result = buildTimeline([
      event('fetch-origin', 'success', '00', 'antiga'),
      event('merge-main', 'error', '03', 'nova'),
      event('operation', 'error', '03', 'nova'),
    ]);

    expect(result.steps.map((step) => step.id)).toEqual(['merge-main']);
    expect(result.outcome).toBe('error');
  });

  it('em andamento não tem duração do passo aberto nem total', () => {
    const result = buildTimeline([event('merge-main', 'running', '00')]);

    expect(result.steps[0]?.durationMs).toBeNull();
    expect(result.outcome).toBe('running');
    expect(result.totalMs).toBeNull();
  });
});

describe('formatação', () => {
  it('formata duração e tempo relativo', () => {
    expect(formatDuration(1_400)).toBe('1,4 s');
    expect(formatDuration(40)).toBe('<0,1 s');
    expect(formatDuration(null)).toBe('');

    const now = new Date('2026-09-10T12:00:00.000Z').getTime();
    expect(formatRelativeTime('2026-09-10T11:59:40.000Z', now)).toBe('agora');
    expect(formatRelativeTime('2026-09-10T09:00:00.000Z', now)).toBe('há 3 h');
    expect(formatRelativeTime('2026-09-09T12:00:00.000Z', now)).toBe('ontem');
    expect(formatRelativeTime('2026-09-05T12:00:00.000Z', now)).toBe(
      'há 5 dias',
    );
  });
});
