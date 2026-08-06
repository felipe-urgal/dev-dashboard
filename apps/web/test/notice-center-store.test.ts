import assert from 'node:assert/strict';
import { test, vi } from 'vitest';

import {
  createNoticeCenterStore,
  NOTICE_LIST_LIMIT,
  type Notice,
} from '../src/stores/notice-center.js';

function createTestNoticeInput(
  dedupeKey: string,
): Omit<Notice, 'id' | 'createdAt' | 'read'> {
  return {
    dedupeKey,
    origin: 'test',
    outcome: 'succeeded',
    projectId: 'project-1',
    projectName: 'Test Project',
    label: 'Run tests',
    routeTo: { name: 'project', params: { projectId: 'project-1' } },
  };
}

test('publicar um aviso terminal uma vez aparece na lista com unreadCount = 1', () => {
  const store = createNoticeCenterStore();

  store.publishTerminalNotice(createTestNoticeInput('test:1:succeeded'));

  assert.equal(store.notices.value.length, 1);
  assert.equal(store.unreadCount.value, 1);
  assert.equal(store.notices.value[0]!.read, false);
});

test('publicar novamente com o mesmo dedupeKey não duplica', () => {
  const publishNativeNotification = vi.fn();
  const store = createNoticeCenterStore({ publishNativeNotification });

  const input = createTestNoticeInput('test:1:succeeded');

  store.publishTerminalNotice(input);
  store.publishTerminalNotice(input);

  assert.equal(store.notices.value.length, 1);
  assert.equal(store.unreadCount.value, 1);
  assert.equal(publishNativeNotification.mock.calls.length, 1);
});

test('publicar dois avisos com dedupeKeys diferentes cria dois itens distintos', () => {
  const store = createNoticeCenterStore();

  store.publishTerminalNotice(createTestNoticeInput('test:1:succeeded'));
  store.publishTerminalNotice(createTestNoticeInput('test:2:failed'));

  assert.equal(store.notices.value.length, 2);
  assert.equal(store.unreadCount.value, 2);
});

test('publicar NOTICE_LIST_LIMIT + 1 avisos mantém o tamanho e descarta o mais antigo', () => {
  const store = createNoticeCenterStore();

  for (let i = 0; i < NOTICE_LIST_LIMIT + 1; i++) {
    store.publishTerminalNotice(createTestNoticeInput(`test:${i}:succeeded`));
  }

  assert.equal(store.notices.value.length, NOTICE_LIST_LIMIT);
  assert.equal(
    store.notices.value[NOTICE_LIST_LIMIT - 1]!.dedupeKey,
    'test:1:succeeded',
  );
});

test('dismiss(id) remove da lista visível; publicar o mesmo dedupeKey depois não reaparece', () => {
  const store = createNoticeCenterStore();

  const input = createTestNoticeInput('test:1:succeeded');
  store.publishTerminalNotice(input);

  const noticeId = store.notices.value[0]!.id;
  store.dismiss(noticeId);

  assert.equal(store.notices.value.length, 0);

  store.publishTerminalNotice(input);

  assert.equal(store.notices.value.length, 0);
  assert.equal(store.unreadCount.value, 0);
});

test('clearAll() esvazia a lista; publicar o mesmo dedupeKey depois não reaparece', () => {
  const store = createNoticeCenterStore();

  const input = createTestNoticeInput('test:1:succeeded');
  store.publishTerminalNotice(input);

  assert.equal(store.notices.value.length, 1);

  store.clearAll();

  assert.equal(store.notices.value.length, 0);

  store.publishTerminalNotice(input);

  assert.equal(store.notices.value.length, 0);
  assert.equal(store.unreadCount.value, 0);
});

test('markRead(id) reduz unreadCount sem remover o item da lista', () => {
  const store = createNoticeCenterStore();

  store.publishTerminalNotice(createTestNoticeInput('test:1:succeeded'));

  assert.equal(store.unreadCount.value, 1);

  const noticeId = store.notices.value[0]!.id;
  store.markRead(noticeId);

  assert.equal(store.unreadCount.value, 0);
  assert.equal(store.notices.value.length, 1);
  assert.equal(store.notices.value[0]!.read, true);
});

test('markAllRead() marca todos os avisos como lidos sem remover o histórico', () => {
  const store = createNoticeCenterStore();

  store.publishTerminalNotice(createTestNoticeInput('test:1:succeeded'));
  store.publishTerminalNotice(createTestNoticeInput('test:2:failed'));

  assert.equal(store.unreadCount.value, 2);

  store.markAllRead();

  assert.equal(store.unreadCount.value, 0);
  assert.equal(store.notices.value.length, 2);
  assert.equal(
    store.notices.value.every((notice) => notice.read),
    true,
  );
});
