const DEFAULT_PORT = 43821;
const ACTIVE_KEY = 'devDashboardAgentBrowserJob';
const POLL_ALARM = 'dev-dashboard-agent-browser-poll';
const TERMINAL_STATES = new Set(['finished', 'failed', 'timed_out', 'cancelled']);

async function config() {
  const value = await chrome.storage.local.get(['bridgeToken', 'bridgePort']);
  return { token: value.bridgeToken || '', port: Number(value.bridgePort || DEFAULT_PORT) };
}

async function bridge(pathname, { method = 'GET', body = null, leaseId = null } = {}) {
  const { token, port } = await config();
  if (!token) throw Object.assign(new Error('bridge token not configured'), { code: 'bridge_token_missing' });
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method,
    headers: {
      'X-Agent-Bridge-Token': token,
      ...(leaseId ? { 'X-Agent-Job-Lease': leaseId } : {}),
      ...(body == null ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(payload?.error?.message || `bridge ${response.status}`), {
      code: payload?.error?.code || `bridge_http_${response.status}`,
    });
  }
  return payload;
}

function envelopeFromToolStatus(status) {
  if (!status || typeof status !== 'object') return null;
  if (status.state === 'succeeded') {
    return {
      type: 'tool_result',
      toolCallId: status.toolCallId,
      ok: true,
      result: status.result ?? null,
    };
  }
  if (status.state === 'failed') {
    return {
      type: 'tool_error',
      toolCallId: status.toolCallId,
      code: status.error?.code || 'tool_failed',
      message: status.error?.message || 'tool failed',
    };
  }
  if (status.state === 'ambiguous') {
    return {
      type: 'tool_error',
      toolCallId: status.toolCallId,
      code: 'tool-call-ambiguous',
      message: status.error?.message || 'estado da tool call é ambíguo',
    };
  }
  return null;
}

async function recoverOrExecuteTool(active, request) {
  const pathname = `/v1/jobs/${active.jobId}/tools/${request.toolCallId}`;
  try {
    const status = await bridge(pathname, { leaseId: active.leaseId });
    const recovered = envelopeFromToolStatus(status);
    if (recovered) return recovered;
  } catch (error) {
    if (error?.code !== 'tool-call-not-found') throw error;
  }

  return bridge(`${pathname}/execute`, {
    method: 'POST',
    body: request,
    leaseId: active.leaseId,
  });
}

async function waitForTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (tab.status === 'complete') return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanupListeners(); reject(new Error('tab load timeout')); }, 30_000);
    const onUpdated = (id, info) => { if (id === tabId && info.status === 'complete') { cleanupListeners(); resolve(); } };
    const onRemoved = (id) => { if (id === tabId) { cleanupListeners(); reject(new Error('tab closed')); } };
    const cleanupListeners = () => { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(onUpdated); chrome.tabs.onRemoved.removeListener(onRemoved); };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}

async function cleanup(active, closeTab = true) {
  await chrome.storage.local.remove(ACTIVE_KEY);
  if (closeTab && active?.tabId) await chrome.tabs.remove(active.tabId).catch(() => {});
}

async function ensureRunning(active) {
  let job = await bridge(`/v1/jobs/${active.jobId}`);
  if (job.state === 'claimed') {
    job = await bridge(`/v1/jobs/${active.jobId}/running`, {
      method: 'POST',
      body: { leaseId: active.leaseId },
    });
  }
  return job;
}

async function reconcileActive() {
  const stored = await chrome.storage.local.get(ACTIVE_KEY);
  const active = stored[ACTIVE_KEY];
  if (!active) return false;

  let job;
  try {
    job = await bridge(`/v1/jobs/${active.jobId}`);
  } catch {
    return true;
  }

  if (TERMINAL_STATES.has(job.state)) {
    await cleanup(active);
    return false;
  }

  try {
    await chrome.tabs.get(active.tabId);
  } catch {
    await bridge(`/v1/jobs/${active.jobId}/fail`, {
      method: 'POST',
      body: { leaseId: active.leaseId, errorCode: 'unknown_after_submit', browserPhase: 'recovery_tab_missing' },
    }).catch(() => {});
    await cleanup(active, false);
    return false;
  }

  let ping = null;
  try {
    ping = await chrome.tabs.sendMessage(active.tabId, {
      type: 'PING_BROWSER_JOB',
      jobId: active.jobId,
    });
  } catch {}

  if (ping?.activeJobId === active.jobId) return true;

  try {
    if (!ping) {
      await chrome.tabs.reload(active.tabId);
      await waitForTab(active.tabId);
    }
    await chrome.tabs.sendMessage(active.tabId, {
      type: 'RESUME_BROWSER_JOB',
      jobId: active.jobId,
      quietMs: 5000,
      timeoutMs: Math.max(1000, Date.parse(job.deadlineAt) - Date.now()),
    });
  } catch {
    await bridge(`/v1/jobs/${active.jobId}/fail`, {
      method: 'POST',
      body: { leaseId: active.leaseId, errorCode: 'unknown_after_submit', browserPhase: 'extension_reload_recovery' },
    }).catch(() => {});
    await cleanup(active);
  }

  return true;
}

async function detectSessionState() {
  const tabs = await chrome.tabs
    .query({ url: 'https://chatgpt.com/*' })
    .catch(() => []);
  let sawUnavailable = false;

  for (const tab of tabs) {
    if (!tab?.id || tab.status !== 'complete') continue;
    try {
      const state = await chrome.tabs.sendMessage(tab.id, {
        type: 'PING_CHATGPT_SESSION',
      });
      if (state?.sessionState === 'available') return 'available';
      if (state?.sessionState === 'unavailable') sawUnavailable = true;
    } catch {
      // A ChatGPT tab without the content script does not prove availability.
    }
  }

  return sawUnavailable ? 'unavailable' : 'unknown';
}

async function poll() {
  const { token } = await config();
  if (!token) return;
  await bridge('/v1/heartbeat', {
    method: 'POST',
    body: {
      version: chrome.runtime.getManifest().version,
      sessionState: await detectSessionState(),
    },
  }).catch(() => {});
  if (await reconcileActive()) return;

  const next = await bridge('/v1/jobs/next').catch(() => null);
  if (!next?.id) return;
  const claimed = await bridge(`/v1/jobs/${next.id}/claim`, { method: 'POST', body: {} });
  const tab = await chrome.tabs.create({ url: 'https://chatgpt.com/', active: true });
  const active = { jobId: claimed.id, leaseId: claimed.leaseId, tabId: tab.id };
  await chrome.storage.local.set({ [ACTIVE_KEY]: active });
  try {
    await waitForTab(tab.id);
    await chrome.tabs.sendMessage(tab.id, {
      type: 'RUN_BROWSER_JOB',
      jobId: claimed.id,
      prompt: claimed.prompt,
      quietMs: 5000,
      timeoutMs: Math.max(1000, Date.parse(claimed.deadlineAt) - Date.now()),
    });
  } catch {
    await bridge(`/v1/jobs/${claimed.id}/fail`, {
      method: 'POST',
      body: { leaseId: claimed.leaseId, errorCode: 'content_script_unavailable', browserPhase: 'before_submit' },
    }).catch(() => {});
    await cleanup(active);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'BROWSER_JOB_EVENT') return false;
  (async () => {
    const stored = await chrome.storage.local.get(ACTIVE_KEY);
    const active = stored[ACTIVE_KEY];
    if (!active || active.jobId !== message.jobId || sender.tab?.id !== active.tabId) return { ignored: true };

    if (message.event === 'running') {
      await ensureRunning(active);
      return { ok: true };
    }

    if (message.event === 'tool_request') {
      const job = await ensureRunning(active);
      if (TERMINAL_STATES.has(job.state)) {
        throw Object.assign(new Error('browser job is terminal'), { code: 'job_not_active' });
      }
      const request = message.request;
      if (!request || typeof request.toolCallId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(request.toolCallId)) {
        throw Object.assign(new Error('invalid toolCallId'), { code: 'invalid_tool_request' });
      }
      const envelope = await recoverOrExecuteTool(active, request);
      return { ok: true, envelope };
    }

    if (message.event === 'finish') {
      const job = await ensureRunning(active);
      if (!TERMINAL_STATES.has(job.state)) {
        await bridge(`/v1/jobs/${active.jobId}/finish`, {
          method: 'POST',
          body: { leaseId: active.leaseId, terminalResult: message.terminalResult },
        });
      }
      await cleanup(active);
      queueMicrotask(poll);
      return { ok: true };
    }

    if (message.event === 'fail') {
      const job = await bridge(`/v1/jobs/${active.jobId}`);
      if (!TERMINAL_STATES.has(job.state)) {
        await bridge(`/v1/jobs/${active.jobId}/fail`, {
          method: 'POST',
          body: { leaseId: active.leaseId, errorCode: message.errorCode, browserPhase: message.browserPhase },
        });
      }
      await cleanup(active);
      return { ok: true };
    }

    return { ignored: true };
  })().then(sendResponse).catch((error) => sendResponse({
    ok: false,
    error: error.message,
    code: error.code || 'browser_extension_error',
  }));
  return true;
});

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 }));
chrome.runtime.onStartup.addListener(() => poll());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) poll();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.bridgeToken || changes.bridgePort)) poll();
});
chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 });
poll();
