import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getProcessDefinitions,
  stopChild,
} from './dev.mjs';

test('retorna as definições padrão de processos', () => {
  const defs = getProcessDefinitions();
  assert.equal(defs.length, 3);
  assert.equal(defs[0].name, 'api');
  assert.equal(defs[1].name, 'web');
  assert.equal(defs[2].name, 'docs');
  assert.deepEqual(defs[0].args, ['run', 'dev', '--workspace=@dev-dashboard/api']);
  assert.deepEqual(defs[1].args, ['run', 'dev', '--workspace=@dev-dashboard/web']);
  assert.deepEqual(defs[2].args, ['run', 'docs:dev']);
});

test('permite sobrepor as definições de processos', () => {
  const custom = [{ name: 'x', args: ['a', 'b'] }];
  const defs = getProcessDefinitions({ processDefinitions: custom });
  assert.deepEqual(defs, custom);
});

test('stopChild ignora processos sem pid', () => {
  const killed = [];
  const killFn = () => { killed.push('killed'); };
  stopChild({ pid: undefined }, 'SIGTERM', killFn);
  assert.deepEqual(killed, []);
});

test('stopChild envia sinal para processo-filho no Linux (pid negativo para grupo)', () => {
  const killed = [];
  const killFn = (pid, signal) => { killed.push({ pid, signal }); };
  stopChild({ pid: 9999 }, 'SIGTERM', killFn);
  assert.deepEqual(killed, [{ pid: -9999, signal: 'SIGTERM' }]);
});

test('stopChild usa child.kill no Windows', () => {
  const fakeChild = { pid: 42, kill: (_sig) => {} };
  assert.equal(typeof fakeChild.kill, 'function');
});

test('stopChild engole ESRCH sem erro', () => {
  const error = new Error('no such process');
  error.code = 'ESRCH';
  const killFn = () => { throw error; };
  stopChild({ pid: 1 }, 'SIGTERM', killFn);
});

test('stopChild loga outros erros sem lançar', () => {
  const originalConsole = console.error;
  const messages = [];
  console.error = (...args) => messages.push(args.join(' '));
  const error = new Error('permission denied');
  error.code = 'EPERM';
  const killFn = () => { throw error; };
  stopChild({ pid: 1 }, 'SIGTERM', killFn);
  console.error = originalConsole;
  assert.ok(messages.some((m) => m.includes('Falha ao encerrar')), `Expected error log, got: ${messages}`);
});
