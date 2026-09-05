import assert from 'node:assert/strict';
import test from 'node:test';

import { captureTestExecutionGitIdentity } from '../src/services/test-execution-identity.js';

test('captura revisão e marca working tree limpo sem heurística', async () => {
  const calls: string[][] = [];
  const identity = await captureTestExecutionGitIdentity(
    '/workspace/project',
    async (_projectPath, args) => {
      calls.push([...args]);
      if (args[0] === 'rev-parse') return 'abc123\n';
      if (args[0] === 'status') return '';
      throw new Error(`comando inesperado: ${args.join(' ')}`);
    },
  );

  assert.deepEqual(identity, {
    gitRevision: 'abc123',
    gitDirtyFingerprint: 'clean',
  });
  assert.equal(calls.some((args) => args[0] === 'diff'), false);
});

test('fingerprint dirty muda quando conteúdo tracked ou untracked muda', async () => {
  async function capture(diff: string, untrackedHash: string) {
    return captureTestExecutionGitIdentity(
      '/workspace/project',
      async (_projectPath, args) => {
        if (args[0] === 'rev-parse') return 'abc123\n';
        if (args[0] === 'status') return ' M src/app.ts\0?? notes.txt\0';
        if (args[0] === 'diff') return diff;
        if (args[0] === 'hash-object') {
          assert.deepEqual(args, ['hash-object', '--', 'notes.txt']);
          return `${untrackedHash}\n`;
        }
        throw new Error(`comando inesperado: ${args.join(' ')}`);
      },
    );
  }

  const first = await capture('diff-a', 'hash-a');
  const trackedChanged = await capture('diff-b', 'hash-a');
  const untrackedChanged = await capture('diff-a', 'hash-b');

  assert.equal(first.gitRevision, 'abc123');
  assert.match(first.gitDirtyFingerprint ?? '', /^[a-f0-9]{64}$/);
  assert.notEqual(first.gitDirtyFingerprint, trackedChanged.gitDirtyFingerprint);
  assert.notEqual(
    first.gitDirtyFingerprint,
    untrackedChanged.gitDirtyFingerprint,
  );
});

test('não cria fingerprint parcial quando há untracked demais', async () => {
  const status = Array.from(
    { length: 101 },
    (_, index) => `?? file-${index}.txt\0`,
  ).join('');

  const identity = await captureTestExecutionGitIdentity(
    '/workspace/project',
    async (_projectPath, args) => {
      if (args[0] === 'rev-parse') return 'abc123\n';
      if (args[0] === 'status') return status;
      throw new Error(`não deveria executar ${args[0]}`);
    },
  );

  assert.deepEqual(identity, { gitRevision: 'abc123' });
});

test('preserva HEAD conhecido quando captura do dirty state falha', async () => {
  const identity = await captureTestExecutionGitIdentity(
    '/workspace/project',
    async (_projectPath, args) => {
      if (args[0] === 'rev-parse') return 'abc123\n';
      throw new Error('status indisponível');
    },
  );

  assert.deepEqual(identity, { gitRevision: 'abc123' });
  assert.equal(identity.gitDirtyFingerprint, undefined);
});

test('falha de Git degrada para identidade desconhecida sem bloquear testes', async () => {
  const identity = await captureTestExecutionGitIdentity(
    '/workspace/not-a-repo',
    async () => {
      throw new Error('not a git repository');
    },
  );

  assert.deepEqual(identity, {});
});
