import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  SELF_UPDATE_AGENT_SERVICE_NAME,
  SELF_UPDATE_AGENT_UNIT_MARKER,
  buildSelfUpdateAgentUnit,
  ensureSelfUpdateAgentReady,
  ensureSelfUpdateAgentService,
  runSelfUpdateAgentBootstrap,
} from './self-update-agent-bootstrap.mjs';
import { resolveSelfUpdateAgentPaths } from './self-update-agent-runtime.mjs';

function result(status, stdout = '', stderr = '') {
  return { status, stdout, stderr, error: undefined };
}

function ready(release, instanceId = 'agent-1', pid = 1234) {
  return JSON.stringify({
    status: 'ready',
    pid,
    instanceId,
    release,
    actions: ['ping', 'inspect', 'claim', 'execute', 'recover'],
  });
}

function installed(release) {
  return JSON.stringify({
    status: 'installed',
    release,
    entrypoint: `/tmp/self-update-agent/releases/${release}/self-update-agent.mjs`,
  });
}

function passthroughServiceManager({ installation, current }) {
  if (!current || current.release !== installation.release) {
    throw new Error('agent esperado não está pronto');
  }
  return current;
}

test('ensure mantém agent já pronto quando a unit comprova a mesma release', () => {
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
    serviceManager: passthroughServiceManager,
  });

  assert.equal(value.status, 'ready');
  assert.equal(value.release, 'release-a');
  assert.deepEqual(calls, ['install', 'ping']);
});

test('ensure entrega agent ausente ao lifecycle gerenciado sem intervenção manual', () => {
  const calls = [];
  const runner = (_node, args) => {
    const command = args[1];
    calls.push(command);
    if (command === 'install') return result(0, installed('release-b'));
    if (command === 'ping') return result(1, '', 'agent indisponível');
    throw new Error(`comando inesperado: ${command}`);
  };

  const value = ensureSelfUpdateAgentReady({
    runner,
    agentPath: '/tmp/self-update-agent.mjs',
    serviceManager({ installation, current }) {
      assert.equal(current, null);
      return JSON.parse(ready(installation.release, 'agent-2', 4321));
    },
  });

  assert.equal(value.instanceId, 'agent-2');
  assert.deepEqual(calls, ['install', 'ping']);
});

test('ensure entrega release antiga ao lifecycle para substituição controlada', () => {
  const calls = [];
  const runner = (_node, args) => {
    const command = args[1];
    calls.push(command);
    if (command === 'install') return result(0, installed('release-new'));
    if (command === 'ping') {
      return result(0, ready('release-old', 'agent-old', 2222));
    }
    throw new Error(`comando inesperado: ${command}`);
  };

  const value = ensureSelfUpdateAgentReady({
    runner,
    agentPath: '/tmp/self-update-agent.mjs',
    serviceManager({ installation, current }) {
      assert.equal(current.release, 'release-old');
      return JSON.parse(ready(installation.release, 'agent-new', 3333));
    },
  });

  assert.equal(value.instanceId, 'agent-new');
  assert.deepEqual(calls, ['install', 'ping']);
});

test('bootstrap falha fechado quando lifecycle não entrega a release preparada', () => {
  const runner = (_node, args) => {
    const command = args[1];
    if (command === 'install') return result(0, installed('release-a'));
    if (command === 'ping') return result(1, '', 'sem resposta válida');
    throw new Error(`comando inesperado: ${command}`);
  };

  assert.throws(
    () =>
      ensureSelfUpdateAgentReady({
        runner,
        agentPath: '/tmp/self-update-agent.mjs',
        serviceManager() {
          return JSON.parse(ready('release-errada'));
        },
      }),
    /release diferente/,
  );
});

test('unit do agent fixa entrypoint instalado e paths privados', () => {
  const paths = resolveSelfUpdateAgentPaths({
    installRoot: '/home/test/.local/lib/dev-dashboard/self-update-agent',
    configDirectory: '/home/test/.config/dev-dashboard',
    stateRoot: '/home/test/.local/state/dev-dashboard',
    runtimeDirectory: '/run/user/1000/dev-dashboard/self-update-agent',
  });
  const unit = buildSelfUpdateAgentUnit({
    installation: {
      release: 'release-a',
      entrypoint:
        '/home/test/.local/lib/dev-dashboard/self-update-agent/releases/release-a/self-update-agent.mjs',
    },
    nodePath: '/home/test/.nvm/node',
    paths,
  });

  assert.match(unit, new RegExp(`^${SELF_UPDATE_AGENT_UNIT_MARKER}`, 'u'));
  assert.match(unit, /ExecStart="\/home\/test\/\.nvm\/node"/u);
  assert.match(unit, /self-update-agent\.mjs" serve/u);
  assert.match(unit, /DEV_DASHBOARD_CONFIG_DIR=\/home\/test\/\.config\/dev-dashboard/u);
  assert.match(unit, /WantedBy=default\.target/u);
});

test('lifecycle substitui agent detached por unit própria e comprova MainPID', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-agent-unit-'));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const paths = resolveSelfUpdateAgentPaths({
    installRoot: path.join(root, 'install'),
    configDirectory: path.join(root, 'config'),
    stateRoot: path.join(root, 'state'),
    runtimeDirectory: path.join(root, 'runtime'),
  });
  const unitPath = path.join(root, SELF_UPDATE_AGENT_SERVICE_NAME);
  const installation = {
    release: 'release-new',
    entrypoint: path.join(root, 'install', 'release-new', 'self-update-agent.mjs'),
  };
  const current = JSON.parse(ready('release-new', 'detached', 2222));
  const systemdCalls = [];
  const agentCalls = [];
  let active = false;
  let mainPid = 0;

  const runner = (command, args) => {
    assert.equal(command, 'systemctl');
    const action = args[1];
    systemdCalls.push(args.slice(1));
    if (action === 'daemon-reload' || action === 'enable') return result(0);
    if (action === 'is-active') {
      return active ? result(0, 'active\n') : result(3, 'inactive\n');
    }
    if (action === 'show') return result(0, `${mainPid}\n`);
    if (action === 'restart') {
      active = true;
      mainPid = 4242;
      return result(0);
    }
    throw new Error(`systemctl inesperado: ${args.join(' ')}`);
  };

  const runAgent = (args) => {
    agentCalls.push(args);
    if (args[0] === 'stop') return result(0, '{"status":"stopped"}');
    if (args[0] === 'ping') {
      return result(0, ready('release-new', 'managed', 4242));
    }
    throw new Error(`agent inesperado: ${args.join(' ')}`);
  };

  const value = ensureSelfUpdateAgentService({
    installation,
    current,
    runAgent,
    runner,
    paths,
    unitPath,
  });

  assert.equal(value.pid, 4242);
  assert.deepEqual(agentCalls, [['stop'], ['ping']]);
  assert.ok(systemdCalls.some((args) => args[0] === 'restart'));

  const unit = await readFile(unitPath, 'utf8');
  assert.ok(unit.startsWith(`${SELF_UPDATE_AGENT_UNIT_MARKER}\n`));
  assert.match(unit, new RegExp(installation.entrypoint.replaceAll('/', '\\/'), 'u'));
});

test('lifecycle não reinicia agent já pertencente à unit gerenciada', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-agent-unit-'));
  t.after(async () => rm(root, { recursive: true, force: true }));

  const paths = resolveSelfUpdateAgentPaths({
    installRoot: path.join(root, 'install'),
    configDirectory: path.join(root, 'config'),
    stateRoot: path.join(root, 'state'),
    runtimeDirectory: path.join(root, 'runtime'),
  });
  const unitPath = path.join(root, SELF_UPDATE_AGENT_SERVICE_NAME);
  const installation = {
    release: 'release-a',
    entrypoint: path.join(root, 'install', 'release-a', 'self-update-agent.mjs'),
  };
  const current = JSON.parse(ready('release-a', 'managed', 4242));
  const systemdActions = [];

  const value = ensureSelfUpdateAgentService({
    installation,
    current,
    runAgent() {
      throw new Error('agent não deveria ser mutado');
    },
    runner(_command, args) {
      const action = args[1];
      systemdActions.push(action);
      if (action === 'daemon-reload' || action === 'enable') return result(0);
      if (action === 'is-active') return result(0, 'active\n');
      if (action === 'show') return result(0, '4242\n');
      throw new Error(`systemctl inesperado: ${args.join(' ')}`);
    },
    paths,
    unitPath,
  });

  assert.equal(value.instanceId, 'managed');
  assert.equal(systemdActions.includes('restart'), false);
});

test('lifecycle recusa sobrescrever unit de outro owner', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'dev-dashboard-agent-unit-'));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const unitPath = path.join(root, SELF_UPDATE_AGENT_SERVICE_NAME);
  await writeFile(unitPath, '[Service]\nExecStart=/tmp/outro\n', 'utf8');

  assert.throws(
    () =>
      ensureSelfUpdateAgentService({
        installation: {
          release: 'release-a',
          entrypoint: '/tmp/release-a/self-update-agent.mjs',
        },
        current: null,
        runAgent() {
          return result(1);
        },
        runner() {
          return result(0);
        },
        paths: resolveSelfUpdateAgentPaths({
          installRoot: path.join(root, 'install'),
          configDirectory: path.join(root, 'config'),
          stateRoot: path.join(root, 'state'),
          runtimeDirectory: path.join(root, 'runtime'),
        }),
        unitPath,
      }),
    /não pertence ao self-update/,
  );
});

test('CLI expõe somente ensure como ação de bootstrap', () => {
  let stderr = '';
  const exitCode = runSelfUpdateAgentBootstrap(['start'], {
    stdout: { write() {} },
    stderr: {
      write(chunk) {
        stderr += chunk;
      },
    },
    ensure() {
      throw new Error('não deveria executar');
    },
  });

  assert.equal(exitCode, 2);
  assert.match(stderr, /ensure/);
});
