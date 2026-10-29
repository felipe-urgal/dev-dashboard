import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { AgentLiveFeed, AgentSessionStore } from '../src/index.js';

test('feed ao vivo numera eventos, filtra por seq, limita o tamanho e reinicia por execução', () => {
  const feed = new AgentLiveFeed({ maxEventsPerTask: 3, now: () => 'agora' });
  feed.reset('task-1');
  for (const text of ['a', 'b', 'c', 'd']) {
    feed.append('task-1', { kind: 'text', text });
  }

  assert.deepEqual(
    feed.list('task-1').map((event) => [event.seq, event.text]),
    [
      [2, 'b'],
      [3, 'c'],
      [4, 'd'],
    ],
  );
  assert.deepEqual(
    feed.list('task-1', 3).map((event) => event.text),
    ['d'],
  );

  feed.reset('task-1');
  assert.deepEqual(feed.list('task-1'), []);
  assert.deepEqual(feed.list('desconhecida'), []);
});

test('sessão do provider persiste por task e ignora ids inválidos', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'agent-session-'));
  try {
    const store = new AgentSessionStore({ stateDirectory: directory });
    assert.equal(await store.get('task-1'), undefined);

    await store.set('task-1', 'session-abc12345');
    assert.equal(await store.get('task-1'), 'session-abc12345');

    await store.set('task-1', '../escape');
    assert.equal(await store.get('task-1'), 'session-abc12345');
    assert.equal(await store.get('../task'), undefined);

    await store.clear('task-1');
    assert.equal(await store.get('task-1'), undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
