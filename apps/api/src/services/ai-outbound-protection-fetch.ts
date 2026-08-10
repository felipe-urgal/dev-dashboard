import { maskSensitiveLogContent } from '@dev-dashboard/process-manager';

type JsonObject = Record<string, unknown>;

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function protectText(value: string): string {
  return maskSensitiveLogContent(value).content;
}

function protectChatBody(body: JsonObject): boolean {
  if (!Array.isArray(body.messages)) return false;

  let changed = false;
  body.messages = body.messages.map((value) => {
    const message = asObject(value);
    if (!message || typeof message.content !== 'string') return value;

    const content = protectText(message.content);
    if (content === message.content) return value;
    changed = true;
    return { ...message, content };
  });
  return changed;
}

function protectGenerateBody(body: JsonObject): boolean {
  let changed = false;
  for (const field of ['prompt', 'suffix'] as const) {
    const value = body[field];
    if (typeof value !== 'string') continue;
    const protectedValue = protectText(value);
    if (protectedValue === value) continue;
    body[field] = protectedValue;
    changed = true;
  }
  return changed;
}

function endpointPath(input: Parameters<typeof fetch>[0]): string {
  try {
    return new URL(requestUrl(input)).pathname;
  } catch {
    return requestUrl(input);
  }
}

function protectedBody(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
): string | null {
  if (typeof init?.body !== 'string') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(init.body);
  } catch {
    return null;
  }

  const body = asObject(parsed);
  if (!body) return null;

  const path = endpointPath(input);
  const changed =
    path.endsWith('/api/chat') || path.endsWith('/chat/completions')
      ? protectChatBody(body)
      : path.endsWith('/api/generate')
        ? protectGenerateBody(body)
        : false;

  return changed ? JSON.stringify(body) : null;
}

/**
 * Última barreira antes de enviar texto ao motor de IA. A proteção vale para
 * providers locais e cloud suportados para impedir que chat, implementation,
 * review ou completion ganhem caminhos diferentes de sanitização.
 *
 * Apenas conteúdo textual é mascarado; nomes de modelo, catálogo de tools,
 * credenciais em headers e demais opções do protocolo permanecem intactos.
 */
export function createAiOutboundProtectionFetch(
  fetchImpl: typeof fetch = fetch,
): typeof fetch {
  return (async (input, init) => {
    const body = protectedBody(input, init);
    if (body === null) return fetchImpl(input, init);
    return fetchImpl(input, { ...init, body });
  }) as typeof fetch;
}
