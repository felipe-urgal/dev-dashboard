import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

async function loadChatGptAdapter({ assistant } = {}) {
  const code = await fs.readFile(
    new URL('../browser-extension/chatgpt-adapter.js', import.meta.url),
    'utf8',
  );
  const document = {
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      return selector === '[data-message-author-role="assistant"]' && assistant
        ? [assistant]
        : [];
    },
  };
  const context = {
    document,
    globalThis: null,
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  vm.runInNewContext(code, context);
  return context.ChatGPTAdapter;
}

async function loadContentScript({ initialStorage = [], assistantSignature = '0:0:0', assistantText } = {}) {
  const code = await fs.readFile(new URL('../browser-extension/content-script.js', import.meta.url), 'utf8');
  let listener;
  let submits = 0;
  let generationStarts = 0;
  let generationEnds = 0;
  const events = [];
  const storage = new Map(initialStorage);
  const context = {
    setTimeout,
    clearTimeout,
    sessionStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    ChatGPTAdapter: {
      async openNewConversation() {},
      findComposer() { return {}; },
      hasUnexpectedInteraction() { return false; },
      assistantSignature() { return assistantSignature; },
      lastAssistantText() {
        return assistantText ?? '~~~placeholder~~~'.replace(
          '~~~placeholder~~~',
          '```agent-workflow-browser\n{"type":"terminal_result","status":"completed"}\n```',
        );
      },
      setComposerText() {},
      composerMatches() { return true; },
      submitPrompt() { submits += 1; },
      async observeGenerationStart() { generationStarts += 1; },
      async observeGenerationEnd() { generationEnds += 1; },
    },
    chrome: {
      runtime: {
        onMessage: { addListener(fn) { listener = fn; } },
        async sendMessage(message) { events.push(message); return { ok: true }; },
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
    getSubmits: () => submits,
    getGenerationStarts: () => generationStarts,
    getGenerationEnds: () => generationEnds,
    storage,
  };
}

test('adapter reconstrói envelope executável a partir de code block renderizado', async () => {
  const payload = JSON.stringify({
    type: 'terminal_result',
    status: 'completed',
  });
  const codeNode = { textContent: payload };
  const preNode = {
    querySelector(selector) {
      return selector === 'code' ? codeNode : null;
    },
  };
  const assistant = {
    textContent: 'agent-workflow-browser' + payload,
    querySelectorAll(selector) {
      return selector === 'pre' ? [preNode] : [];
    },
  };

  const adapter = await loadChatGptAdapter({ assistant });
  const text = adapter.lastAssistantText();

  assert.match(text, /^\x60{3}agent-workflow-browser\n/);
  assert.match(text, /"type":"terminal_result"/);
  assert.match(text, /\n\x60{3}$/);
});

test('adapter aceita JSON renderizado exato sem elemento pre', async () => {
  const payload = JSON.stringify({
    type: 'terminal_result',
    status: 'completed',
  });
  const assistant = {
    textContent: 'agent-workflow-browser\n' + payload,
    querySelectorAll() {
      return [];
    },
  };

  const adapter = await loadChatGptAdapter({ assistant });
  const text = adapter.lastAssistantText();

  assert.match(text, /^\x60{3}agent-workflow-browser\n/);
  assert.match(text, /"type":"terminal_result"/);
});

test('adapter não escolhe entre múltiplos envelopes renderizados', async () => {
  const payloads = [
    JSON.stringify({ type: 'tool_request', toolCallId: 'a' }),
    JSON.stringify({ type: 'terminal_result', status: 'completed' }),
  ];
  const assistant = {
    textContent: 'rendered fallback',
    querySelectorAll(selector) {
      if (selector !== 'pre') return [];
      return payloads.map((payload) => ({
        querySelector(inner) {
          return inner === 'code' ? { textContent: payload } : null;
        },
      }));
    },
  };

  const adapter = await loadChatGptAdapter({ assistant });
  assert.equal(adapter.lastAssistantText(), 'rendered fallback');
});

test('content script classifica ausência de envelope sem vazar conteúdo', async () => {
  const x = await loadContentScript({
    assistantText: 'texto livre sem envelope executável',
  });

  await x.run({
    type: 'RUN_BROWSER_JOB',
    jobId: 'job-protocol-missing',
    prompt: 'hello',
    quietMs: 0,
    timeoutMs: 1000,
  });

  const failure = x.events.find((event) => event.event === 'fail');
  assert.equal(failure?.errorCode, 'browser_protocol_envelope_missing');
  assert.equal(failure?.browserPhase, 'browser_loop');
  assert.equal(JSON.stringify(failure).includes('texto livre'), false);
});

test('content script never resubmits a job once submit was armed', async () => {
  const x = await loadContentScript();
  await x.run({ type: 'RUN_BROWSER_JOB', jobId: 'job-1', prompt: 'hello', quietMs: 0, timeoutMs: 1000 });
  assert.equal(x.getSubmits(), 1);
  await x.run({ type: 'RUN_BROWSER_JOB', jobId: 'job-1', prompt: 'hello', quietMs: 0, timeoutMs: 1000 });
  assert.equal(x.getSubmits(), 1);
  assert.ok(x.events.some((event) => event.event === 'fail' && event.errorCode === 'unknown_after_submit'));
});

test('content script resumes observation after reload without resubmitting', async () => {
  const jobId = 'job-2';
  const x = await loadContentScript({
    initialStorage: [
      [`dev-dashboard-agent-browser-submitted:${jobId}`, 'submitted'],
      [`dev-dashboard-agent-browser-baseline:${jobId}`, '0:0:0'],
    ],
    assistantSignature: '1:1:42',
  });

  await x.run({ type: 'RESUME_BROWSER_JOB', jobId, quietMs: 0, timeoutMs: 1000 });

  assert.equal(x.getSubmits(), 0);
  assert.equal(x.getGenerationStarts(), 1);
  assert.equal(x.getGenerationEnds(), 1);
  assert.ok(x.events.some((event) => event.event === 'finish' && event.jobId === jobId));
});

test('manifest limits host access to ChatGPT and loopback while allowing configured loopback ports', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('../browser-extension/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.host_permissions.sort(), ['http://127.0.0.1/*', 'https://chatgpt.com/*'].sort());
  assert.equal(manifest.host_permissions.includes('<all_urls>'), false);
});

test('service worker reports ChatGPT session state in heartbeat', async () => {
  const code = await fs.readFile(
    new URL('../browser-extension/service-worker.js', import.meta.url),
    'utf8',
  );
  assert.match(code, /version: chrome\.runtime\.getManifest\(\)\.version/);
  assert.match(code, /sessionState: await detectSessionState\(\)/);
  assert.match(code, /PING_CHATGPT_SESSION/);
});
