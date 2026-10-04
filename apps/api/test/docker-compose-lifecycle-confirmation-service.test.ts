import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DockerComposeLifecycleConfirmationError,
  DockerComposeLifecycleConfirmationService,
} from '../src/services/docker-compose-lifecycle-confirmation-service.js';

test('confirmação Compose é single-use e vinculada a ambiente/operação/alvo', () => {
  let now = Date.parse('2026-10-04T15:00:00.000Z');
  const service = new DockerComposeLifecycleConfirmationService(
    () => now,
    60_000,
  );

  const confirmation = service.prepare(
    'project-1',
    'environment:primary:project-1',
    'restart',
    'web',
  );

  assert.equal(confirmation.operation, 'restart');
  assert.equal(confirmation.service, 'web');

  assert.throws(
    () =>
      service.consume(
        confirmation.token,
        'project-1',
        'environment:primary:project-1',
        'restart',
        'worker',
      ),
    (error: unknown) =>
      error instanceof DockerComposeLifecycleConfirmationError &&
      error.code === 'COMPOSE_CONFIRMATION_INVALID',
  );

  const next = service.prepare(
    'project-1',
    'environment:primary:project-1',
    'stop',
  );
  service.consume(
    next.token,
    'project-1',
    'environment:primary:project-1',
    'stop',
  );
  assert.throws(
    () =>
      service.consume(
        next.token,
        'project-1',
        'environment:primary:project-1',
        'stop',
      ),
    (error: unknown) =>
      error instanceof DockerComposeLifecycleConfirmationError &&
      error.code === 'COMPOSE_CONFIRMATION_INVALID',
  );

  const expired = service.prepare(
    'project-1',
    'environment:primary:project-1',
    'start',
  );
  now += 61_000;
  assert.throws(
    () =>
      service.consume(
        expired.token,
        'project-1',
        'environment:primary:project-1',
        'start',
      ),
    (error: unknown) =>
      error instanceof DockerComposeLifecycleConfirmationError &&
      error.code === 'COMPOSE_CONFIRMATION_EXPIRED',
  );
});
