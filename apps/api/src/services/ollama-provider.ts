import type {
  AiCapability,
  AiModelInfo,
  ProjectAiStatus,
} from '@dev-dashboard/contracts';

import { createAiOutboundProtectionFetch } from './ai-outbound-protection-fetch.js';
import {
  AiProviderError,
  type AiProvider,
  type AiProviderChatRoundOptions,
  type AiProviderChatRoundResult,
  type AiProviderMessage,
  type AiProviderToolCall,
  type AiProviderToolDefinition,
} from './ai-provider.js';

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);
const STATUS_TIMEOUT_MS = 5_000;
const MAX_MODELS_INSPECTED = 20;

type LeakedToolCallMode = 'convert' | 'error';

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

interface OllamaChatChunk {
  message?: { role?: string; content?: string; tool_calls?: OllamaToolCall[] };
  done?: boolean;
}

interface OllamaProviderOptions {
  fetchImpl?: typeof fetch;
  leakedToolCallMode?: LeakedToolCallMode;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function providerRequestFailed(message: string): AiProviderError {
  return new AiProviderError('AI_PROVIDER_REQUEST_FAILED', message);
}

function invalidResponse(message: string): AiProviderError {
  return new AiProviderError('AI_PROVIDER_INVALID_RESPONSE', message);
}

function parseLeakedToolCall(
  content: string,
  allowedNames: ReadonlySet<string>,
): { call?: AiProviderToolCall; invalidName?: string } | null {
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
  if (!argumentsObject) return { invalidName: name };
  return { call: { name, arguments: argumentsObject } };
}

function ollamaMessages(messages: readonly AiProviderMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.toolName ? { tool_name: message.toolName } : {}),
  }));
}

function ollamaTools(tools: readonly AiProviderToolDefinition[]) {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

export function resolveOllamaBaseUrl(): string | undefined {
  const raw = process.env.DEV_DASHBOARD_OLLAMA_URL ?? DEFAULT_OLLAMA_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:') return undefined;
    if (!LOOPBACK_HOSTNAMES.has(url.hostname)) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

/**
 * Adapter do Ollama. Todo detalhe de HTTP, payload nativo, descoberta de
 * modelos e compatibilidade de tool-calling fica isolado aqui.
 */
export class OllamaProvider implements AiProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly leakedToolCallMode: LeakedToolCallMode;

  public constructor(options: OllamaProviderOptions = {}) {
    this.fetchImpl = createAiOutboundProtectionFetch(
      options.fetchImpl ?? fetch,
    );
    this.leakedToolCallMode = options.leakedToolCallMode ?? 'convert';
  }

  public async status(): Promise<ProjectAiStatus> {
    const baseUrl = resolveOllamaBaseUrl();
    if (!baseUrl) {
      return {
        available: false,
        models: [],
        errorCode: 'AI_PROVIDER_UNAVAILABLE',
        message:
          'DEV_DASHBOARD_OLLAMA_URL nÃ£o aponta para um endereÃ§o HTTP local (loopback); o assistente de IA estÃ¡ desabilitado.',
      };
    }

    let tags: { models?: Array<{ name: string; model?: string }> };
    try {
      tags = await this.getJson(`${baseUrl}/api/tags`, STATUS_TIMEOUT_MS);
    } catch (error) {
      return {
        available: false,
        baseUrl,
        models: [],
        errorCode:
          error instanceof AiProviderError &&
          error.code === 'AI_PROVIDER_TIMEOUT'
            ? 'AI_PROVIDER_TIMEOUT'
            : 'AI_PROVIDER_UNAVAILABLE',
        message:
          error instanceof AiProviderError &&
          error.code === 'AI_PROVIDER_TIMEOUT'
            ? 'O Ollama demorou demais para responder ao status.'
            : `Ollama local nÃ£o foi detectado em ${baseUrl}. Instale e inicie o Ollama manualmente para habilitar o assistente de IA.`,
      };
    }

    const names = (tags.models ?? [])
      .map((model) => model.name ?? model.model)
      .filter((name): name is string => Boolean(name));

    const models: AiModelInfo[] = [];
    for (const name of names.slice(0, MAX_MODELS_INSPECTED)) {
      models.push({
        name,
        capabilities: await this.capabilitiesFor(baseUrl, name),
      });
    }
    for (const name of names.slice(MAX_MODELS_INSPECTED)) {
      models.push({ name, capabilities: ['chat'] });
    }

    return {
      available: true,
      baseUrl,
      models,
      message:
        models.length > 0
          ? `${models.length} ${models.length === 1 ? 'modelo instalado' : 'modelos instalados'} no Ollama local.`
          : 'Ollama local detectado, mas nenhum modelo estÃ¡ instalado.',
    };
  }

  public async chatRound(
    model: string,
    messages: readonly AiProviderMessage[],
    options: AiProviderChatRoundOptions,
  ): Promise<AiProviderChatRoundResult> {
    const baseUrl = resolveOllamaBaseUrl();
    if (!baseUrl) {
      throw new AiProviderError(
        'AI_PROVIDER_UNAVAILABLE',
        'O assistente de IA local estÃ¡ desabilitado neste ambiente.',
      );
    }

    const timeoutController = new AbortController();
    const timeoutMs = options.timeoutMs;
    const timeout =
      timeoutMs === null || timeoutMs === undefined
        ? undefined
        : setTimeout(() => timeoutController.abort(), timeoutMs);
    const onAbort = (): void => timeoutController.abort();
    options.signal.addEventListener('abort', onAbort);

    try {
      const tools = options.tools ?? [];
      const response = await this.fetchImpl(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: ollamaMessages(messages),
          ...(tools.length > 0 ? { tools: ollamaTools(tools) } : {}),
          ...(options.format ? { format: options.format } : {}),
          ...(options.maxOutputTokens || options.temperature !== undefined
            ? {
                options: {
                  ...(options.maxOutputTokens
                    ? { num_predict: options.maxOutputTokens }
                    : {}),
                  ...(options.temperature !== undefined
                    ? { temperature: options.temperature }
                    : {}),
                },
              }
            : {}),
          stream: tools.length === 0,
        }),
        signal: timeoutController.signal,
      });
      if (!response.ok || !response.body) {
        throw providerRequestFailed(
          `O Ollama respondeu com status ${response.status}.`,
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const allowedToolNames = new Set(tools.map((tool) => tool.name));
      const toolCalls: AiProviderToolCall[] = [];
      let buffer = '';
      let assistantContent = '';

      const leakedToolCallError = (name: string): AiProviderError =>
        invalidResponse(
          `O modelo "${model}" tentou usar a ferramenta "${name}", mas escreveu a ` +
            'chamada como texto em vez de utilizar o mecanismo de tool-calling do Ollama, ' +
            'entÃ£o nada foi executado. Tente novamente com um modelo com suporte mais ' +
            'confiÃ¡vel a ferramentas (ex.: qwen2.5-coder:14b).',
        );

      const handleLine = (rawLine: string): void => {
        const line = rawLine.trim();
        if (!line) return;

        let chunk: OllamaChatChunk;
        try {
          chunk = JSON.parse(line) as OllamaChatChunk;
        } catch {
          throw invalidResponse(
            'O Ollama enviou um trecho de resposta que nÃ£o pÃ´de ser interpretado.',
          );
        }

        const structuredCalls = chunk.message?.tool_calls ?? [];
        if (structuredCalls.length > 0) {
          toolCalls.push(
            ...structuredCalls.map((call) => ({
              name: call.function.name,
              arguments: call.function.arguments,
            })),
          );
        }

        const content = chunk.message?.content;
        if (!content) return;

        if (structuredCalls.length === 0 && allowedToolNames.size > 0) {
          const leaked = parseLeakedToolCall(content, allowedToolNames);
          if (leaked?.call) {
            if (this.leakedToolCallMode === 'convert') {
              toolCalls.push(leaked.call);
              return;
            }
            assistantContent += content;
            options.onTextDelta?.(content);
            throw leakedToolCallError(leaked.call.name);
          }
          if (leaked?.invalidName) {
            assistantContent += content;
            options.onTextDelta?.(content);
            throw leakedToolCallError(leaked.invalidName);
          }
        }

        assistantContent += content;
        options.onTextDelta?.(content);
      };

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex >= 0) {
          handleLine(buffer.slice(0, newlineIndex));
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf('\n');
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) handleLine(buffer);

      return { content: assistantContent, toolCalls };
    } catch (error) {
      if (options.signal.aborted) {
        throw new AiProviderError(
          'AI_REQUEST_CANCELLED',
          'A solicitaÃ§Ã£o ao provider local foi cancelada.',
        );
      }
      if (
        isAbortError(error) &&
        timeoutMs !== null &&
        timeoutMs !== undefined
      ) {
        throw new AiProviderError(
          'AI_PROVIDER_TIMEOUT',
          `O provider local nÃ£o respondeu em ${timeoutMs / 1_000} segundos. Tente novamente ou reformule a pergunta em partes menores.`,
        );
      }
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError(
        'AI_PROVIDER_REQUEST_FAILED',
        'NÃ£o foi possÃ­vel concluir a requisiÃ§Ã£o ao provider local.',
        { cause: error },
      );
    } finally {
      if (timeout) clearTimeout(timeout);
      options.signal.removeEventListener('abort', onAbort);
    }
  }

  private async capabilitiesFor(
    baseUrl: string,
    name: string,
  ): Promise<AiCapability[]> {
    try {
      const response = await this.postJson<{ capabilities?: string[] }>(
        `${baseUrl}/api/show`,
        { model: name },
        STATUS_TIMEOUT_MS,
      );
      const capabilities: AiCapability[] = ['chat'];
      if (response.capabilities?.includes('tools')) capabilities.push('tools');
      if (response.capabilities?.includes('insert')) {
        capabilities.push('fill-in-the-middle');
      }
      return capabilities;
    } catch {
      return ['chat'];
    }
  }

  private async getJson<T>(url: string, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(url, { signal: controller.signal });
      if (!response.ok) {
        throw providerRequestFailed(`Resposta ${response.status} do Ollama.`);
      }
      try {
        return (await response.json()) as T;
      } catch {
        throw invalidResponse('O Ollama devolveu uma resposta invÃ¡lida.');
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw new AiProviderError(
          'AI_PROVIDER_TIMEOUT',
          `O provider local nÃ£o respondeu em ${timeoutMs / 1_000} segundos.`,
        );
      }
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError(
        'AI_PROVIDER_REQUEST_FAILED',
        'NÃ£o foi possÃ­vel consultar o provider local.',
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async postJson<T>(
    url: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw providerRequestFailed(`Resposta ${response.status} do Ollama.`);
      }
      try {
        return (await response.json()) as T;
      } catch {
        throw invalidResponse('O Ollama devolveu uma resposta invÃ¡lida.');
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw new AiProviderError(
          'AI_PROVIDER_TIMEOUT',
          `O provider local nÃ£o respondeu em ${timeoutMs / 1_000} segundos.`,
        );
      }
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError(
        'AI_PROVIDER_REQUEST_FAILED',
        'NÃ£o foi possÃ­vel consultar o provider local.',
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
