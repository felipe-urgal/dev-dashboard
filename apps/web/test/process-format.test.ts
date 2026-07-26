import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  formatDuration,
  kindLabel,
  processDetailPath,
  processStatusLabel,
  processStatusToneClass,
} from '../src/utils/process-format.js';

test('labels cobrem todos os kinds e status suportados', () => {
  assert.equal(kindLabel('server'), 'Servidor');
  assert.equal(kindLabel('test'), 'Testes');
  assert.equal(kindLabel('webpack'), 'Webpack');
  assert.equal(processStatusLabel('starting'), 'Iniciando');
  assert.equal(processStatusLabel('running'), 'Em execução');
  assert.equal(processStatusLabel('stopping'), 'Encerrando');
  assert.equal(processStatusLabel('stopped'), 'Parado');
  assert.equal(processStatusLabel('failed'), 'Falhou');
  assert.equal(processStatusToneClass('running'), 'activity-status-succeeded');
  assert.equal(processStatusToneClass('failed'), 'activity-status-failed');
  assert.equal(processStatusToneClass('stopped'), 'activity-status-cancelled');
});

test('processDetailPath aponta test para /tests e demais kinds para a raiz do projeto', () => {
  const base = {
    id: 'x', projectId: 'p one', workspaceId: 'w1', status: 'running' as const,
    startedAt: '2026-07-26T10:00:00Z',
  };
  assert.equal(processDetailPath({ ...base, kind: 'test' }), '/projects/p%20one/tests');
  assert.equal(processDetailPath({ ...base, kind: 'server' }), '/projects/p%20one');
});

test('formatDuration formata segundos, minutos e horas relativos ao instante de referência', () => {
  const reference = new Date('2026-07-26T10:00:00Z').getTime();
  assert.equal(formatDuration('2026-07-26T09:59:30Z', reference), '30s');
  assert.equal(formatDuration('2026-07-26T09:57:15Z', reference), '2m 45s');
  assert.equal(formatDuration('2026-07-26T07:30:00Z', reference), '2h 30m');
  assert.equal(formatDuration(undefined, reference), '—');
});
