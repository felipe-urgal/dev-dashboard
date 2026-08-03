import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import type { WebSocket } from 'ws';

import { withWebSocketMessageRateLimit } from '../src/security/rate-limited-websocket.js';

class FakeSocket extends EventEmitter {
  public closeCode?: number;
  public closeReason?: string;

  public close(code?: number, reason?: string): void {
    this.closeCode = code;
    this.closeReason = reason;
  }
}

test('encerra a conexão antes de entregar mensagens acima do limite', () => {
  const socket = new FakeSocket();
  const limited = withWebSocketMessageRateLimit(
    socket as unknown as WebSocket,
    {
      maxMessages: 1,
      windowMs: 1_000,
      now: () => 0,
    },
  );
  let delivered = 0;
  limited.on('message', () => {
    delivered += 1;
  });

  socket.emit('message', Buffer.from('{}'), false);
  socket.emit('message', Buffer.from('{}'), false);

  assert.equal(delivered, 1);
  assert.equal(socket.closeCode, 1008);
  assert.equal(socket.closeReason, 'Limite de mensagens LSP excedido');
});

test('reinicia a contagem depois da janela configurada', () => {
  const socket = new FakeSocket();
  let now = 0;
  const limited = withWebSocketMessageRateLimit(
    socket as unknown as WebSocket,
    {
      maxMessages: 1,
      windowMs: 1_000,
      now: () => now,
    },
  );
  let delivered = 0;
  limited.on('message', () => {
    delivered += 1;
  });

  socket.emit('message', Buffer.from('{}'), false);
  now = 1_000;
  socket.emit('message', Buffer.from('{}'), false);

  assert.equal(delivered, 2);
  assert.equal(socket.closeCode, undefined);
});
