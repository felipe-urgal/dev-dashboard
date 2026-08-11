import assert from 'node:assert/strict';
import test from 'node:test';

import type { ProcessLogSnapshot } from '@dev-dashboard/contracts';

import { streamLogSnapshots } from '../src/http/log-event-stream.js';

function snapshot(
  overrides: Partial<ProcessLogSnapshot> = {},
): ProcessLogSnapshot {
  return {
    projectId: 'projeto-1',
    processId: 'srv-projeto-1',
    content: 'linha 1\n',
    sizeBytes: 8,
    truncated: false,
    masked: false,
    redactionCount: 0,
    updatedAt: '2026-08-11T10:00:00.000Z',
    readAt: '2026-08-11T10:00:00.500Z',
    ...overrides,
  };
}

function createFakeReply() {
  const written: string[] = [];
  let ended = false;
  let closeHandler: (() => void) | undefined;

  const reply = {
    hijack: () => undefined,
    raw: {
      writeHead: () => undefined,
      write: (chunk: string) => {
        written.push(chunk);
        return true;
      },
      end: () => {
        ended = true;
      },
      get writableEnded() {
        return ended;
      },
      once: (event: string, handler: () => void) => {
        if (event === 'close') closeHandler = handler;
      },
    },
  };

  return {
    reply,
    written,
    isEnded: () => ended,
    triggerClose: () => closeHandler?.(),
  };
}

test('streamLogSnapshots envia o snapshot inicial imediatamente', () => {
  const { reply, written } = createFakeReply();

  streamLogSnapshots(reply as never, snapshot(), async () => snapshot());

  assert.equal(written.length, 1);
  assert.match(written[0], /"content":"linha 1\\n"/);
});

test('streamLogSnapshots só reemite quando updatedAt/sizeBytes mudam', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });

  const { reply, written } = createFakeReply();
  const unchanged = snapshot();
  let readCalls = 0;
  const readNext = async () => {
    readCalls += 1;
    return unchanged;
  };

  streamLogSnapshots(reply as never, unchanged, readNext);
  assert.equal(written.length, 1);

  t.mock.timers.tick(1_000);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(readCalls, 1);
  assert.equal(
    written.length,
    1,
    'não deveria reemitir quando o snapshot não mudou',
  );
});

test('streamLogSnapshots reemite quando o log muda e encerra ao desconectar', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });

  const { reply, written, isEnded, triggerClose } = createFakeReply();
  const initial = snapshot();
  const changed = snapshot({
    content: 'linha 1\nlinha 2\n',
    sizeBytes: 16,
    updatedAt: '2026-08-11T10:00:02.000Z',
  });

  let readCalls = 0;
  const readNext = async () => {
    readCalls += 1;
    return changed;
  };

  streamLogSnapshots(reply as never, initial, readNext);
  assert.equal(written.length, 1);

  t.mock.timers.tick(1_000);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(readCalls, 1);
  assert.equal(written.length, 2);
  assert.match(written[1], /linha 2/);

  triggerClose();
  assert.equal(isEnded(), true);
});

test('streamLogSnapshots encerra o stream quando readNext falha', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });

  const { reply, isEnded } = createFakeReply();
  const readNext = async () => {
    throw new Error('processo não encontrado');
  };

  streamLogSnapshots(reply as never, snapshot(), readNext);
  assert.equal(isEnded(), false);

  t.mock.timers.tick(1_000);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(isEnded(), true);
});
