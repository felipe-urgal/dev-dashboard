import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ensureSelfUpdateAgentReady,
  runSelfUpdateAgentBootstrap,
} from './self-update-agent-bootstrap.mjs';

function result(status, stdout = '', stderr = '') {
  return { status, stdout, stderr, error: undefined };
}

function ready(release, instanceId = 'agent-1') {
  return JSON.stringify({
    status: 'ready',
    instanceId,
    release,
    actions: ['ping', 'inspect', 'claim', 'execute', 'recover'],
  });
}

function installed(release) {
  return JSON.stringify({
    status: 'installed',
    release,
    entrypoint: '/tmp/self-update-agent/current/self-update-agent.mjs',
  });
}

test('ensure mantém agent já pronto na release instalada', () => {
  const calls = [];
  const runner = (_node, args) => {
    const command = args[1];
    calls.push(command);
    if (command === 'install') return result(0, installed('release-a'));
    if (command === 'ping') return result(0, ready('release-a'));
    throw new Error(`comando inesperado: ${command}`);
  };

  const value = ensureSelfUpdateAgentReady({
    runner,
    agentPath: '/tmp/self-update-agent.mjs',
  });

  assert.equal(value.status, 'ready');
  assert.equal(value.release, 'release-a');
  assert.deepEqual(calls, ['install', 'ping']);
});

test('ensure instala e inicia agent ausente sem intervenção manual', () => {
  const calls = [];
  let pingCount = 0;
  const runner = (_node, args) => {
    const command = args[1];
    calls.push(command);
    if (command === 'install') return result(0, installed('release-b'));
    if (command === 'ping') {
      pingCount += 1;
      return pingCount === 1
        ? result(1, '', 'agent indisponível')
        : result(0, ready('release-b', 'agent-2'));
    }
    if (command === 'start') return result(0, '{"status":"started"}');
    throw new Error(`comando inesperado: ${command}`);
  };

  const value = ensureSelfUpdateAgentReady({
    runner,
    agentPath: '/tmp/self-update-agent.mjs',
  });

  assert.equal(value.instanceId, 'agent-2');
  assert.deepEqual(calls, ['install', 'ping', 'start', 'ping']);
});

test('ensure reinicia agent quando a release em execução ficou antiga', () => {
  const calls = [];
  let pingCount = 0;
  const runner = (_node, args) => {
    const command = args[1];
    calls.push(command);
    if (command === 'install') return result(0, installed('release-new'));
    if (command === 'ping') {
      pingCount += 1;
      return pingCount === 1
        ? result(0, ready('release-old', 'agent-old'))
        : result(0, ready('release-new', 'agent-new'));
    }
    if (command === 'stop') return result(0, '{"status":"stopped"}');
    if (command === 'start') return result(0, '{"status":"started"}');
    throw new Error(`comando inesperado: ${command}`);
  };

  const value = ensureSelfUpdateAgentReady({
    runner,
    agentPath: '/tmp/self-update-agent.mjs',
  });

  assert.equal(value.instanceId, 'agent-new');
  assert.deepEqual(calls, ['install', 'ping', 'stop', 'start', 'ping']);
});

test('bootstrap falha fechado quando o agent não fica ready', () => {
  const runner = (_node, args) => {
    const command = args[1];
    if (command === 'install') return result(0, installed('release-a'));
    if (command === 'ping') return result(1, '', 'sem resposta válida');
    if (command === 'start') return result(0, '{"status":"started"}');
    throw new Error(`comando inesperado: ${command}`);
  };

  assert.throws(
    () =>
      ensureSelfUpdateAgentReady({
        runner,
        agentPath: '/tmp/self-update-agent.mjs',
      }),
    /sem resposta válida/,
  );
});

test('CLI expõe somente ensure como ação de bootstrap', () => {
  let stderr = '';
  const exitCode = runSelfUpdateAgentBootstrap(['start'], {
    stdout: { write() {} },
    stderr: { write(chunk) { stderr += chunk; } },
    ensure() {
      throw new Error('não deveria executar');
    },
  });

  assert.equal(exitCode, 2);
  assert.match(stderr, /ensure/);
});
