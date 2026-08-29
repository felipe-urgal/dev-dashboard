import assert from 'node:assert/strict';
import test from 'node:test';

import { DatabaseExplorerSessionStore } from '../src/services/database-explorer-session-store.js';

test('mantém a credencial somente no store e devolve uma cópia da conexão', () => {
  const store = new DatabaseExplorerSessionStore({
    ttlMs: 60_000,
    generateSessionId: () => 'session-1',
  });

  const descriptor = store.create({
    driver: 'postgresql',
    username: 'app',
    password: 'segredo',
  });

  assert.equal(descriptor.sessionId, 'session-1');
  assert.equal(descriptor.expiresAt.length > 0, true);

  const connection = store.get(descriptor.sessionId);
  assert.deepEqual(connection, {
    driver: 'postgresql',
    username: 'app',
    password: 'segredo',
  });

  if (connection) connection.password = 'alterada';
  assert.equal(store.get(descriptor.sessionId)?.password, 'segredo');
  store.close();
});

test('remove sessão expirada ao consultar', () => {
  let now = 1_000;
  const store = new DatabaseExplorerSessionStore({
    ttlMs: 500,
    now: () => now,
    generateSessionId: () => 'session-expired',
  });

  store.create({ driver: 'mysql', password: 'segredo' });
  now = 1_501;

  assert.equal(store.get('session-expired'), undefined);
  assert.equal(store.delete('session-expired'), false);
  store.close();
});

test('disconnect remove a sessão explicitamente e é idempotente', () => {
  const store = new DatabaseExplorerSessionStore({
    ttlMs: 60_000,
    generateSessionId: () => 'session-delete',
  });

  store.create({ driver: 'mariadb' });

  assert.equal(store.delete('session-delete'), true);
  assert.equal(store.get('session-delete'), undefined);
  assert.equal(store.delete('session-delete'), false);
  store.close();
});

test('rejeita colisão persistente de ids de sessão', () => {
  const store = new DatabaseExplorerSessionStore({
    ttlMs: 60_000,
    generateSessionId: () => 'same-id',
  });
  store.create({ driver: 'postgresql' });

  assert.throws(
    () => store.create({ driver: 'mysql' }),
    /Não foi possível gerar uma sessão única/,
  );
  store.close();
});
