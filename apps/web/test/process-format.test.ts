import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { ManagedProcess } from '@dev-dashboard/contracts';

import {
  formatDuration,
  kindLabel,
  processDetailPath,
  processDurationReference,
  processStatusLabel,
} from '../src/utils/process-format.js';
import { processToneFor } from '../src/utils/status-tones.js';

test('labels cobrem todos os kinds e status suportados', () => {
  assert.equal(kindLabel('server'), 'Servidor');
  assert.equal(kindLabel('test'), 'Testes');
  assert.equal(kindLabel('webpack'), 'Webpack');
  assert.equal(processStatusLabel('starting'), 'Iniciando');
  assert.equal(processStatusLabel('running'), 'Em execução');
  assert.equal(processStatusLabel('stopping'), 'Encerrando');
  assert.equal(processStatusLabel('stopped'), 'Parado');
  assert.equal(processStatusLabel('failed'), 'Falhou');
  assert.equal(processToneFor('running'), 'success');
  assert.equal(processToneFor('failed'), 'danger');
  assert.equal(processToneFor('stopped'), 'warning');
  assert.equal(processToneFor('starting'), 'info');
  assert.equal(processToneFor('stopping'), 'info');
});

test('processDetailPath aponta test para /tests e demais kinds para a raiz do projeto', () => {
  const base = {
    id: 'x',
    projectId: 'p one',
    workspaceId: 'w1',
    status: 'running' as const,
    startedAt: '2026-07-26T10:00:00Z',
  };
  assert.equal(
    processDetailPath({ ...base, kind: 'test' }),
    '/projects/p%20one/tests',
  );
  assert.equal(
    processDetailPath({ ...base, kind: 'server' }),
    '/projects/p%20one',
  );
});

test('formatDuration formata segundos, minutos e horas relativos ao instante de referência', () => {
  const reference = new Date('2026-07-26T10:00:00Z').getTime();
  assert.equal(formatDuration('2026-07-26T09:59:30Z', reference), '30s');
  assert.equal(formatDuration('2026-07-26T09:57:15Z', reference), '2m 45s');
  assert.equal(formatDuration('2026-07-26T07:30:00Z', reference), '2h 30m');
  assert.equal(formatDuration(undefined, reference), '—');
});

test('processDurationReference congela a duração de processos terminais em stoppedAt', () => {
  const now = new Date('2026-07-26T10:00:00Z').getTime();
  const base: Omit<ManagedProcess, 'status'> = {
    id: 'p',
    projectId: 'p1',
    kind: 'server',
    startedAt: '2026-07-26T08:00:00Z',
    stoppedAt: '2026-07-26T08:05:00Z',
  };

  const stopped: ManagedProcess = { ...base, status: 'stopped' };
  assert.equal(
    processDurationReference(stopped, now),
    new Date('2026-07-26T08:05:00Z').getTime(),
  );
  assert.equal(
    formatDuration(stopped.startedAt, processDurationReference(stopped, now)),
    '5m 0s',
  );

  const failed: ManagedProcess = { ...base, status: 'failed' };
  assert.equal(
    formatDuration(failed.startedAt, processDurationReference(failed, now)),
    '5m 0s',
  );

  const running: ManagedProcess = { ...base, status: 'running' };
  assert.equal(processDurationReference(running, now), now);

  const { stoppedAt: _stopped, ...withoutStoppedAt } = base;
  const stoppedWithoutStoppedAt: ManagedProcess = {
    ...withoutStoppedAt,
    status: 'stopped',
  };
  assert.equal(processDurationReference(stoppedWithoutStoppedAt, now), now);
});
