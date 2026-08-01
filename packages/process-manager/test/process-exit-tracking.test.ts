import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';

import { createExitTracker } from '../src/process-exit-tracking.js';

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
