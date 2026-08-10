import type {
  AiCapability,
  AiCompletionResult,
  AiModelInfo,
  AiRecommendedModelName,
  ProjectAiStatus,
} from '@dev-dashboard/contracts';
import { AI_RECOMMENDED_MODELS } from '@dev-dashboard/contracts';

import { createAiOutboundProtectionFetch } from './ai-outbound-protection-fetch.js';
import type {
  AiProvider,
  AiProviderChatRoundOptions,
  AiProviderChatRoundResult,
  AiProviderCompletionOptions,
  AiProviderMessage,
  AiProviderModelInstallHandlers,
  AiProviderToolCall,
  AiProviderToolDefinition,
} from './ai-provider.js';

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);
const STATUS_TIMEOUT_MS = 5_000;
const MAX_MODELS_INSPECTED = 20;
const MODEL_PULL_TIMEOUT_MS = 60 * 60 * 1_000;

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

interface OllamaChatChunk {
  message?: { role?: string; content?: string; tool_calls?: OllamaToolCall[] };
  done?: boolean;
}

interface OllamaModelPullChunk {
  status?: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
}

interface OllamaProviderOptions {
  fetchImpl?: typeof fetch;
}

function isRecommendedModel(value: string): value is AiRecommendedModelName {
  return AI_RECOMMENDED_MODELS.some((model) => model.name === value);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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

  public constructor(options: OllamaProviderOptions = {}) {
    this.fetchImpl = createAiOutboundProtectionFetch(
      options.fetchImpl ?? fetch,
    );
  }

  public async status(): Promise<ProjectAiStatus> {
    const baseUrl = resolveOllamaBaseUrl();
    if (!baseUrl) {
      return {
        available: false,
        models: [],
        message:
          'DEV_DASHBOARD_OLLAMA_URL não aponta para um endereço HTTP local (loopback); o assistente de IA está desabilitado.',
      };
    }

    let tags: { models?: Array<{ name: string; model?: string }> };
    try {
      tags = await this.getJson(`${baseUrl}/api/tags`, STATUS_TIMEOUT_MS);
    } catch {
      return {
        available: false,
        baseUrl,
        models: [],
        message: `Ollama local não foi detectado em ${baseUrl}. Instale e inicie o Ollama manualmente para habilitar o assistente de IA.`,
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
          : 'Ollama local detectado, mas nenhum modelo está instalado.',
    };
  }

  public async chatRound(
    model: string,
    messages: readonly AiProviderMessage[],
    options: AiProviderChatRoundOptions,
  ): Promise<AiProviderChatRoundResult> {
    const baseUrl = resolveOllamaBaseUrl();
    if (!baseUrl) {
      throw new Error('O assistente de IA está desabilitado neste ambiente.');
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
        throw new Error(`O Ollama respondeu com status ${response.status}.`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const allowedToolNames = new Set(tools.map((tool) => tool.name));
      const toolCalls: AiProviderToolCall[] = [];
      let buffer = '';
      let assistantContent = '';

      const handleLine = (rawLine: string): void => {
        const line = rawLine.trim();
        if (!line) return;

        let chunk: OllamaChatChunk;
        try {
          chunk = JSON.parse(line) as OllamaChatChunk;
        } catch {
          throw new Error(
            'O Ollama enviou um trecho de resposta que não pôde ser interpretado.',
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
            toolCalls.push(leaked.call);
            return;
          }
          if (leaked?.invalidName) {
            throw new Error(
              `O modelo "${model}" tentou usar a ferramenta "${leaked.invalidName}", mas escreveu a ` +
                'chamada como texto em vez de utilizar corretamente o mecanismo de tool-calling do Ollama. ' +
                'Tente novamente com um modelo com suporte mais confiável a ferramentas ' +
                '(ex.: qwen2.5-coder:14b).',
            );
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
      if (
        !options.signal.aborted &&
        isAbortError(error) &&
        timeoutMs !== null &&
        timeoutMs !== undefined
      ) {
        throw new Error(
          `O Ollama não respondeu em ${timeoutMs / 1_000} segundos. Tente novamente ou reformule a pergunta em partes menores.`,
        );
      }
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
      options.signal.removeEventListener('abort', onAbort);
    }
  }

  public async complete(
    model: string,
    prefix: string,
    suffix: string,
    options: AiProviderCompletionOptions,
  ): Promise<AiCompletionResult> {
    const baseUrl = resolveOllamaBaseUrl();
    if (!baseUrl) {
      throw new Error('O assistente de IA está desabilitado neste ambiente.');
    }

    const timeoutController = new AbortController();
    const timeout = setTimeout(
      () => timeoutController.abort(),
      options.timeoutMs,
    );
    const onAbort = (): void => timeoutController.abort();
    options.signal.addEventListener('abort', onAbort);
    try {
      const response = await this.fetchImpl(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: prefix,
          ...(suffix ? { suffix } : {}),
          stream: false,
          options: { num_predict: options.maxOutputTokens },
        }),
        signal: timeoutController.signal,
      });
      if (!response.ok) {
        throw new Error(`O Ollama respondeu com status ${response.status}.`);
      }
      const body = (await response.json()) as { response?: string };
      return { text: body.response ?? '' };
    } finally {
      clearTimeout(timeout);
      options.signal.removeEventListener('abort', onAbort);
    }
  }

  public async installModel(
    model: string,
    handlers: AiProviderModelInstallHandlers,
  ): Promise<void> {
    const baseUrl = resolveOllamaBaseUrl();
    if (!baseUrl) {
      throw new Error(
        'O Ollama local não está disponível para instalar modelos.',
      );
    }
    if (!isRecommendedModel(model)) {
      throw new Error('Este modelo não está disponível para instalação.');
    }

    const timeoutController = new AbortController();
    const timeout = setTimeout(
      () => timeoutController.abort(),
      MODEL_PULL_TIMEOUT_MS,
    );
    const onAbort = (): void => timeoutController.abort();
    handlers.signal.addEventListener('abort', onAbort);
    try {
      const response = await this.fetchImpl(`${baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model, stream: true }),
        signal: timeoutController.signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(
          `O Ollama respondeu com status ${response.status} ao instalar o modelo.`,
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const handleLine = (rawLine: string): void => {
        const line = rawLine.trim();
        if (!line) return;
        let chunk: OllamaModelPullChunk;
        try {
          chunk = JSON.parse(line) as OllamaModelPullChunk;
        } catch {
          throw new Error(
            'O Ollama enviou um progresso de instalação inválido.',
          );
        }
        if (chunk.error) throw new Error(chunk.error);
        handlers.send({
          type: 'progress',
          model,
          status: chunk.status ?? 'Baixando modelo…',
          ...(typeof chunk.completed === 'number'
            ? { completed: chunk.completed }
            : {}),
          ...(typeof chunk.total === 'number' ? { total: chunk.total } : {}),
        });
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
      if (!handlers.signal.aborted) handlers.send({ type: 'done', model });
    } catch (error) {
      if (handlers.signal.aborted) return;
      if (isAbortError(error)) {
        throw new Error(
          'A instalação demorou demais para responder. Tente novamente.',
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      handlers.signal.removeEventListener('abort', onAbort);
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
      if (!response.ok)
        throw new Error(`Resposta ${response.status} do Ollama.`);
      return (await response.json()) as T;
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
      if (!response.ok)
        throw new Error(`Resposta ${response.status} do Ollama.`);
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}
