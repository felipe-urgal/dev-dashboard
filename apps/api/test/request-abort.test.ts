import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';

import { createHttpAbortScope } from '../src/http/request-abort.js';

function fakeRequest(): IncomingMessage {
  return Object.assign(new EventEmitter(), {
    aborted: false,
  }) as unknown as IncomingMessage;
}

function fakeResponse(): ServerResponse {
  return Object.assign(new EventEmitter(), {
    destroyed: false,
    writableEnded: false,
  }) as unknown as ServerResponse;
}

test('aborta quando o cliente interrompe a requisição', () => {
  const request = fakeRequest();
  const response = fakeResponse();
  const scope = createHttpAbortScope(request, response);

  request.emit('aborted');

  assert.equal(scope.signal.aborted, true);
});

test('aborta quando a conexão fecha antes de concluir a resposta', () => {
  const request = fakeRequest();
  const response = fakeResponse();
  const scope = createHttpAbortScope(request, response);

  response.emit('close');

  assert.equal(scope.signal.aborted, true);
});

test('não aborta no close normal após a resposta terminar', () => {
  const request = fakeRequest();
  const response = fakeResponse();
  const scope = createHttpAbortScope(request, response);

  Object.defineProperty(response, 'writableEnded', { value: true });
  response.emit('close');

  assert.equal(scope.signal.aborted, false);
});

test('dispose remove os listeners de lifecycle', () => {
  const request = fakeRequest();
  const response = fakeResponse();
  const scope = createHttpAbortScope(request, response);

  scope.dispose();
  request.emit('aborted');
  response.emit('close');

  assert.equal(scope.signal.aborted, false);
});
