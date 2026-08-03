import assert from 'node:assert/strict';
import { afterEach, beforeEach, test, vi } from 'vitest';

import {
  createNativeNotificationStore,
  durationInMilliseconds,
  NATIVE_NOTIFICATIONS_STORAGE_KEY,
} from '../src/stores/native-notifications';
import type { Notice } from '../src/stores/notice-center';

class FakeNotification {
  public static permission: NotificationPermission = 'default';
  public static requestPermission = vi.fn<() => Promise<NotificationPermission>>();
  public static instances: FakeNotification[] = [];

  public onclick: (() => void) | null = null;
  public readonly close = vi.fn();

  public constructor(
    public readonly title: string,
    public readonly options?: NotificationOptions,
  ) {
    FakeNotification.instances.push(this);
  }
}

function makeNotice(): Notice {
  return {
    id: 'notice-1',
    dedupeKey: 'test:execution-1:succeeded',
    origin: 'test',
    outcome: 'succeeded',
    projectId: 'project-1',
    projectName: 'Projeto seguro',
    label: 'npm test',
    createdAt: Date.now(),
    read: false,
    routeTo: { name: 'project-tests', params: { projectId: 'project-1' } },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  FakeNotification.permission = 'default';
  FakeNotification.requestPermission.mockReset();
  FakeNotification.instances = [];
  vi.stubGlobal('Notification', FakeNotification);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('solicita permissão somente ao ativar explicitamente e persiste a escolha', async () => {
  FakeNotification.requestPermission.mockResolvedValue('granted');
  const store = createNativeNotificationStore();

  assert.equal(FakeNotification.requestPermission.mock.calls.length, 0);
  assert.equal(await store.enable(), 'enabled');
  assert.equal(FakeNotification.requestPermission.mock.calls.length, 1);
  assert.equal(store.enabled.value, true);
  assert.equal(window.localStorage.getItem(NATIVE_NOTIFICATIONS_STORAGE_KEY), 'enabled');

  store.disable();
  assert.equal(store.enabled.value, false);
  assert.equal(window.localStorage.getItem(NATIVE_NOTIFICATIONS_STORAGE_KEY), null);
});

test('notifica somente execução longa concluída enquanto a aba está oculta', () => {
  FakeNotification.permission = 'granted';
  window.localStorage.setItem(NATIVE_NOTIFICATIONS_STORAGE_KEY, 'enabled');
  const store = createNativeNotificationStore();
  const notice = makeNotice();

  store.publish(notice, 29_999);
  assert.equal(FakeNotification.instances.length, 0);

  store.publish(notice, 30_000);
  assert.equal(FakeNotification.instances.length, 0);

  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  store.publish(notice, 30_000);
  assert.equal(FakeNotification.instances.length, 1);
  assert.equal(FakeNotification.instances[0]!.title, 'Testes concluídos com sucesso');
  assert.equal(FakeNotification.instances[0]!.options?.body, 'Projeto seguro · npm test');
  assert.equal(FakeNotification.instances[0]!.options?.tag, notice.dedupeKey);
});

test('clique foca a janela e abre a rota vinculada ao aviso', () => {
  FakeNotification.permission = 'granted';
  window.localStorage.setItem(NATIVE_NOTIFICATIONS_STORAGE_KEY, 'enabled');
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  const store = createNativeNotificationStore();
  const navigate = vi.fn();
  const focus = vi.spyOn(window, 'focus').mockImplementation(() => undefined);
  store.setNavigator(navigate);

  const notice = makeNotice();
  store.publish(notice, 31_000);
  FakeNotification.instances[0]!.onclick?.();

  assert.equal(focus.mock.calls.length, 1);
  assert.deepEqual(navigate.mock.calls[0]?.[0], notice.routeTo);
  assert.equal(FakeNotification.instances[0]!.close.mock.calls.length, 1);
});

test('calcula duração com fim explícito e rejeita datas inválidas', () => {
  assert.equal(durationInMilliseconds('2026-08-03T10:00:00Z', '2026-08-03T10:00:30Z'), 30_000);
  assert.equal(durationInMilliseconds('inválida', '2026-08-03T10:00:30Z'), undefined);
});
