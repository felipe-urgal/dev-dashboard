import assert from 'node:assert/strict';
import test from 'node:test';

import { runAgentMultiTurnQualification } from './agent-multiturn-qualification.mjs';

function capture() {
  let content = '';
  return {
    stream: {
      write(value) {
        content += String(value);
      },
    },
    read() {
      return content;
    },
  };
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function preflight(providerId) {
  return async (_argv, options) => {
    options.stdout.write(
      JSON.stringify({
        version: 1,
        commit: '0123456789abcdef',
        provider: providerId,
        ready: true,
      }) + '\n',
    );
    return 0;
  };
}

function fakeApi({
  requestedProvider,
  firstConcrete = requestedProvider,
  secondConcrete = firstConcrete,
  markerInSecondResponse = true,
  switchTarget = null,
} = {}) {
  const calls = [];
  const turns = [];
  let marker = '';
  let switched = false;
  let restored = false;

  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url);
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({
      pathname: parsed.pathname,
      method,
      body,
      headers: init.headers,
    });

    if (parsed.pathname === '/api/agent/providers' && method === 'GET') {
      return response({
        providers: [
          {
            providerId: switchTarget ?? secondConcrete,
            availability: 'available',
          },
        ],
      });
    }

    if (
      parsed.pathname === '/api/projects/project-1/agent/provider-preference'
    ) {
      if (method === 'GET') return response({ preference: null });
      if (method === 'PUT') {
        switched = true;
        return response({
          preference: {
            projectId: 'project-1',
            preferredProviderId: body.preferredProviderId,
            fallbackOrder: body.fallbackOrder,
            updatedAt: '2026-09-26T12:30:00.000Z',
          },
        });
      }
      if (method === 'DELETE') {
        restored = true;
        return response(null, 204);
      }
    }

    if (
      parsed.pathname === '/api/projects/project-1/agent/tasks' &&
      method === 'POST'
    ) {
      return response({
        task: {
          version: 1,
          task: {
            id: 'task-qualification',
            projectId: 'project-1',
            environmentInstanceId: 'environment:primary:project-1',
            state: 'queued',
            summary: body.summary,
            requestedCapabilities: body.requestedCapabilities,
            createdAt: '2026-09-26T12:30:00.000Z',
            updatedAt: '2026-09-26T12:30:00.000Z',
          },
        },
      });
    }

    if (
      parsed.pathname ===
        '/api/projects/project-1/agent/tasks/task-qualification/executions' &&
      method === 'POST'
    ) {
      const providerId = switched ? secondConcrete : firstConcrete;
      return response(
        executionResult('bootstrap', providerId, body.providerId),
      );
    }

    if (
      parsed.pathname ===
        '/api/projects/project-1/agent/tasks/task-qualification/turns' &&
      method === 'POST'
    ) {
      const turnNumber =
        turns.filter((turn) => turn.role === 'user').length + 1;
      if (turnNumber === 1) {
        marker =
          String(body.content).match(/dd-multiturn-[a-z0-9]+/)?.[0] ?? '';
      }

      const providerId = switched ? secondConcrete : firstConcrete;
      const executionId = 'execution-turn-' + turnNumber;
      const userTurn = {
        id: body.id,
        taskId: 'task-qualification',
        role: 'user',
        content: body.content,
        createdAt: '2026-09-26T12:30:00.000Z',
      };
      const agentTurn = {
        id: 'agent-turn-' + turnNumber,
        taskId: 'task-qualification',
        role: 'agent',
        content:
          turnNumber === 2
            ? markerInSecondResponse
              ? 'Recovered ' + marker
              : 'No previous marker available SECRET_PROVIDER_OUTPUT'
            : 'Marker stored.',
        createdAt: '2026-09-26T12:30:00.000Z',
        executionId,
        providerId,
      };
      turns.push(userTurn, agentTurn);
      return response({
        ...executionResult('turn-' + turnNumber, providerId, body.providerId),
        execution: {
          ...executionResult('turn-' + turnNumber, providerId, body.providerId)
            .execution,
          id: executionId,
        },
        userTurn,
        agentTurn,
      });
    }

    if (
      parsed.pathname ===
        '/api/projects/project-1/agent/tasks/task-qualification/conversation' &&
      method === 'GET'
    ) {
      return response({ turns });
    }

    throw new Error('unexpected request: ' + method + ' ' + parsed.pathname);
  };

  function executionResult(phase, providerId, requestedProviderId) {
    return {
      execution: {
        id: 'execution-' + phase,
        taskId: 'task-qualification',
        projectId: 'project-1',
        environmentInstanceId: 'environment:primary:project-1',
        requestedProviderId,
        providerId,
        state: 'succeeded',
        startedAt: '2026-09-26T12:30:00.000Z',
        finishedAt: '2026-09-26T12:30:01.000Z',
      },
      task: {
        version: 2,
        task: {
          id: 'task-qualification',
          projectId: 'project-1',
          environmentInstanceId: 'environment:primary:project-1',
          state: 'review',
          summary: 'qualification',
          requestedCapabilities: [],
          createdAt: '2026-09-26T12:30:00.000Z',
          updatedAt: '2026-09-26T12:30:01.000Z',
        },
      },
      providerResult: {
        providerId,
        outcome: 'succeeded',
        summary: 'qualification ' + phase,
      },
    };
  }

  return {
    fetchImpl,
    calls,
    wasRestored: () => restored,
  };
}

test('gate multi-turn real usa task read-only e comprova recuperação do contexto sem reenviar o marcador', async () => {
  const stdout = capture();
  const stderr = capture();
  const api = fakeApi({
    requestedProvider: 'codex',
    firstConcrete: 'codex',
  });

  const code = await runAgentMultiTurnQualification(
    ['--provider', 'codex', '--project', 'project-1'],
    {
      fetchImpl: api.fetchImpl,
      readToken: async () => 'fixture-local-token',
      runPreflight: preflight('codex'),
      createMarker: () => 'fixed123',
      stdout: stdout.stream,
      stderr: stderr.stream,
    },
  );

  assert.equal(code, 0);
  assert.equal(stderr.read(), '');
  const output = JSON.parse(stdout.read());
  assert.equal(output.provider, 'codex');
  assert.equal(output.markerRecovered, true);
  assert.deepEqual(output.requestedCapabilities, []);
  assert.deepEqual(
    output.executions.map((item) => item.providerId),
    ['codex', 'codex', 'codex'],
  );

  const createCall = api.calls.find(
    (call) =>
      call.pathname === '/api/projects/project-1/agent/tasks' &&
      call.method === 'POST',
  );
  assert.deepEqual(createCall?.body?.requestedCapabilities, []);

  const turnCalls = api.calls.filter((call) =>
    call.pathname.endsWith('/turns'),
  );
  assert.equal(turnCalls.length, 2);
  assert.match(turnCalls[0]?.body?.content ?? '', /dd-multiturn-fixed123/);
  assert.doesNotMatch(
    turnCalls[1]?.body?.content ?? '',
    /dd-multiturn-fixed123/,
  );
  assert.ok(
    api.calls.every(
      (call) =>
        call.headers?.['x-dev-dashboard-token'] === 'fixture-local-token',
    ),
  );
  assert.equal(stdout.read().includes('fixture-local-token'), false);
});

test('gate falha quando o segundo provider não recupera o marcador e não expõe resposta bruta', async () => {
  const stdout = capture();
  const stderr = capture();
  const api = fakeApi({
    requestedProvider: 'chatgpt-browser',
    firstConcrete: 'chatgpt-browser',
    markerInSecondResponse: false,
  });

  const code = await runAgentMultiTurnQualification(
    ['--provider', 'chatgpt-browser', '--project', 'project-1'],
    {
      fetchImpl: api.fetchImpl,
      readToken: async () => 'fixture-local-token',
      runPreflight: preflight('chatgpt-browser'),
      createMarker: () => 'fixed123',
      stdout: stdout.stream,
      stderr: stderr.stream,
    },
  );

  assert.equal(code, 1);
  assert.equal(stdout.read(), '');
  assert.match(stderr.read(), /não recuperou o marcador/i);
  assert.equal(stderr.read().includes('SECRET_PROVIDER_OUTPUT'), false);
});

test('Automatic pode comprovar troca concreta entre turnos e restaura preferência antes do sucesso', async () => {
  const stdout = capture();
  const stderr = capture();
  const api = fakeApi({
    requestedProvider: 'automatic',
    firstConcrete: 'codex',
    secondConcrete: 'claude-code',
    switchTarget: 'claude-code',
  });

  const code = await runAgentMultiTurnQualification(
    [
      '--provider',
      'automatic',
      '--project',
      'project-1',
      '--automatic-switch-to',
      'claude-code',
    ],
    {
      fetchImpl: api.fetchImpl,
      readToken: async () => 'fixture-local-token',
      runPreflight: preflight('automatic'),
      createMarker: () => 'fixed123',
      stdout: stdout.stream,
      stderr: stderr.stream,
    },
  );

  assert.equal(code, 0);
  assert.equal(stderr.read(), '');
  assert.equal(api.wasRestored(), true);
  const output = JSON.parse(stdout.read());
  assert.deepEqual(output.automaticProviderSwitch, {
    from: 'codex',
    to: 'claude-code',
  });
  assert.equal(output.markerRecovered, true);

  const preferenceCalls = api.calls.filter((call) =>
    call.pathname.endsWith('/agent/provider-preference'),
  );
  assert.deepEqual(
    preferenceCalls.map((call) => call.method),
    ['GET', 'PUT', 'DELETE'],
  );
});

test('gate não inicia task quando o preflight real falha', async () => {
  const stdout = capture();
  const stderr = capture();
  const calls = [];

  const code = await runAgentMultiTurnQualification(
    ['--provider', 'claude-code', '--project', 'project-1'],
    {
      fetchImpl: async (...args) => {
        calls.push(args);
        throw new Error('should not fetch');
      },
      readToken: async () => 'fixture-local-token',
      runPreflight: async (_argv, options) => {
        options.stderr.write(
          'Provider não está pronto para o gate real; nenhum teste de paridade foi declarado.\n',
        );
        return 1;
      },
      createMarker: () => 'fixed123',
      stdout: stdout.stream,
      stderr: stderr.stream,
    },
  );

  assert.equal(code, 1);
  assert.equal(calls.length, 0);
  assert.match(stderr.read(), /provider não está pronto/i);
});

test('gate rejeita API não-loopback antes do preflight', async () => {
  const stderr = capture();
  let preflightCalls = 0;

  const code = await runAgentMultiTurnQualification(
    [
      '--provider',
      'codex',
      '--project',
      'project-1',
      '--api',
      'https://dashboard.example.com',
    ],
    {
      runPreflight: async () => {
        preflightCalls += 1;
        return 0;
      },
      stderr: stderr.stream,
      stdout: capture().stream,
    },
  );

  assert.equal(code, 2);
  assert.equal(preflightCalls, 0);
  assert.match(stderr.read(), /HTTP loopback/i);
});
