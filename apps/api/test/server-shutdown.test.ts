import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createServerShutdown,
  DEFAULT_API_SHUTDOWN_TIMEOUT_MS,
  type ShutdownApp,
} from '../src/server-shutdown.js';

function createLogger() {
  return {
    info() {},
    error() {},
  };
}

test('shutdown encerra graciosamente e limpa o deadline', async () => {
  let cleared = 0;
  const exits: number[] = [];
  const app: ShutdownApp = {
    close: async () => undefined,
    log: createLogger(),
  };
  const shutdown = createServerShutdown(app, {
    exit: (code) => exits.push(code),
    schedule: () => ({
      clear() {
        cleared += 1;
      },
    }),
  });

  await shutdown('SIGTERM');

  assert.deepEqual(exits, [0]);
  assert.equal(cleared, 1);
});

test('shutdown força exit antes do timeout do worker quando app.close fica preso', () => {
  let scheduled: (() => void) | undefined;
  let scheduledTimeout = 0;
  const exits: number[] = [];
  const app: ShutdownApp = {
    close: async () => await new Promise<void>(() => undefined),
    log: createLogger(),
  };
  const shutdown = createServerShutdown(app, {
    exit: (code) => exits.push(code),
    schedule: (callback, timeoutMs) => {
      scheduled = callback;
      scheduledTimeout = timeoutMs;
      return { clear() {} };
    },
  });

  void shutdown('SIGTERM');

  assert.equal(scheduledTimeout, DEFAULT_API_SHUTDOWN_TIMEOUT_MS);
  assert.ok(scheduled);
  scheduled();
  assert.deepEqual(exits, [0]);
});

test('shutdown com falha real sai com código de erro', async () => {
  let cleared = 0;
  const exits: number[] = [];
  const app: ShutdownApp = {
    close: async () => {
      throw new Error('close failed');
    },
    log: createLogger(),
  };
  const shutdown = createServerShutdown(app, {
    exit: (code) => exits.push(code),
    schedule: () => ({
      clear() {
        cleared += 1;
      },
    }),
  });

  await shutdown('SIGINT');

  assert.deepEqual(exits, [1]);
  assert.equal(cleared, 1);
});

test('shutdown é idempotente quando mais de um sinal chega', () => {
  let closeCalls = 0;
  const app: ShutdownApp = {
    close: async () => {
      closeCalls += 1;
      await new Promise<void>(() => undefined);
    },
    log: createLogger(),
  };
  const shutdown = createServerShutdown(app, {
    exit: () => undefined,
    schedule: () => ({ clear() {} }),
  });

  const first = shutdown('SIGTERM');
  const second = shutdown('SIGINT');

  assert.equal(first, second);
  assert.equal(closeCalls, 1);
});
