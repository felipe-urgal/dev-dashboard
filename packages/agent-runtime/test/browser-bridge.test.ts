import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BrowserBridge,
  BrowserJobStore,
  BrowserToolExecutionError,
  HttpBrowserBridgeClient,
  browserToolsForCapabilities,
  readBrowserBridgeToken,
  buildBrowserToolPolicy,
  createBrowserToolExecutor,
  type BrowserToolExecutor,
} from '../src/index.js';

function initRepo(root: string): void {
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['config', 'user.email', 'agent@example.test'], {
    cwd: root,
  });
  execFileSync('git', ['config', 'user.name', 'Agent Test'], { cwd: root });
}

async function requestJson(
  baseUrl: string,
  token: string,
  pathname: string,
  options: {
    method?: 'GET' | 'POST';
    body?: unknown;
    leaseId?: string;
  } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method ?? 'GET',
    headers: {
      'x-agent-bridge-token': token,
      ...(options.leaseId ? { 'x-agent-job-lease': options.leaseId } : {}),
      ...(options.body === undefined
        ? {}
        : { 'content-type': 'application/json' }),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

test('browser job recovery marks interrupted running work unknown', async () => {
  const stateDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-browser-jobs-'),
  );
  const repo = await fs.mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-browser-repo-'),
  );

  try {
    const store = new BrowserJobStore({ stateDir });
    const created = await store.create({
      prompt: 'test browser recovery',
      cwd: repo,
      agent: 'chatgpt-browser',
      taskId: 'task-1',
      timeoutMs: 60_000,
      repositories: { project: repo },
      capabilities: {},
      tools: ['read_file'],
    });
    const claimed = await store.claim(created.id);
    assert.ok(claimed.leaseId);

    await store.markRunning(created.id, claimed.leaseId as string);

    const recoveredStore = new BrowserJobStore({ stateDir });
    const recovered = await recoveredStore.recover();
    assert.equal(recovered.length, 1);

    const after = await recoveredStore.get(created.id);
    assert.equal(after.state, 'failed');
    assert.equal(after.errorCode, 'unknown_after_submit');
    assert.equal(after.browserPhase, 'restart_recovery');
  } finally {
    await fs.rm(stateDir, { recursive: true, force: true });
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test('browser bridge preserva token gerado após restart', async () => {
  const stateDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-browser-token-'),
  );
  let first: BrowserBridge | null = null;
  let second: BrowserBridge | null = null;

  try {
    first = new BrowserBridge({ stateDir, port: 0 });
    await first.start();
    const before = await readBrowserBridgeToken(stateDir);
    assert.match(before, /^[a-f0-9]{64}$/i);
    await first.close();
    first = null;

    second = new BrowserBridge({ stateDir, port: 0 });
    await second.start();
    const after = await readBrowserBridgeToken(stateDir);

    assert.equal(after, before);
  } finally {
    await first?.close();
    await second?.close();
    await fs.rm(stateDir, { recursive: true, force: true });
  }
});

test('browser tool executor confines reads and applies one-file patches', async () => {
  const repo = await fs.mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-browser-executor-'),
  );

  try {
    initRepo(repo);
    await fs.writeFile(path.join(repo, 'sample.txt'), 'before\n');

    const policy = buildBrowserToolPolicy({
      repositories: { project: repo },
      capabilities: ['workspace:write'],
    });
    const executor = createBrowserToolExecutor({
      repoRoots: { project: repo },
      policy,
    });

    const read = (await executor.execute({
      type: 'tool_request',
      toolCallId: 'read-1',
      tool: 'read_file',
      repo: 'project',
      args: { path: 'sample.txt' },
    })) as Record<string, unknown>;

    assert.equal(read.content, 'before\n');

    const patch = [
      '--- a/sample.txt',
      '+++ b/sample.txt',
      '@@ -1 +1 @@',
      '-before',
      '+after',
      '',
    ].join('\n');

    const applied = (await executor.execute({
      type: 'tool_request',
      toolCallId: 'patch-1',
      tool: 'apply_patch',
      repo: 'project',
      args: { path: 'sample.txt', patch },
    })) as Record<string, unknown>;

    assert.equal(applied.applied, true);
    assert.equal(
      await fs.readFile(path.join(repo, 'sample.txt'), 'utf8'),
      'after\n',
    );

    await assert.rejects(
      () =>
        executor.execute({
          type: 'tool_request',
          toolCallId: 'read-secret',
          tool: 'read_file',
          repo: 'project',
          args: { path: '.env' },
        }),
      (error: unknown) =>
        error instanceof BrowserToolExecutionError &&
        error.code === 'sensitive-path',
    );
  } finally {
    await fs.rm(repo, { recursive: true, force: true });
  }
});

test('loopback bridge runs claimed jobs and replays mutable tool calls exactly once', async () => {
  const stateDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-browser-bridge-'),
  );
  const repo = await fs.mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-browser-workspace-'),
  );
  const token = 'test-private-browser-token';
  let mutableExecutions = 0;
  let bridge: BrowserBridge | null = null;

  try {
    initRepo(repo);
    await fs.writeFile(path.join(repo, 'sample.txt'), 'before\n');

    bridge = new BrowserBridge({
      stateDir,
      port: 0,
      token,
      toolExecutorFactory: ({ job, policy }): BrowserToolExecutor => {
        const delegate = createBrowserToolExecutor({
          repoRoots: job.repositories,
          policy,
        });
        return {
          async execute(request) {
            if (request.tool === 'apply_patch') mutableExecutions += 1;
            return delegate.execute(request);
          },
        };
      },
    });

    const address = await bridge.start();
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const client = new HttpBrowserBridgeClient({
      token,
      port: address.port,
    });

    const unauthorized = await fetch(`${baseUrl}/v1/health`);
    assert.equal(unauthorized.status, 401);

    const firstHealth = await client.health();
    assert.equal(firstHealth.ok, true);
    assert.equal(firstHealth.heartbeatAt, null);

    const heartbeat = await requestJson(baseUrl, token, '/v1/heartbeat', {
      method: 'POST',
      body: { version: 'test-extension', sessionState: 'available' },
    });
    assert.equal(heartbeat.status, 200);

    const health = await client.health();
    assert.equal(health.sessionState, 'available');
    assert.equal(health.heartbeatVersion, 'test-extension');

    const created = await client.createJob({
      prompt: 'edit sample.txt using structured tools',
      cwd: repo,
      agent: 'chatgpt-browser',
      taskId: 'task-bridge',
      timeoutMs: 60_000,
      repositories: { project: repo },
      capabilities: { 'workspace:write': true },
      tools: browserToolsForCapabilities(['workspace:write']),
    });
    assert.equal(created.state, 'queued');

    const next = await requestJson(baseUrl, token, '/v1/jobs/next');
    assert.equal(next.status, 200);
    assert.equal(next.body.id, created.id);
    assert.equal('cwd' in next.body, false);
    assert.equal('prompt' in next.body, false);

    const claimed = await requestJson(
      baseUrl,
      token,
      `/v1/jobs/${created.id}/claim`,
      { method: 'POST', body: {} },
    );
    assert.equal(claimed.status, 200);
    assert.equal(claimed.body.prompt, 'edit sample.txt using structured tools');
    assert.equal('cwd' in claimed.body, false);
    assert.equal(typeof claimed.body.leaseId, 'string');
    const leaseId = claimed.body.leaseId as string;

    const running = await requestJson(
      baseUrl,
      token,
      `/v1/jobs/${created.id}/running`,
      { method: 'POST', body: { leaseId } },
    );
    assert.equal(running.status, 200);
    assert.equal(running.body.state, 'running');

    const readRequest = {
      type: 'tool_request',
      toolCallId: 'read-1',
      tool: 'read_file',
      repo: 'project',
      args: { path: 'sample.txt' },
    };
    const read = await requestJson(
      baseUrl,
      token,
      `/v1/jobs/${created.id}/tools/read-1/execute`,
      { method: 'POST', body: readRequest, leaseId },
    );
    assert.equal(read.status, 200);
    assert.equal(read.body.type, 'tool_result');

    const rejectedPatchRequest = {
      type: 'tool_request',
      toolCallId: 'patch-rejected',
      tool: 'apply_patch',
      repo: 'project',
      args: {
        path: 'sample.txt',
        patch: [
          '--- a/sample.txt',
          '+++ b/sample.txt',
          '@@ -1 +1 @@',
          '-does-not-match',
          '+after',
          '',
        ].join('\n'),
      },
    };
    const rejectedPatch = await requestJson(
      baseUrl,
      token,
      `/v1/jobs/${created.id}/tools/patch-rejected/execute`,
      { method: 'POST', body: rejectedPatchRequest, leaseId },
    );
    assert.equal(rejectedPatch.status, 200);
    assert.equal(rejectedPatch.body.type, 'tool_error');
    assert.equal(rejectedPatch.body.code, 'patch-failed');

    const rejectedStatus = await requestJson(
      baseUrl,
      token,
      `/v1/jobs/${created.id}/tools/patch-rejected`,
      { leaseId },
    );
    assert.equal(rejectedStatus.status, 200);
    assert.equal(rejectedStatus.body.state, 'failed');
    assert.equal(mutableExecutions, 1);

    const patch = [
      '--- a/sample.txt',
      '+++ b/sample.txt',
      '@@ -1 +1 @@',
      '-before',
      '+after',
      '',
    ].join('\n');
    const patchRequest = {
      type: 'tool_request',
      toolCallId: 'patch-1',
      tool: 'apply_patch',
      repo: 'project',
      args: { path: 'sample.txt', patch },
    };

    const firstPatch = await requestJson(
      baseUrl,
      token,
      `/v1/jobs/${created.id}/tools/patch-1/execute`,
      { method: 'POST', body: patchRequest, leaseId },
    );
    assert.equal(firstPatch.status, 200);
    assert.equal(firstPatch.body.type, 'tool_result');
    assert.equal(mutableExecutions, 2);

    const replay = await requestJson(
      baseUrl,
      token,
      `/v1/jobs/${created.id}/tools/patch-1/execute`,
      { method: 'POST', body: patchRequest, leaseId },
    );
    assert.deepEqual(replay.body, firstPatch.body);
    assert.equal(mutableExecutions, 2);
    assert.equal(
      await fs.readFile(path.join(repo, 'sample.txt'), 'utf8'),
      'after\n',
    );

    const finished = await requestJson(
      baseUrl,
      token,
      `/v1/jobs/${created.id}/finish`,
      {
        method: 'POST',
        body: {
          leaseId,
          terminalResult: {
            type: 'terminal_result',
            status: 'completed',
            message:
              'sample.txt updated. OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz',
          },
        },
      },
    );
    assert.equal(finished.status, 200);
    assert.equal(finished.body.state, 'finished');
    assert.equal(
      finished.body.responseText,
      'sample.txt updated. OPENAI_API_KEY=[REDACTED]',
    );

    const persisted = await client.getJob(created.id);
    assert.equal(persisted.state, 'finished');
    assert.equal(
      persisted.responseText,
      'sample.txt updated. OPENAI_API_KEY=[REDACTED]',
    );
  } finally {
    await bridge?.close();
    await fs.rm(stateDir, { recursive: true, force: true });
    await fs.rm(repo, { recursive: true, force: true });
  }
});
