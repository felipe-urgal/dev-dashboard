import assert from 'node:assert/strict';
import { test } from 'node:test';

import { diagnose, supportsNodeVersion } from './doctor.mjs';

test('aceita somente versões suportadas do Node.js', () => {
  assert.equal(supportsNodeVersion('20.18.9'), false);
  assert.equal(supportsNodeVersion('20.19.0'), true);
  assert.equal(supportsNodeVersion('21.7.3'), false);
  assert.equal(supportsNodeVersion('22.11.0'), false);
  assert.equal(supportsNodeVersion('22.12.0'), true);
  assert.equal(supportsNodeVersion('24.0.0'), true);
  assert.equal(supportsNodeVersion('inválida'), false);
});

test('diagnóstico diferencia erros obrigatórios de portas ocupadas', async () => {
  const results = await diagnose({
    rootDirectory: '/projeto',
    nodeVersion: '20.18.0',
    commandChecker: async (command) => (command === 'npm' ? '10.0.0' : null),
    portChecker: async (_host, port) => port !== 4343,
    fileChecker: async () => undefined,
  });

  assert.equal(
    results.find((item) => item.label === 'Node.js')?.status,
    'error',
  );
  assert.equal(results.find((item) => item.label === 'npm')?.status, 'ok');
  assert.equal(results.find((item) => item.label === 'git')?.status, 'error');
  assert.equal(
    results.find((item) => item.label === 'Porta API')?.status,
    'warning',
  );
  assert.equal(
    results.find((item) => item.label === 'Porta Web')?.status,
    'ok',
  );
  assert.equal(
    results.find((item) => item.label === 'Porta Docs')?.status,
    'ok',
  );
});

test('diagnóstico respeita a porta configurada da documentação', async () => {
  const checkedPorts = [];
  await diagnose({
    rootDirectory: '/projeto',
    nodeVersion: '24.0.0',
    docsPort: '4999',
    commandChecker: async () => 'ok',
    portChecker: async (_host, port) => {
      checkedPorts.push(port);
      return true;
    },
    fileChecker: async () => undefined,
  });
  assert.ok(checkedPorts.includes(4999));
});
