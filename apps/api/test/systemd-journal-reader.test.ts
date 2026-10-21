import assert from 'node:assert/strict';
import test from 'node:test';

import { SystemdJournalReader } from '../src/services/systemd-journal-reader.js';

test('journal reader is read-only, sanitizes content and bounds UTF-8', async () => {
  const observed: string[] = [];
  const reader = new SystemdJournalReader({
    platform: 'linux',
    runner: async (scope, unit) => {
      observed.push(scope + ':' + unit);
      return 'PASSWORD=my-super-secret-password\n' + '😀'.repeat(25_000);
    },
  });
  const result = await reader.read('user', 'fixture.service');
  assert.deepEqual(observed, ['user:fixture.service']);
  assert.equal(result.status, 'available');
  assert.equal(result.truncated, true);
  assert.ok(Buffer.byteLength(result.content ?? '') <= 65_536);
  assert.doesNotMatch(result.content ?? '', /my-super-secret-password/);
  assert.doesNotMatch(result.content ?? '', /\uFFFD/);
});

test('masks a long secret assignment before the journal UTF-8 tail is bounded', async () => {
  const secret = 'extremely-sensitive-sequence'.repeat(5_000);
  const reader = new SystemdJournalReader({
    platform: 'linux',
    runner: async () =>
      'DATABASE_PASSWORD=' + secret + '\nserviço saudável 😀\n',
  });
  const snapshot = await reader.read('user', 'fixture.service');
  assert.equal(snapshot.status, 'available');
  assert.equal(snapshot.masked, true);
  assert.match(snapshot.content ?? '', /serviço saudável 😀/u);
  assert.doesNotMatch(snapshot.content ?? '', /extremely-sensitive-sequence/);
  assert.ok(Buffer.byteLength(snapshot.content ?? '') <= 65_536);
});

test('journal permissions, missing CLI and empty output remain distinguishable', async () => {
  const denied = new SystemdJournalReader({
    platform: 'linux',
    runner: async () => {
      const error = new Error('private host path');
      Object.assign(error, { code: 'EACCES' });
      throw error;
    },
  });
  const result = await denied.read('system', 'postgresql.service');
  assert.equal(result.status, 'unavailable');
  assert.match(result.diagnostic ?? '', /permissão/);
  assert.doesNotMatch(JSON.stringify(result), /private host path/);

  const noJournal = new SystemdJournalReader({
    platform: 'linux',
    runner: async () =>
      'No journal files were opened due to insufficient permissions.',
  });
  assert.equal(
    (await noJournal.read('system', 'postgresql.service')).status,
    'unavailable',
  );

  const empty = new SystemdJournalReader({
    platform: 'linux',
    runner: async () => '',
  });
  assert.equal((await empty.read('user', 'fixture.service')).status, 'empty');
});

test('invalid identity and non-Linux never invoke journalctl', async () => {
  let calls = 0;
  const reader = new SystemdJournalReader({
    platform: 'darwin',
    runner: async () => {
      calls++;
      return 'data';
    },
  });
  assert.equal(
    (await reader.read('user', 'fixture.service')).status,
    'unsupported',
  );
  assert.equal(
    (await reader.read('user', '../foo.service')).status,
    'unsupported',
  );
  assert.equal(calls, 0);
});
