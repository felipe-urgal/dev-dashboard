import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  RequestGate,
  RequestGeneration,
} from '../src/utils/request-generation.js';

function deferred<T>() {
  let resolve!: (value: T) => void;

  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

test('invalidates stale asynchronous responses', async () => {
  const generation = new RequestGeneration();
  const first = deferred<string>();
  const second = deferred<string>();
  let visibleValue = '';

  const firstToken = generation.invalidate();
  const firstRequest = first.promise.then((value) => {
    if (generation.isCurrent(firstToken)) {
      visibleValue = value;
    }
  });

  const secondToken = generation.invalidate();
  const secondRequest = second.promise.then((value) => {
    if (generation.isCurrent(secondToken)) {
      visibleValue = value;
    }
  });

  second.resolve('new');
  await secondRequest;

  first.resolve('old');
  await firstRequest;

  assert.equal(visibleValue, 'new');
});

test('prevents overlapping polling requests', () => {
  const gate = new RequestGate();
  const firstToken = gate.begin('first');

  assert.ok(firstToken);
  assert.equal(gate.begin('overlap'), null);
  assert.equal(gate.finish(firstToken), true);
  assert.ok(gate.begin('next'));
});

test('ignores completion from a request invalidated by log cleanup', () => {
  const gate = new RequestGate();
  const staleToken = gate.begin('stale');

  assert.ok(staleToken);
  gate.invalidate();

  const currentToken = gate.begin('current');

  assert.ok(currentToken);
  assert.equal(gate.finish(staleToken), false);
  assert.equal(gate.begin('overlap'), null);
  assert.equal(gate.finish(currentToken), true);
});
