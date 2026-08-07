import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';

import type { StoredProcess } from '../src/process-state.js';
import { createExitTracker } from '../src/process-exit-tracking.js';

function fakeChild(): ReturnType<typeof spawn> {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    exitCode: null,
    signalCode: null,
  }) as unknown as ReturnType<typeof spawn>;
}

function fakeStoredProcess(
  projectId: string,
  kind: StoredProcess['kind'],
  pid: number,
): StoredProcess {
  return {
    id: `${projectId}-${kind}`,
    projectId,
    kind,
    pid,
    status: 'running',
    command: 'node',
    args: [],
    cwd: '/tmp',
    logPath: '/tmp/fake.log',
    startedAt: new Date().toISOString(),
  };
}

test(
  'waits for a managed process without an in-memory exit observer',
  { skip: process.platform === 'win32' },
  async (context) => {
    const child = spawn(
      process.execPath,
      ['-e', 'setInterval(() => {}, 60_000)'],
      { detached: true, stdio: 'ignore' },
    );

    assert.ok(child.pid);
    const pid = child.pid;
    child.unref();

    context.after(() => {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        // O processo já encerrou durante o teste.
      }
    });

    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });

    const tracker = createExitTracker({
      processDirectory: '/unused/processes',
      logDirectory: '/unused/logs',
    });

    setTimeout(() => {
      process.kill(-pid, 'SIGTERM');
    }, 50);

    assert.equal(
      await tracker.waitForManagedExit(
        'project-started-before-api-restart',
        'server',
        pid,
        1_000,
      ),
      true,
    );
  },
);

test('expurga um observador travado (exit/error nunca disparou) depois do TTL defensivo', async () => {
  let currentTime = 0;
  const tracker = createExitTracker(
    { processDirectory: '/unused/processes', logDirectory: '/unused/logs' },
    () => currentTime,
  );

  const stuckChild = fakeChild();
  tracker.observeChild(
    stuckChild,
    fakeStoredProcess('project-stuck', 'server', 4_001),
  );
  // stuckChild nunca emite 'exit' nem 'error' — simula o handle que nunca
  // dispara os eventos, deixando a entrada presa sem o expurgo defensivo.

  const shortTimeoutMs = 300;
  const timerToleranceMs = 25;
  const before = Date.now();
  const beforeSweep = await tracker.waitForObservedExit(
    'project-stuck',
    'server',
    4_001,
    shortTimeoutMs,
  );
  const elapsedBeforeSweep = Date.now() - before;

  assert.equal(beforeSweep, undefined);
  assert.ok(
    elapsedBeforeSweep >= shortTimeoutMs - timerToleranceMs,
    'sem o expurgo, esperava que a entrada travada segurasse aproximadamente até o timeout',
  );

  // Avança o relógio além do TTL defensivo (10 minutos) e dispara o expurgo
  // via um novo observeChild — o expurgo roda a cada novo processo iniciado.
  currentTime += 11 * 60 * 1_000;
  tracker.observeChild(
    fakeChild(),
    fakeStoredProcess('project-other', 'server', 4_002),
  );

  const after = Date.now();
  const afterSweep = await tracker.waitForObservedExit(
    'project-stuck',
    'server',
    4_001,
    shortTimeoutMs,
  );
  const elapsedAfterSweep = Date.now() - after;

  assert.equal(afterSweep, undefined);
  assert.ok(
    elapsedAfterSweep < shortTimeoutMs,
    'depois do expurgo, a entrada travada não deveria mais existir para esperar',
  );
});