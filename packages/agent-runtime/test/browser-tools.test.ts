import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BrowserToolCallStore,
  BrowserToolCallStoreError,
  BrowserToolProtocolError,
  authorizeBrowserToolCall,
  browserToolsForCapabilities,
  buildBrowserToolPolicy,
  parseBrowserAgentEnvelope,
  type BrowserToolRequest,
} from '../src/index.js';

const fence = String.fromCharCode(96).repeat(3);

function toolRequest(
  overrides: Partial<BrowserToolRequest> = {},
): BrowserToolRequest {
  return {
    type: 'tool_request',
    toolCallId: 'call-1',
    tool: 'read_file',
    repo: 'project',
    args: { path: 'README.md' },
    ...overrides,
  };
}

test('browser envelope parser accepts one bounded structured request', () => {
  const envelope = [
    'before',
    fence + 'agent-workflow-browser',
    JSON.stringify(toolRequest()),
    fence,
    'after',
  ].join('\n');

  assert.deepEqual(parseBrowserAgentEnvelope(envelope), toolRequest());
});

test('browser envelope parser accepts a bounded terminal response message', () => {
  const terminal = {
    type: 'terminal_result',
    status: 'completed',
    message: 'Implemented the requested change and verified tests.',
  };
  const envelope = [
    fence + 'agent-workflow-browser',
    JSON.stringify(terminal),
    fence,
  ].join('\n');

  assert.deepEqual(parseBrowserAgentEnvelope(envelope), terminal);

  const oversized = [
    fence + 'agent-workflow-browser',
    JSON.stringify({ ...terminal, message: 'x'.repeat(16_001) }),
    fence,
  ].join('\n');
  assert.throws(
    () => parseBrowserAgentEnvelope(oversized),
    (error: unknown) =>
      error instanceof BrowserToolProtocolError &&
      error.code === 'invalid-tool-request',
  );
});

test('browser envelope parser rejects unknown fields and multiple envelopes', () => {
  const unknownField = [
    fence + 'agent-workflow-browser',
    JSON.stringify({ ...toolRequest(), cwd: '/tmp/project' }),
    fence,
  ].join('\n');

  assert.throws(
    () => parseBrowserAgentEnvelope(unknownField),
    (error: unknown) =>
      error instanceof BrowserToolProtocolError &&
      error.code === 'invalid-tool-request',
  );

  const one = [
    fence + 'agent-workflow-browser',
    JSON.stringify(toolRequest()),
    fence,
  ].join('\n');

  assert.throws(
    () => parseBrowserAgentEnvelope(one + '\n' + one),
    (error: unknown) =>
      error instanceof BrowserToolProtocolError &&
      error.code === 'browser-protocol-error',
  );
});

test('browser tool policy derives mutation access only from capabilities', () => {
  assert.deepEqual(browserToolsForCapabilities([]), [
    'list_files',
    'read_file',
    'search_text',
    'git_status',
    'git_diff',
    'git_log',
    'git_branch',
  ]);

  assert.ok(
    browserToolsForCapabilities(['workspace:write']).includes('apply_patch'),
  );

  const policy = buildBrowserToolPolicy({
    repositories: { project: '/workspace/project' },
    capabilities: [],
    tools: ['read_file', 'apply_patch'],
  });

  assert.deepEqual(
    authorizeBrowserToolCall({
      policy,
      tool: 'apply_patch',
      repo: 'project',
      args: { path: 'src/index.ts', patch: 'patch' },
    }),
    {
      allowed: false,
      code: 'authorization-denied',
      message: 'workspace:write capability is required',
    },
  );
});

test('browser tool policy blocks sensitive paths and unsafe processes', () => {
  const policy = buildBrowserToolPolicy({
    repositories: { project: '/workspace/project' },
    capabilities: ['workspace:write'],
  });

  assert.equal(
    authorizeBrowserToolCall({
      policy,
      tool: 'read_file',
      repo: 'project',
      args: { path: '.env' },
    }).code,
    'sensitive-path',
  );

  assert.equal(
    authorizeBrowserToolCall({
      policy,
      tool: 'read_file',
      repo: 'project',
      args: { path: '/etc/passwd' },
    }).code,
    'path-forbidden',
  );

  assert.equal(
    authorizeBrowserToolCall({
      policy,
      tool: 'run_process',
      repo: 'project',
      args: { executable: 'npm', argv: ['run', 'check && rm -rf /'] },
    }).code,
    'process-not-allowed',
  );

  assert.equal(
    authorizeBrowserToolCall({
      policy,
      tool: 'run_process',
      repo: 'project',
      args: { executable: 'npm', argv: ['run', 'check'] },
    }).allowed,
    true,
  );
});

test('browser tool store rejects toolCallId replay with a different payload', async () => {
  const stateDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-browser-tools-'),
  );

  try {
    const store = new BrowserToolCallStore({ stateDir });
    await store.prepare({ jobId: 'job-1', request: toolRequest() });

    await assert.rejects(
      () =>
        store.prepare({
          jobId: 'job-1',
          request: toolRequest({ args: { path: 'package.json' } }),
        }),
      (error: unknown) =>
        error instanceof BrowserToolCallStoreError &&
        error.code === 'tool-call-integrity-error',
    );
  } finally {
    await fs.rm(stateDir, { recursive: true, force: true });
  }
});

test('browser tool store preserves successful calls across replay', async () => {
  const stateDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-browser-tools-'),
  );

  try {
    const store = new BrowserToolCallStore({ stateDir });
    const request = toolRequest({
      tool: 'apply_patch',
      args: { path: 'src/index.ts', patch: 'patch' },
    });

    await store.prepare({ jobId: 'job-1', request });
    await store.markExecuting('job-1', 'call-1');
    await store.succeed('job-1', 'call-1', { applied: true });

    const replay = await store.prepare({ jobId: 'job-1', request });
    assert.equal(replay.state, 'succeeded');
    assert.deepEqual(replay.result, { applied: true });

    await assert.rejects(
      () => store.markExecuting('job-1', 'call-1'),
      (error: unknown) =>
        error instanceof BrowserToolCallStoreError &&
        error.code === 'tool-call-terminal',
    );
  } finally {
    await fs.rm(stateDir, { recursive: true, force: true });
  }
});

test('browser tool recovery retries reads but marks interrupted mutations ambiguous', async () => {
  const stateDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'dev-dashboard-browser-tools-'),
  );

  try {
    const store = new BrowserToolCallStore({ stateDir });

    await store.prepare({ jobId: 'job-1', request: toolRequest() });
    await store.markExecuting('job-1', 'call-1');

    const mutable = toolRequest({
      toolCallId: 'call-2',
      tool: 'apply_patch',
      args: { path: 'src/index.ts', patch: 'patch' },
    });
    await store.prepare({ jobId: 'job-1', request: mutable });
    await store.markExecuting('job-1', 'call-2');

    const recovered = await store.recover();
    assert.equal(recovered.length, 2);

    assert.equal((await store.get('job-1', 'call-1')).state, 'pending');
    const mutation = await store.get('job-1', 'call-2');
    assert.equal(mutation.state, 'ambiguous');
    assert.equal(mutation.error?.code, 'tool-call-ambiguous');
  } finally {
    await fs.rm(stateDir, { recursive: true, force: true });
  }
});
