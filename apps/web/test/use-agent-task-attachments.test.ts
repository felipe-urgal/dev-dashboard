import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

import {
  type AgentAttachment,
  type createAgentAttachment,
} from '../src/api/agent-runtime';
import { useAgentTaskAttachments } from '../src/composables/useAgentTaskAttachments';

const file = (name: string, type = 'text/plain', size = 5): File =>
  ({ name, type, size }) as File;
const input = (...files: File[]): Event =>
  ({ target: { files, value: 'selected' } }) as unknown as Event;
const attachment = (id: string, taskId: string): AgentAttachment => ({
  id,
  taskId,
  filename: id + '.txt',
  mediaType: 'text/plain',
  byteSize: 5,
  sha256: 'hash',
  source: 'user-upload',
  createdAt: '2026-10-23T12:00:00Z',
});

function attachmentIds(
  state: ReturnType<typeof useAgentTaskAttachments>,
): string[] {
  return state.attachments.value.map((item) => item.id);
}

function harness() {
  const target = { projectId: 'p-a', taskId: 't-a' };
  const errors: string[] = [];
  const reads: Array<{
    resolve: (value: string) => void;
    reject: (error: Error) => void;
  }> = [];
  const writes: Array<{
    projectId: string;
    taskId: string;
    filename: string;
    resolve: (value: AgentAttachment) => void;
    reject: (error: Error) => void;
  }> = [];
  const create: typeof createAgentAttachment = (projectId, taskId, payload) =>
    new Promise((resolve, reject) =>
      writes.push({
        projectId,
        taskId,
        filename: payload.filename,
        resolve,
        reject,
      }),
    );
  const state = useAgentTaskAttachments(
    () => target,
    (message) => errors.push(message),
    () => {},
    {
      create,
      readBase64: () =>
        new Promise((resolve, reject) => reads.push({ resolve, reject })),
    },
  );
  return { target, errors, reads, writes, state };
}

test('file read from A cannot upload after A → B → A or reset', async () => {
  const h = harness();
  const pending = h.state.addAttachments(
    input(file('one.txt'), file('two.txt')),
  );
  assert.equal(h.reads.length, 1);
  h.target.taskId = 't-b';
  h.state.resetAttachments();
  h.target.taskId = 't-a';
  h.state.resetAttachments();
  h.reads[0]!.resolve('Zmlyc3Q=');
  await pending;
  assert.equal(h.writes.length, 0);
  assert.deepEqual(h.state.attachments.value, []);
  assert.equal(h.state.uploadingAttachment.value, false);
});

test('in-flight server write stays on A; old result cannot pollute or unlock B', async () => {
  const h = harness();
  const old = h.state.addAttachments(
    input(file('old.txt'), file('second.txt')),
  );
  h.reads[0]!.resolve('b2xk');
  await Promise.resolve();
  assert.deepEqual(
    [h.writes[0]?.projectId, h.writes[0]?.taskId],
    ['p-a', 't-a'],
  );
  h.target.taskId = 't-b';
  h.state.resetAttachments();
  const current = h.state.addAttachments(input(file('new.txt')));
  h.reads[1]!.resolve('bmV3');
  await Promise.resolve();
  h.writes[0]!.resolve(attachment('old', 't-a'));
  await old;
  assert.equal(h.reads.length, 2);
  assert.equal(h.state.uploadingAttachment.value, true);
  assert.deepEqual(h.state.attachments.value, []);
  assert.equal(h.writes[1]?.taskId, 't-b');
  h.writes[1]!.resolve(attachment('new', 't-b'));
  await current;
  assert.deepEqual(attachmentIds(h.state), ['new']);
  assert.deepEqual(h.state.selectedAttachmentIds.value, ['new']);
  assert.equal(h.state.uploadingAttachment.value, false);
});

test('stale upload error after project change is ignored; current error can retry', async () => {
  const h = harness();
  const old = h.state.addAttachments(input(file('old.txt')));
  h.reads[0]!.resolve('b2xk');
  await Promise.resolve();
  h.target.projectId = 'p-b';
  h.state.resetAttachments();
  h.state.applyLoadedAttachments([attachment('present', 't-a')], 'p-b', 't-a');
  h.writes[0]!.reject(new Error('stale secret'));
  await old;
  assert.deepEqual(h.errors, []);
  assert.deepEqual(attachmentIds(h.state), ['present']);

  const current = h.state.addAttachments(input(file('new.txt')));
  h.reads[1]!.resolve('bmV3');
  await Promise.resolve();
  h.writes[1]!.reject(new Error('API unavailable'));
  await current;
  assert.deepEqual(h.errors, ['API unavailable']);
  assert.equal(h.state.uploadingAttachment.value, false);
  const retry = h.state.addAttachments(input(file('retry.txt')));
  h.reads[2]!.resolve('cmV0cnk=');
  await Promise.resolve();
  h.writes[2]!.resolve(attachment('retry', 't-a'));
  await retry;
  assert.deepEqual(attachmentIds(h.state), ['present', 'retry']);
});

test('validation enforces 8 attachments, 1 MB and accepted media types before API', async () => {
  const h = harness();
  await h.state.addAttachments(
    input(file('huge.txt', 'text/plain', 1024 * 1024 + 1)),
  );
  assert.match(h.errors.at(-1) ?? '', /1 MB/);
  await h.state.addAttachments(input(file('script.sh', 'text/x-shellscript')));
  assert.match(h.errors.at(-1) ?? '', /não suportado/);
  h.state.applyLoadedAttachments(
    Array.from({ length: 8 }, (_, index) => attachment(String(index), 't-a')),
    'p-a',
    't-a',
  );
  await h.state.addAttachments(input(file('ninth.txt')));
  assert.match(h.errors.at(-1) ?? '', /no máximo 8/);
  assert.equal(h.reads.length, 0);
  assert.equal(h.writes.length, 0);
});

test('snapshot filters selection and refuses different task', () => {
  const h = harness();
  h.state.applyLoadedAttachments(
    [attachment('a', 't-a'), attachment('b', 't-a')],
    'p-a',
    't-a',
  );
  h.state.selectedAttachmentIds.value = ['a', 'invalid'];
  h.state.applyLoadedAttachments([attachment('b', 't-a')], 'p-a', 't-a');
  assert.deepEqual(h.state.selectedAttachmentIds.value, []);
  h.state.applyLoadedAttachments([attachment('other', 't-b')], 'p-a', 't-b');
  assert.deepEqual(attachmentIds(h.state), ['b']);
  assert.equal(h.state.attachmentFor('b')?.filename, 'b.txt');
  h.state.resetAttachments();
  assert.equal(h.state.attachmentFor('b'), undefined);
});

test('cockpit delegates attachment ownership and clears it on project and task changes', () => {
  const panel = readFileSync(
    resolve(import.meta.dirname, '../src/components/ProjectAgentPanel.vue'),
    'utf8',
  );
  assert.match(panel, /useAgentTaskAttachments\(/);
  assert.match(panel, /useAgentTaskDetailReads\(/);
  assert.match(panel, /applyLoadedAttachments\(/);
  assert.match(panel, /attachmentsRevision/);
  assert.match(panel, /resetAttachments\(\)/);
  assert.doesNotMatch(panel, /async function addAttachments\(/);
  assert.doesNotMatch(panel, /attachments\.value\s*=/);
});

test('stale read error after task change is discarded', async () => {
  const h = harness();
  const pending = h.state.addAttachments(input(file('abandoned.txt')));
  h.target.taskId = 't-b';
  h.state.resetAttachments();
  h.reads[0]!.reject(new Error('old private file error'));
  await pending;
  assert.deepEqual(h.errors, []);
  assert.equal(h.state.uploadingAttachment.value, false);
  assert.equal(h.writes.length, 0);
});

test('snapshot racing with upload response does not duplicate attachment IDs', async () => {
  const h = harness();
  const pending = h.state.addAttachments(input(file('same.txt')));
  h.reads[0]!.resolve('c2FtZQ==');
  await Promise.resolve();
  h.state.applyLoadedAttachments([attachment('same', 't-a')], 'p-a', 't-a');
  h.state.selectedAttachmentIds.value = ['same'];
  h.writes[0]!.resolve(attachment('same', 't-a'));
  await pending;
  assert.deepEqual(attachmentIds(h.state), ['same']);
  assert.deepEqual(h.state.selectedAttachmentIds.value, ['same']);
});

test('attachment revision invalidates snapshots started before upload', async () => {
  const h = harness();
  const initial = h.state.attachmentsRevision();
  h.state.applyLoadedAttachments(
    [attachment('present', 't-a')],
    'p-a',
    't-a',
  );
  assert.equal(h.state.attachmentsRevision(), initial);

  const pending = h.state.addAttachments(input(file('new.txt')));
  assert.equal(h.state.attachmentsRevision(), initial + 1);
  h.target.taskId = 't-b';
  h.state.resetAttachments();
  h.reads[0]!.resolve('bmV3');
  await pending;
  assert.equal(h.state.attachmentsRevision(), initial + 2);
  assert.deepEqual(h.state.attachments.value, []);
});
