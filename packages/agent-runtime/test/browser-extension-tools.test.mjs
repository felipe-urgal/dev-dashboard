import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

function fenced(value) {
  return `\`\`\`agent-workflow-browser\n${JSON.stringify(value)}\n\`\`\``;
}

async function loadLoop({
  assistantTurns = [],
  toolResponses = [],
  initialStorage = [],
} = {}) {
  const code = await fs.readFile(new URL('../browser-extension/content-script.js', import.meta.url), 'utf8');
  let listener;
  let generationEnds = 0;
  let submits = 0;
  const events = [];
  const submittedTexts = [];
  const markerSnapshots = [];
  const storage = new Map(initialStorage);
  const composer = { text: '' };

  const context = {
    setTimeout,
    clearTimeout,
    Date,
    JSON,
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    ChatGPTAdapter: {
      async openNewConversation() {},
      findComposer() { return composer; },
      hasUnexpectedInteraction() { return false; },
      assistantSignature() { return `sig-${generationEnds}`; },
      lastAssistantText() { return assistantTurns[Math.max(0, generationEnds - 1)] ?? ''; },
      setComposerText(target, text) { target.text = text; },
      composerMatches(target, expected) { return target.text === expected; },
      async submitPrompt(target) {
        submits += 1;
        submittedTexts.push(target.text);
        markerSnapshots.push(storage.get('dev-dashboard-agent-browser-turn-state:job-1') ?? null);
      },
      async observeGenerationStart() {},
      async observeGenerationEnd() { generationEnds += 1; },
    },
    chrome: {
      runtime: {
        onMessage: { addListener(fn) { listener = fn; } },
        async sendMessage(message) {
          events.push(message);
          if (message.event === 'tool_request') {
            const envelope = toolResponses.shift();
            return { ok: true, envelope };
          }
          return { ok: true };
        },
      },
    },
  };

  vm.runInNewContext(code, context);
  const run = (message) => new Promise((resolve, reject) => {
    const accepted = listener(message, {}, (value) => resolve(value));
    if (accepted !== true) reject(new Error(`message not accepted: ${message.type}`));
  });

  return {
    run,
    events,
    storage,
    submittedTexts,
    markerSnapshots,
    getSubmits: () => submits,
    getGenerationEnds: () => generationEnds,
  };
}

test('loop processa múltiplas tools e só finaliza em terminal_result', async () => {
  const x = await loadLoop({
    assistantTurns: [
      fenced({ type: 'tool_request', toolCallId: 'call-1', tool: 'read_file', repo: 'home-music', args: { path: 'README.md' } }),
      fenced({ type: 'tool_request', toolCallId: 'call-2', tool: 'git_status', repo: 'home-music', args: {} }),
      fenced({ type: 'terminal_result', status: 'completed' }),
    ],
    toolResponses: [
      { type: 'tool_result', toolCallId: 'call-1', ok: true, result: { content: 'hello' } },
      { type: 'tool_result', toolCallId: 'call-2', ok: true, result: { output: '## main' } },
    ],
  });

  await x.run({ type: 'RUN_BROWSER_JOB', jobId: 'job-1', prompt: 'bootstrap', quietMs: 0, timeoutMs: 10_000 });

  assert.equal(x.getSubmits(), 3);
  assert.equal(x.getGenerationEnds(), 3);
  assert.equal(x.submittedTexts[0], 'bootstrap');
  assert.match(x.submittedTexts[1], /"type":"tool_result".*"toolCallId":"call-1"/);
  assert.match(x.submittedTexts[2], /"type":"tool_result".*"toolCallId":"call-2"/);

  const toolEvents = x.events.filter((event) => event.event === 'tool_request');
  const finishEvents = x.events.filter((event) => event.event === 'finish');
  assert.deepEqual(toolEvents.map((event) => event.request.toolCallId), ['call-1', 'call-2']);
  assert.equal(finishEvents.length, 1);
  assert.deepEqual(finishEvents[0].terminalResult, { type: 'terminal_result', status: 'completed' });

  assert.equal(x.markerSnapshots[0], null);
  assert.match(x.markerSnapshots[1], /"toolCallId":"call-1".*"state":"armed"/);
  assert.match(x.markerSnapshots[2], /"toolCallId":"call-2".*"state":"armed"/);
  assert.equal(x.storage.has('dev-dashboard-agent-browser-turn-state:job-1'), false);
});

test('tool_error do bridge volta à conversa e permite novo turno', async () => {
  const x = await loadLoop({
    assistantTurns: [
      fenced({ type: 'tool_request', toolCallId: 'call-denied', tool: 'git_create_branch', repo: 'home-music', args: { branch: 'feature/x' } }),
      fenced({ type: 'terminal_result', status: 'completed' }),
    ],
    toolResponses: [
      { type: 'tool_error', toolCallId: 'call-denied', code: 'authorization_denied', message: 'operação não autorizada' },
    ],
  });

  await x.run({ type: 'RUN_BROWSER_JOB', jobId: 'job-1', prompt: 'bootstrap', quietMs: 0, timeoutMs: 10_000 });
  assert.equal(x.getSubmits(), 2);
  assert.match(x.submittedTexts[1], /"type":"tool_error"/);
  assert.match(x.submittedTexts[1], /authorization_denied/);
  assert.equal(x.events.filter((event) => event.event === 'finish').length, 1);
});

test('reload com tool_result possivelmente submetido nunca reenvia automaticamente', async () => {
  const x = await loadLoop({
    initialStorage: [
      ['dev-dashboard-agent-browser-submitted:job-1', 'submitted'],
      ['dev-dashboard-agent-browser-baseline:job-1', 'sig-1'],
      ['dev-dashboard-agent-browser-turn-state:job-1', JSON.stringify({ toolCallId: 'call-7', state: 'submitted' })],
    ],
  });

  await x.run({ type: 'RESUME_BROWSER_JOB', jobId: 'job-1', quietMs: 0, timeoutMs: 10_000 });

  assert.equal(x.getSubmits(), 0);
  const failures = x.events.filter((event) => event.event === 'fail');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].errorCode, 'unknown_after_submit');
  assert.equal(failures[0].browserPhase, 'after_submit');
});

test('geração sem envelope executável falha protocolo sem finish', async () => {
  const x = await loadLoop({ assistantTurns: ['texto livre sem envelope'] });
  await x.run({ type: 'RUN_BROWSER_JOB', jobId: 'job-1', prompt: 'bootstrap', quietMs: 0, timeoutMs: 10_000 });
  assert.equal(x.events.some((event) => event.event === 'finish'), false);
  const failure = x.events.find((event) => event.event === 'fail');
  assert.equal(failure.errorCode, 'browser_protocol_error');
  assert.equal(failure.browserPhase, 'browser_loop');
});


async function loadServiceWorker({ toolStatus, executeEnvelope } = {}) {
  const code = await fs.readFile(new URL('../browser-extension/service-worker.js', import.meta.url), 'utf8');
  let messageListener;
  let initialized = false;
  const active = { jobId: 'job-1', leaseId: 'lease-1', tabId: 7 };
  const calls = [];

  const fetch = async (url, options = {}) => {
    const pathname = new URL(url).pathname;
    const method = options.method ?? 'GET';
    calls.push({ pathname, method, headers: options.headers ?? {}, body: options.body ?? null });

    if (pathname === '/v1/jobs/job-1' && method === 'GET') {
      return { ok: true, status: 200, async json() { return { id: 'job-1', state: 'running' }; } };
    }
    if (pathname === '/v1/jobs/job-1/tools/call-1' && method === 'GET') {
      if (toolStatus == null) {
        return {
          ok: false,
          status: 404,
          async json() { return { error: { code: 'tool-call-not-found', message: 'missing' } }; },
        };
      }
      return { ok: true, status: 200, async json() { return toolStatus; } };
    }
    if (pathname === '/v1/jobs/job-1/tools/call-1/execute' && method === 'POST') {
      return {
        ok: true,
        status: 200,
        async json() {
          return executeEnvelope ?? { type: 'tool_result', toolCallId: 'call-1', ok: true, result: { content: 'fresh' } };
        },
      };
    }
    throw new Error(`unexpected fetch ${method} ${pathname}`);
  };

  const chrome = {
    storage: {
      local: {
        async get(keys) {
          if (keys === 'devDashboardAgentBrowserJob') return { devDashboardAgentBrowserJob: active };
          if (Array.isArray(keys) && keys.includes('bridgeToken')) {
            return { bridgeToken: initialized ? 'token' : '', bridgePort: 43821 };
          }
          return {};
        },
        async set() {},
        async remove() {},
      },
      onChanged: { addListener() {} },
    },
    runtime: {
      getManifest() { return { version: 'test' }; },
      onMessage: { addListener(fn) { messageListener = fn; } },
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
    },
    alarms: {
      create() {},
      onAlarm: { addListener() {} },
    },
    tabs: {
      async get() { return { id: 7, status: 'complete' }; },
      async create() { return { id: 7 }; },
      async remove() {},
      async reload() {},
      async sendMessage() { return { activeJobId: 'job-1' }; },
      onUpdated: { addListener() {}, removeListener() {} },
      onRemoved: { addListener() {}, removeListener() {} },
    },
  };

  vm.runInNewContext(code, { chrome, fetch, URL, setTimeout, clearTimeout, queueMicrotask, Date, JSON, Promise });
  initialized = true;

  const sendToolRequest = () => new Promise((resolve, reject) => {
    const accepted = messageListener({
      type: 'BROWSER_JOB_EVENT',
      jobId: 'job-1',
      event: 'tool_request',
      request: {
        type: 'tool_request',
        toolCallId: 'call-1',
        tool: 'read_file',
        repo: 'home-music',
        args: { path: 'README.md' },
      },
    }, { tab: { id: 7 } }, resolve);
    if (accepted !== true) reject(new Error('service worker did not accept tool request'));
  });

  return { calls, sendToolRequest };
}

test('service worker consulta store antes de repetir tool já concluída', async () => {
  const x = await loadServiceWorker({
    toolStatus: {
      jobId: 'job-1',
      toolCallId: 'call-1',
      state: 'succeeded',
      mutable: false,
      result: { content: 'cached' },
      error: null,
    },
  });

  const response = await x.sendToolRequest();
  assert.equal(response.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(response.envelope)), {
    type: 'tool_result',
    toolCallId: 'call-1',
    ok: true,
    result: { content: 'cached' },
  });
  assert.equal(x.calls.filter((call) => call.pathname.endsWith('/tools/call-1') && call.method === 'GET').length, 1);
  assert.equal(x.calls.filter((call) => call.pathname.endsWith('/tools/call-1/execute')).length, 0);
});

test('service worker executa somente quando store ainda não conhece a toolCallId', async () => {
  const x = await loadServiceWorker({ toolStatus: null });
  const response = await x.sendToolRequest();
  assert.equal(response.ok, true);
  assert.equal(response.envelope.result.content, 'fresh');
  assert.equal(x.calls.filter((call) => call.pathname.endsWith('/tools/call-1') && call.method === 'GET').length, 1);
  assert.equal(x.calls.filter((call) => call.pathname.endsWith('/tools/call-1/execute') && call.method === 'POST').length, 1);
});

test('service worker devolve mutação ambígua do store sem retry automático', async () => {
  const x = await loadServiceWorker({
    toolStatus: {
      jobId: 'job-1',
      toolCallId: 'call-1',
      state: 'ambiguous',
      mutable: true,
      result: null,
      error: { code: 'tool-call-ambiguous', message: 'restart durante mutação' },
    },
  });
  const response = await x.sendToolRequest();
  assert.equal(response.ok, true);
  assert.equal(response.envelope.type, 'tool_error');
  assert.equal(response.envelope.code, 'tool-call-ambiguous');
  assert.equal(x.calls.some((call) => call.pathname.endsWith('/execute')), false);
});
