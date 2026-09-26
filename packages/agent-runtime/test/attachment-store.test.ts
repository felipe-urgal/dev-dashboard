import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AgentAttachmentStore,
  AgentAttachmentStoreError,
} from '../src/index.js';

test('AgentAttachmentStore persiste metadata e redige preview textual', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-attachments-'));
  context.after(() => rm(root, { recursive: true, force: true }));

  const store = new AgentAttachmentStore({
    stateDirectory: root,
    createId: () => 'attachment-1',
    now: () => '2026-09-26T18:45:00.000Z',
  });

  const created = await store.create('task-1', {
    filename: 'ci.log',
    mediaType: 'text/plain',
    contentBase64: Buffer.from(
      'failure\nOPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz',
    ).toString('base64'),
  });

  assert.equal(created.id, 'attachment-1');
  assert.equal(created.filename, 'ci.log');
  assert.match(created.textPreview ?? '', /\[REDACTED\]/);
  assert.doesNotMatch(created.textPreview ?? '', /sk-abcdefghijklmnopqrstuvwxyz/);

  const restarted = new AgentAttachmentStore({ stateDirectory: root });
  assert.deepEqual(await restarted.list('task-1'), [created]);
});

test('AgentAttachmentStore rejeita tipo, filename e tamanho inválidos', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-attachments-invalid-'));
  context.after(() => rm(root, { recursive: true, force: true }));

  const store = new AgentAttachmentStore({
    stateDirectory: root,
    maxBytes: 4,
  });

  await assert.rejects(
    store.create('task-1', {
      filename: '../secret.txt',
      mediaType: 'text/plain',
      contentBase64: Buffer.from('x').toString('base64'),
    }),
    AgentAttachmentStoreError,
  );

  await assert.rejects(
    store.create('task-1', {
      filename: 'large.txt',
      mediaType: 'text/plain',
      contentBase64: Buffer.from('12345').toString('base64'),
    }),
    (error: unknown) =>
      error instanceof AgentAttachmentStoreError &&
      error.code === 'AGENT_ATTACHMENT_LIMIT',
  );

  await assert.rejects(
    store.create('task-1', {
      filename: 'script.sh',
      mediaType: 'application/x-sh' as never,
      contentBase64: Buffer.from('echo nope').toString('base64'),
    }),
    AgentAttachmentStoreError,
  );
});

test('AgentAttachmentStore limita quantidade por task', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-attachments-count-'));
  context.after(() => rm(root, { recursive: true, force: true }));

  let id = 0;
  const store = new AgentAttachmentStore({
    stateDirectory: root,
    maxAttachments: 1,
    createId: () => 'attachment-' + ++id,
  });

  await store.create('task-1', {
    filename: 'one.txt',
    mediaType: 'text/plain',
    contentBase64: Buffer.from('one').toString('base64'),
  });
  await assert.rejects(
    store.create('task-1', {
      filename: 'two.txt',
      mediaType: 'text/plain',
      contentBase64: Buffer.from('two').toString('base64'),
    }),
    (error: unknown) =>
      error instanceof AgentAttachmentStoreError &&
      error.code === 'AGENT_ATTACHMENT_LIMIT',
  );
});
