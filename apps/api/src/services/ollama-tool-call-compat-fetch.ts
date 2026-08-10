type JsonObject = Record<string, unknown>;

interface LeakedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

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

function advertisedToolNames(body: JsonObject): Set<string> {
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const names = tools
    .map((tool) => asObject(tool))
    .map((tool) => asObject(tool?.function))
    .map((fn) => fn?.name)
    .filter((name): name is string => typeof name === 'string');
  return new Set(names);
}

function parseLeakedToolCall(
  content: string,
  allowedNames: ReadonlySet<string>,
): LeakedToolCall | null {
  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  if (!normalized) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    return null;
  }

  const object = asObject(parsed);
  if (!object) return null;

  const functionObject = asObject(object.function);
  const name = functionObject?.name ?? object.name;
  const args = functionObject?.arguments ?? object.arguments;
  if (typeof name !== 'string' || !allowedNames.has(name)) return null;

  const argumentsObject = asObject(args);
  if (!argumentsObject) return null;
  return { name, arguments: argumentsObject };
}

function shouldInspect(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
): JsonObject | null {
  if (!requestUrl(input).endsWith('/api/chat')) return null;
  if (typeof init?.body !== 'string') return null;

  try {
    const body = asObject(JSON.parse(init.body));
    if (!body || !Array.isArray(body.tools) || body.tools.length === 0)
      return null;
    return body;
  } catch {
    return null;
  }
}

/**
 * Compatibilidade para modelos do Ollama que anunciam suporte a tools, mas
 * devolvem a chamada como JSON textual em `message.content`. O adaptador
 * converte somente chamadas para ferramentas que o próprio request anunciou,
 * preservando o catálogo fechado do AiAssistantService.
 */
export function createOllamaToolCallCompatFetch(
  fetchImpl: typeof fetch = fetch,
): typeof fetch {
  return (async (input, init) => {
    const requestBody = shouldInspect(input, init);
    const response = await fetchImpl(input, init);
    if (!requestBody || !response.ok) return response;

    const rawBody = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(rawBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    const root = asObject(payload);
    const message = asObject(root?.message);
    const content = message?.content;
    if (typeof content !== 'string' || Array.isArray(message?.tool_calls)) {
      return new Response(rawBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    const leaked = parseLeakedToolCall(
      content,
      advertisedToolNames(requestBody),
    );
    if (!leaked || !root || !message) {
      return new Response(rawBody, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    message.content = '';
    message.tool_calls = [
      {
        function: {
          name: leaked.name,
          arguments: leaked.arguments,
        },
      },
    ];

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    return new Response(JSON.stringify(root), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }) as typeof fetch;
}
