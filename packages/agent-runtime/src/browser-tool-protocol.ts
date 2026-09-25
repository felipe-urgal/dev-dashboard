const AGENT_WORKFLOW_ENVELOPE_TYPE = 'agent-workflow-browser';
export const BROWSER_TOOL_REQUEST_TYPE = 'tool_request';
export const BROWSER_TERMINAL_RESULT_TYPE = 'terminal_result';
export const BROWSER_TERMINAL_RESULT_STATUS = 'completed';

export const MAX_AGENT_WORKFLOW_PAYLOAD_BYTES = 32 * 1024;
export const MAX_BROWSER_TOOL_CALL_ID_LENGTH = 128;
export const MAX_BROWSER_TOOL_NAME_LENGTH = 64;
export const MAX_BROWSER_REPO_ALIAS_LENGTH = 128;
const MAX_BROWSER_RESPONSE_CHARS = 16_000;

const TOOL_CALL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const REPO_ALIAS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type BrowserToolProtocolErrorCode =
  'browser-protocol-error' | 'invalid-tool-request';

export class BrowserToolProtocolError extends Error {
  constructor(
    readonly code: BrowserToolProtocolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BrowserToolProtocolError';
  }
}

export interface BrowserToolRequest {
  type: typeof BROWSER_TOOL_REQUEST_TYPE;
  toolCallId: string;
  tool: string;
  repo: string;
  args: Record<string, unknown>;
}

export interface BrowserTerminalResult {
  type: typeof BROWSER_TERMINAL_RESULT_TYPE;
  status: typeof BROWSER_TERMINAL_RESULT_STATUS;
  message?: string;
}

export type BrowserAgentEnvelope = BrowserToolRequest | BrowserTerminalResult;

function fail(
  message: string,
  code: BrowserToolProtocolErrorCode = 'invalid-tool-request',
): never {
  throw new BrowserToolProtocolError(code, message);
}

function assertPlainObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be a JSON object`);
  }
}

function assertKnownFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) {
    fail(`${label} contains unknown field: ${unknown}`);
  }
}

function assertRequiredFields(
  value: Record<string, unknown>,
  required: readonly string[],
  label: string,
): void {
  for (const field of required) {
    if (!Object.prototype.hasOwnProperty.call(value, field)) {
      fail(`${label} requires field ${field}`);
    }
  }
}

function boundedString(
  value: unknown,
  label: string,
  maxLength: number,
  pattern: RegExp,
): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > maxLength ||
    !pattern.test(value)
  ) {
    fail(`${label} is invalid`);
  }

  return value;
}

export function assertBrowserToolRequest(value: unknown): BrowserToolRequest {
  assertPlainObject(value, BROWSER_TOOL_REQUEST_TYPE);
  assertKnownFields(
    value,
    new Set(['type', 'toolCallId', 'tool', 'repo', 'args']),
    BROWSER_TOOL_REQUEST_TYPE,
  );
  assertRequiredFields(
    value,
    ['type', 'toolCallId', 'tool', 'repo', 'args'],
    BROWSER_TOOL_REQUEST_TYPE,
  );

  if (value.type !== BROWSER_TOOL_REQUEST_TYPE) {
    fail(`type must be ${BROWSER_TOOL_REQUEST_TYPE}`);
  }

  const toolCallId = boundedString(
    value.toolCallId,
    'toolCallId',
    MAX_BROWSER_TOOL_CALL_ID_LENGTH,
    TOOL_CALL_ID_PATTERN,
  );
  const tool = boundedString(
    value.tool,
    'tool',
    MAX_BROWSER_TOOL_NAME_LENGTH,
    TOOL_NAME_PATTERN,
  );
  const repo = boundedString(
    value.repo,
    'repo',
    MAX_BROWSER_REPO_ALIAS_LENGTH,
    REPO_ALIAS_PATTERN,
  );
  assertPlainObject(value.args, 'args');

  return {
    type: BROWSER_TOOL_REQUEST_TYPE,
    toolCallId,
    tool,
    repo,
    args: value.args,
  };
}

export function assertBrowserTerminalResult(
  value: unknown,
): BrowserTerminalResult {
  assertPlainObject(value, BROWSER_TERMINAL_RESULT_TYPE);
  assertKnownFields(
    value,
    new Set(['type', 'status', 'message']),
    BROWSER_TERMINAL_RESULT_TYPE,
  );
  assertRequiredFields(value, ['type', 'status'], BROWSER_TERMINAL_RESULT_TYPE);

  if (value.type !== BROWSER_TERMINAL_RESULT_TYPE) {
    fail(`type must be ${BROWSER_TERMINAL_RESULT_TYPE}`);
  }
  if (value.status !== BROWSER_TERMINAL_RESULT_STATUS) {
    fail(`terminal status is invalid: ${String(value.status)}`);
  }

  let message: string | undefined;
  if (value.message !== undefined) {
    if (
      typeof value.message !== 'string' ||
      !value.message.trim() ||
      value.message.length > MAX_BROWSER_RESPONSE_CHARS
    ) {
      fail('terminal message is invalid');
    }
    message = value.message.trim();
  }

  return {
    type: BROWSER_TERMINAL_RESULT_TYPE,
    status: BROWSER_TERMINAL_RESULT_STATUS,
    ...(message ? { message } : {}),
  };
}

export function parseBrowserAgentEnvelope(text: string): BrowserAgentEnvelope {
  if (typeof text !== 'string') {
    fail('browser response must be text', 'browser-protocol-error');
  }

  const fence = String.fromCharCode(96).repeat(3);
  const envelopePattern = new RegExp(
    fence + 'agent-workflow-browser[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n' + fence,
    'g',
  );
  const matches = [...text.matchAll(envelopePattern)];

  if (matches.length === 0) {
    fail(
      `${AGENT_WORKFLOW_ENVELOPE_TYPE} envelope is missing`,
      'browser-protocol-error',
    );
  }
  if (matches.length !== 1) {
    fail(
      `more than one ${AGENT_WORKFLOW_ENVELOPE_TYPE} envelope was returned`,
      'browser-protocol-error',
    );
  }

  const rawPayload = matches[0]?.[1] ?? '';
  if (
    Buffer.byteLength(rawPayload, 'utf8') > MAX_AGENT_WORKFLOW_PAYLOAD_BYTES
  ) {
    fail(
      'browser envelope exceeds the payload limit',
      'browser-protocol-error',
    );
  }

  const payload = rawPayload.trim();
  if (!payload) {
    fail('browser envelope payload is empty', 'browser-protocol-error');
  }

  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    fail('browser envelope contains invalid JSON', 'browser-protocol-error');
  }

  assertPlainObject(value, 'envelope');
  if (value.type === BROWSER_TOOL_REQUEST_TYPE) {
    return assertBrowserToolRequest(value);
  }
  if (value.type === BROWSER_TERMINAL_RESULT_TYPE) {
    return assertBrowserTerminalResult(value);
  }

  fail(
    `browser envelope type is invalid: ${String(value.type)}`,
    'browser-protocol-error',
  );
}
