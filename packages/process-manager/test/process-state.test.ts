import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isStoredProcess,
  verifyProcessDirectory,
  type StoredProcess,
} from '../src/index.js';

const validProcess = {
  id: 'project:server',
  projectId: 'project',
  kind: 'server',
  status: 'running',
  pid: 1234,
  port: 3000,
  command: 'npm',
  args: ['run', 'dev'],
  cwd: '/tmp/project',
  logPath: '/tmp/project.log',
  startedAt: new Date().toISOString(),
};

test('accepts a valid stored process', () => {
  assert.equal(isStoredProcess(validProcess), true);
});

test('rejects invalid status, pid, port and timestamps', () => {
  assert.equal(isStoredProcess({ ...validProcess, status: 'unknown' }), false);
  assert.equal(isStoredProcess({ ...validProcess, pid: -10 }), false);
  assert.equal(isStoredProcess({ ...validProcess, port: 80 }), false);
  assert.equal(
    isStoredProcess({ ...validProcess, startedAt: 'yesterday' }),
    false,
  );
});

test('verifyProcessDirectory retorna false sem pid', async () => {
  const stored = {
    ...validProcess,
    pid: undefined,
  } as unknown as StoredProcess;
  assert.equal(await verifyProcessDirectory(stored), false);
});

test('verifyProcessDirectory: plataforma desconhecida (ex. win32) não bloqueia', async () => {
  const stored = { ...validProcess } as StoredProcess;
  assert.equal(
    await verifyProcessDirectory(stored, { platform: 'win32' }),
    true,
  );
});

test('verifyProcessDirectory (linux): confirma quando /proc/<pid>/cwd bate com o cwd esperado', async () => {
  const stored = {
    ...validProcess,
    pid: process.pid,
    cwd: process.cwd(),
  } as StoredProcess;

  assert.equal(
    await verifyProcessDirectory(stored, { platform: 'linux' }),
    true,
  );
});

test('verifyProcessDirectory (linux): rejeita quando o cwd esperado não bate', async () => {
  const stored = {
    ...validProcess,
    pid: process.pid,
    cwd: '/definitivamente/nao/e/o/cwd/real',
  } as StoredProcess;

  assert.equal(
    await verifyProcessDirectory(stored, { platform: 'linux' }),
    false,
  );
});

test('verifyProcessDirectory (darwin): confirma quando lsof reporta o mesmo cwd', async () => {
  const stored = {
    ...validProcess,
    pid: 4321,
    cwd: process.cwd(),
  } as StoredProcess;

  const runLsof = async (pid: number) => {
    assert.equal(pid, 4321);
    return `p4321\nn${process.cwd()}\n`;
  };

  assert.equal(
    await verifyProcessDirectory(stored, { platform: 'darwin', runLsof }),
    true,
  );
});

test('verifyProcessDirectory (darwin): rejeita quando lsof reporta um cwd diferente', async () => {
  const stored = {
    ...validProcess,
    pid: 4321,
    cwd: process.cwd(),
  } as StoredProcess;

  const runLsof = async () => `p4321\nn/outro/diretorio\n`;

  assert.equal(
    await verifyProcessDirectory(stored, { platform: 'darwin', runLsof }),
    false,
  );
});

test('verifyProcessDirectory (darwin): não bloqueia quando lsof falha (ausente, sem permissão, etc.)', async () => {
  const stored = { ...validProcess, pid: 4321 } as StoredProcess;

  const runLsof = async () => {
    throw new Error('lsof: command not found');
  };

  assert.equal(
    await verifyProcessDirectory(stored, { platform: 'darwin', runLsof }),
    true,
  );
});

test('verifyProcessDirectory (darwin): não bloqueia quando lsof não reporta nenhum cwd', async () => {
  const stored = { ...validProcess, pid: 4321 } as StoredProcess;

  const runLsof = async () => 'p4321\n';

  assert.equal(
    await verifyProcessDirectory(stored, { platform: 'darwin', runLsof }),
    true,
  );
});
