import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assertExplicitHttpSchemas,
  findHttpRoutesWithoutSchema,
} from './api-schema-gate.mjs';

const route = (overrides = {}) => ({
  method: 'GET',
  url: '/api/example',
  group: 'example',
  schema: { response: { 200: { type: 'object' } } },
  websocket: false,
  ...overrides,
});

test('aceita rota HTTP com schema explícito', () => {
  assert.deepEqual(findHttpRoutesWithoutSchema([route()]), []);
  assert.doesNotThrow(() => assertExplicitHttpSchemas([route()]));
});

test('aceita WebSocket sem schema quando a exceção é explícita', () => {
  const websocketRoute = route({
    schema: undefined,
    websocket: true,
    url: '/api/example/connect',
  });

  assert.deepEqual(findHttpRoutesWithoutSchema([websocketRoute]), []);
  assert.doesNotThrow(() => assertExplicitHttpSchemas([websocketRoute]));
});

test('rejeita rota HTTP comum sem schema', () => {
  const missingSchema = route({
    schema: undefined,
    method: 'POST',
    url: '/api/example/run',
  });

  assert.deepEqual(findHttpRoutesWithoutSchema([missingSchema]), [
    missingSchema,
  ]);
  assert.throws(
    () => assertExplicitHttpSchemas([missingSchema]),
    /POST \/api\/example\/run \(example\)/,
  );
});
