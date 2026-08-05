import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GitMutationConfirmationError,
  GitMutationConfirmationService,
} from '../src/services/git-mutation-confirmation-service.js';

test('prepare gera token de 64 caracteres hex vinculado a projeto, operação e alvo', () => {
  const service = new GitMutationConfirmationService();
  const confirmation = service.prepare('p1', 'create-branch', 'feature/x');
  assert.equal(confirmation.token.length, 64);
  assert.match(confirmation.token, /^[0-9a-f]{64}$/);
  assert.ok(Number.isFinite(Date.parse(confirmation.expiresAt)));
});

test('consume aceita o token exato uma única vez', () => {
  const service = new GitMutationConfirmationService();
  const { token } = service.prepare('p1', 'create-branch', 'feature/x');
  assert.doesNotThrow(() => service.consume('p1', 'create-branch', 'feature/x', token));
  assert.throws(
    () => service.consume('p1', 'create-branch', 'feature/x', token),
    (error) => error instanceof GitMutationConfirmationError && error.code === 'GIT_MUTATION_CONFIRMATION_REQUIRED',
  );
});

test('consume recusa token de outro projeto', () => {
  const service = new GitMutationConfirmationService();
  const { token } = service.prepare('p1', 'create-branch', 'feature/x');
  assert.throws(
    () => service.consume('p2', 'create-branch', 'feature/x', token),
    (error) => error instanceof GitMutationConfirmationError,
  );
});

test('consume recusa token de outra operação', () => {
  const service = new GitMutationConfirmationService();
  const { token } = service.prepare('p1', 'create-branch', 'feature/x');
  assert.throws(
    () => service.consume('p1', 'switch-branch', 'feature/x', token),
    (error) => error instanceof GitMutationConfirmationError,
  );
});

test('consume recusa token de outro alvo', () => {
  const service = new GitMutationConfirmationService();
  const { token } = service.prepare('p1', 'create-branch', 'feature/x');
  assert.throws(
    () => service.consume('p1', 'create-branch', 'feature/y', token),
    (error) => error instanceof GitMutationConfirmationError,
  );
});

test('consume recusa token ausente ou desconhecido', () => {
  const service = new GitMutationConfirmationService();
  assert.throws(
    () => service.consume('p1', 'create-branch', 'feature/x', undefined),
    (error) => error instanceof GitMutationConfirmationError,
  );
  assert.throws(
    () => service.consume('p1', 'create-branch', 'feature/x', 'z'.repeat(64)),
    (error) => error instanceof GitMutationConfirmationError,
  );
});

test('consume recusa token expirado', async () => {
  const service = new GitMutationConfirmationService(1);
  const { token } = service.prepare('p1', 'create-branch', 'feature/x');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.throws(
    () => service.consume('p1', 'create-branch', 'feature/x', token),
    (error) => error instanceof GitMutationConfirmationError,
  );
});
