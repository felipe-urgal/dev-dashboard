(() => {
  const MAX_TOOL_TURNS = 64;
  let activeJobId = null;

  function markerKey(jobId) {
    return `dev-dashboard-agent-browser-submitted:${jobId}`;
  }

  function legacyMarkerKey(jobId) {
    return `dev-dashboard-agent-browser-submitted:${jobId}`;
  }

  function baselineKey(jobId) {
    return `dev-dashboard-agent-browser-baseline:${jobId}`;
  }

  function legacyBaselineKey(jobId) {
    return `dev-dashboard-agent-browser-baseline:${jobId}`;
  }

  function turnKey(jobId) {
    return `dev-dashboard-agent-browser-turn-state:${jobId}`;
  }

  function readMarker(jobId) {
    return sessionStorage.getItem(markerKey(jobId)) ?? sessionStorage.getItem(legacyMarkerKey(jobId));
  }

  function readBaseline(jobId) {
    return sessionStorage.getItem(baselineKey(jobId)) ?? sessionStorage.getItem(legacyBaselineKey(jobId));
  }

  function clearStorage(key) {
    if (typeof sessionStorage.removeItem === 'function') sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, '');
  }

  function remaining(deadline) {
    return Math.max(1, deadline - Date.now());
  }

  function parseAgentWorkflowEnvelope(text) {
    if (typeof text !== 'string') throw Object.assign(new Error('assistant turn is not text'), { code: 'browser_protocol_turn_not_text' });
    const pattern = /```agent-workflow-browser[ \t]*\r?\n([\s\S]*?)\r?\n```/g;
    const matches = [...text.matchAll(pattern)];
    if (matches.length !== 1) {
      throw Object.assign(new Error(matches.length ? 'multiple executable envelopes' : 'executable envelope missing'), {
        code: matches.length
          ? 'browser_protocol_multiple_envelopes'
          : 'browser_protocol_envelope_missing',
      });
    }
    let value;
    try { value = JSON.parse(matches[0][1].trim()); }
    catch { throw Object.assign(new Error('invalid executable envelope JSON'), { code: 'browser_protocol_envelope_invalid_json' }); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw Object.assign(new Error('invalid executable envelope'), { code: 'browser_protocol_envelope_invalid' });
    }
    if (!['tool_request', 'terminal_result'].includes(value.type)) {
      throw Object.assign(new Error('unsupported executable envelope type'), { code: 'browser_protocol_envelope_unsupported' });
    }
    return value;
  }

  function formatAgentWorkflowEnvelope(value) {
    return '```agent-workflow-browser\n' + JSON.stringify(value) + '\n```';
  }

  async function reportFailure(jobId, errorCode, browserPhase) {
    await chrome.runtime.sendMessage({
      type: 'BROWSER_JOB_EVENT',
      jobId,
      event: 'fail',
      errorCode,
      browserPhase,
    }).catch(() => {});
  }

  async function findComposer() {
    const deadline = Date.now() + 30_000;
    let composer = ChatGPTAdapter.findComposer();
    while (!composer && Date.now() < deadline) {
      if (ChatGPTAdapter.hasUnexpectedInteraction()) {
        throw Object.assign(new Error('unexpected interaction'), { code: 'unexpected_interaction' });
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      composer = ChatGPTAdapter.findComposer();
    }
    if (!composer) throw Object.assign(new Error('composer not found'), { code: 'composer_not_found' });
    return composer;
  }

  async function submitAutomaticTurn({ jobId, toolCallId, envelope, quietMs, deadline }) {
    const composer = await findComposer();
    const baselineSignature = ChatGPTAdapter.assistantSignature();
    sessionStorage.setItem(baselineKey(jobId), baselineSignature);
    ChatGPTAdapter.setComposerText(composer, formatAgentWorkflowEnvelope(envelope));
    if (!ChatGPTAdapter.composerMatches(composer, formatAgentWorkflowEnvelope(envelope))) {
      throw Object.assign(new Error('composer text mismatch'), { code: 'composer_text_mismatch' });
    }

    sessionStorage.setItem(turnKey(jobId), JSON.stringify({ toolCallId, state: 'armed' }));
    let submitAmbiguous = true;
    try {
      await ChatGPTAdapter.submitPrompt(composer);
      sessionStorage.setItem(turnKey(jobId), JSON.stringify({ toolCallId, state: 'submitted' }));
      await ChatGPTAdapter.observeGenerationStart({
        baselineSignature,
        timeoutMs: Math.min(remaining(deadline), 60_000),
      });
      await ChatGPTAdapter.observeGenerationEnd({
        quietMs,
        timeoutMs: remaining(deadline),
      });
      submitAmbiguous = false;
      clearStorage(turnKey(jobId));
    } catch (error) {
      if (submitAmbiguous) error.submittedAmbiguous = true;
      throw error;
    }
  }

  async function processTurns({ jobId, quietMs, deadline }) {
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn += 1) {
      const envelope = parseAgentWorkflowEnvelope(ChatGPTAdapter.lastAssistantText());

      if (envelope.type === 'terminal_result') {
        const response = await chrome.runtime.sendMessage({
          type: 'BROWSER_JOB_EVENT',
          jobId,
          event: 'finish',
          terminalResult: envelope,
        });
        if (response?.ok === false) {
          throw Object.assign(new Error(response.error || 'terminal result rejected'), {
            code: response.code || 'browser_protocol_error',
          });
        }
        return;
      }

      if (typeof envelope.toolCallId !== 'string' || !envelope.toolCallId) {
        throw Object.assign(new Error('toolCallId missing'), { code: 'browser_protocol_tool_call_id_missing' });
      }

      const response = await chrome.runtime.sendMessage({
        type: 'BROWSER_JOB_EVENT',
        jobId,
        event: 'tool_request',
        request: envelope,
      });
      if (!response?.envelope) {
        throw Object.assign(new Error(response?.error || 'tool transport failed'), {
          code: response?.code || 'tool_transport_failed',
        });
      }

      await submitAutomaticTurn({
        jobId,
        toolCallId: envelope.toolCallId,
        envelope: response.envelope,
        quietMs,
        deadline,
      });
    }

    throw Object.assign(new Error('tool turn limit exceeded'), { code: 'browser_protocol_turn_limit' });
  }

  async function runJob(message) {
    const { jobId, prompt, quietMs = 5000, timeoutMs = 2700000 } = message;
    const marker = markerKey(jobId);
    const baselineMarker = baselineKey(jobId);
    const existingMarker = readMarker(jobId);
    const deadline = Date.now() + timeoutMs;
    let initialSubmitAmbiguous = false;
    activeJobId = jobId;

    try {
      if (existingMarker) {
        throw Object.assign(new Error('job submit state is already armed in this tab'), {
          code: 'duplicate_submit_guard',
          submittedAmbiguous: true,
        });
      }

      await ChatGPTAdapter.openNewConversation();
      const composer = await findComposer();
      const baselineSignature = ChatGPTAdapter.assistantSignature();
      sessionStorage.setItem(baselineMarker, baselineSignature);
      ChatGPTAdapter.setComposerText(composer, prompt);
      if (!ChatGPTAdapter.composerMatches(composer, prompt)) {
        throw Object.assign(new Error('composer text mismatch'), { code: 'composer_text_mismatch' });
      }

      sessionStorage.setItem(marker, 'armed');
      initialSubmitAmbiguous = true;
      await ChatGPTAdapter.submitPrompt(composer);
      sessionStorage.setItem(marker, 'submitted');

      await ChatGPTAdapter.observeGenerationStart({
        baselineSignature,
        timeoutMs: Math.min(remaining(deadline), 60_000),
      });
      await chrome.runtime.sendMessage({ type: 'BROWSER_JOB_EVENT', jobId, event: 'running' });
      await ChatGPTAdapter.observeGenerationEnd({ quietMs, timeoutMs: remaining(deadline) });
      initialSubmitAmbiguous = false;

      await processTurns({ jobId, quietMs, deadline });
    } catch (error) {
      const ambiguous = error?.submittedAmbiguous === true || initialSubmitAmbiguous;
      const errorCode = ambiguous
        ? (error?.code === 'unexpected_interaction' ? 'unexpected_interaction' : 'unknown_after_submit')
        : (error?.code || 'browser_ui_failure');
      await reportFailure(jobId, errorCode, ambiguous ? 'after_submit' : 'browser_loop');
    } finally {
      if (activeJobId === jobId) activeJobId = null;
    }
  }

  async function resumeJob(message) {
    const { jobId, quietMs = 5000, timeoutMs = 2700000 } = message;
    const marker = readMarker(jobId);
    const baselineSignature = readBaseline(jobId);
    const pendingTurn = sessionStorage.getItem(turnKey(jobId));
    const deadline = Date.now() + timeoutMs;
    activeJobId = jobId;

    try {
      if (!marker || baselineSignature == null) {
        throw Object.assign(new Error('submit state unavailable during recovery'), { code: 'recovery_state_missing' });
      }
      if (pendingTurn) {
        throw Object.assign(new Error('automatic turn submit is ambiguous after reload'), {
          code: 'unknown_after_submit',
          submittedAmbiguous: true,
        });
      }

      await ChatGPTAdapter.observeGenerationStart({
        baselineSignature,
        timeoutMs: Math.min(remaining(deadline), 60_000),
      });
      await chrome.runtime.sendMessage({ type: 'BROWSER_JOB_EVENT', jobId, event: 'running' });
      await ChatGPTAdapter.observeGenerationEnd({ quietMs, timeoutMs: remaining(deadline) });
      await processTurns({ jobId, quietMs, deadline });
    } catch (error) {
      const ambiguous = error?.submittedAmbiguous === true || error?.code === 'unknown_after_submit';
      const errorCode = ambiguous
        ? 'unknown_after_submit'
        : (error?.code === 'unexpected_interaction' ? 'unexpected_interaction' : (error?.code || 'browser_ui_failure'));
      await reportFailure(jobId, errorCode, ambiguous ? 'after_submit' : 'recovery');
    } finally {
      if (activeJobId === jobId) activeJobId = null;
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'PING_CHATGPT_SESSION') {
      sendResponse({
        sessionState: ChatGPTAdapter.hasUnexpectedInteraction()
          ? 'unavailable'
          : ChatGPTAdapter.findComposer()
            ? 'available'
            : 'unknown',
      });
      return false;
    }

    if (message?.type === 'PING_BROWSER_JOB') {
      sendResponse({
        activeJobId,
        hasMarker: Boolean(message.jobId && (readMarker(message.jobId) || sessionStorage.getItem(turnKey(message.jobId)))),
      });
      return false;
    }

    if (message?.type === 'RUN_BROWSER_JOB') {
      runJob(message).then(() => sendResponse({ accepted: true }));
      return true;
    }

    if (message?.type === 'RESUME_BROWSER_JOB') {
      resumeJob(message).then(() => sendResponse({ accepted: true }));
      return true;
    }

    return false;
  });
})();
