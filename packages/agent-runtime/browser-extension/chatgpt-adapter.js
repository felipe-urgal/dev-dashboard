(() => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function findComposer() {
    const selectors = [
      'div[contenteditable="true"][data-testid*="composer" i]',
      'div[contenteditable="true"][role="textbox"]',
      'textarea[placeholder*="message" i]',
      '#prompt-textarea',
      'div[contenteditable="true"]',
    ];
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  }

  function isGenerating() {
    return Boolean(document.querySelector([
      'button[aria-label*="Stop generating" i]',
      'button[aria-label*="stop" i]',
      'button[data-testid*="stop" i]',
    ].join(',')));
  }

  function assistantSignature() {
    const messages = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
    const last = messages.at(-1);
    const children = Number(last?.childElementCount ?? 0);
    const length = Number(last?.textContent?.length ?? 0);
    return `${messages.length}:${children}:${length}`;
  }

  function lastAssistantText() {
    const messages = [...document.querySelectorAll('[data-message-author-role="assistant"]')];
    const last = messages.at(-1);
    return typeof last?.textContent === 'string' ? last.textContent : '';
  }

  function hasUnexpectedInteraction() {
    const selectors = [
      'a[href*="/auth/login"]',
      'button[data-testid*="login" i]',
      '[data-testid*="captcha" i]',
      'iframe[src*="challenge" i]',
      '[aria-label*="verify you are human" i]',
    ];
    return selectors.some((selector) => document.querySelector(selector));
  }

  async function openNewConversation() {
    if (typeof location !== 'undefined' && !/^\/?(?:\?.*)?$/.test(location.pathname + location.search)) {
      const newChat = document.querySelector('a[href="/"],button[aria-label*="New chat" i],[data-testid*="new-chat" i]');
      if (newChat) {
        newChat.click();
        await sleep(400);
      }
    }
  }

  function setComposerText(composer, text) {
    if (!composer) throw Object.assign(new Error('composer not found'), { code: 'composer_not_found' });
    composer.focus?.();
    if ('value' in composer && !composer.isContentEditable) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(composer), 'value')?.set;
      if (setter) setter.call(composer, text); else composer.value = text;
    } else {
      composer.textContent = text;
    }
    const EventCtor = globalThis.InputEvent ?? globalThis.Event;
    if (EventCtor) composer.dispatchEvent?.(new EventCtor('input', { bubbles: true, inputType: 'insertText', data: text }));
  }

  function composerMatches(composer, expected) {
    if (!composer || typeof expected !== 'string') return false;
    const actual = ('value' in composer && !composer.isContentEditable)
      ? String(composer.value ?? '')
      : String(composer.textContent ?? '');
    return actual === expected;
  }

  async function submitPrompt(composer) {
    await sleep(0);
    const send = document.querySelector([
      'button[data-testid="send-button"]',
      'button[aria-label*="Send" i]',
      'button[aria-label*="Enviar" i]',
      'button[type="submit"]',
    ].join(','));
    if (send && !send.disabled) {
      send.click();
      return;
    }
    const form = composer?.closest?.('form');
    if (form?.requestSubmit) {
      form.requestSubmit();
      return;
    }
    throw Object.assign(new Error('send control not found'), { code: 'send_control_not_found' });
  }

  async function observeGenerationStart({ baselineSignature, timeoutMs = 30_000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (hasUnexpectedInteraction()) throw Object.assign(new Error('unexpected interaction'), { code: 'unexpected_interaction' });
      const signature = assistantSignature();
      if (isGenerating() || signature !== baselineSignature) return { signature };
      await sleep(250);
    }
    throw Object.assign(new Error('generation did not start'), { code: 'generation_start_timeout' });
  }

  async function observeGenerationEnd({ quietMs = 5_000, timeoutMs = 2_700_000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    let signature = assistantSignature();
    let changedAt = Date.now();
    while (Date.now() < deadline) {
      if (hasUnexpectedInteraction()) throw Object.assign(new Error('unexpected interaction'), { code: 'unexpected_interaction' });
      const next = assistantSignature();
      if (next !== signature || isGenerating()) {
        signature = next;
        changedAt = Date.now();
      }
      if (!isGenerating() && Date.now() - changedAt >= quietMs) return { signature };
      await sleep(250);
    }
    throw Object.assign(new Error('generation did not finish'), { code: 'generation_timeout' });
  }

  globalThis.ChatGPTAdapter = {
    findComposer,
    isGenerating,
    assistantSignature,
    lastAssistantText,
    hasUnexpectedInteraction,
    openNewConversation,
    setComposerText,
    composerMatches,
    submitPrompt,
    observeGenerationStart,
    observeGenerationEnd,
  };
})();
