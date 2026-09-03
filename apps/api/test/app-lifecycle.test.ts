import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const TOKEN = 'f'.repeat(64);

test('buildApp fecha o serviço compartilhado de PTYs destacáveis no shutdown', async () => {
  const fixtureRoot = await mkdtemp(
    path.join(tmpdir(), 'dev-dashboard-api-lifecycle-'),
  );
  const previousStateDirectory = process.env.DEV_DASHBOARD_STATE_DIR;
  process.env.DEV_DASHBOARD_STATE_DIR = path.join(fixtureRoot, 'state');

  try {
    const [{ buildApp }, { createAppContext }] = await Promise.all([
      import('../src/app.js'),
      import('../src/app-context.js'),
    ]);
    const context = createAppContext();
    const detachableExecutionService = context.detachableExecutionService;
    assert.ok(detachableExecutionService);

    let closeCalls = 0;
    const originalClose = detachableExecutionService.close.bind(
      detachableExecutionService,
    );
    detachableExecutionService.close = async () => {
      closeCalls += 1;
      await originalClose();
    };

    const app = await buildApp({ localToken: TOKEN, context });
    await app.close();

    assert.equal(closeCalls, 1);
  } finally {
    if (previousStateDirectory === undefined) {
      delete process.env.DEV_DASHBOARD_STATE_DIR;
    } else {
      process.env.DEV_DASHBOARD_STATE_DIR = previousStateDirectory;
    }
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
