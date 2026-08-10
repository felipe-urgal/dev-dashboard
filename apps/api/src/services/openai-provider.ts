import type {
  AiCompletionResult,
  AiModelInfo,
  ProjectAiStatus,
} from '@dev-dashboard/contracts';

import { createAiOutboundProtectionFetch } from './ai-outbound-protection-fetch.js';
import type {
  AiProvider,
  AiProviderChatRoundOptions,
  AiProviderChatRoundResult,
  AiProviderCompletionOptions,
  AiProviderMessage,
  AiProviderToolCall,
  AiProviderToolDefinition,
} from './ai-provider.js';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const STATUS_TIMEOUT_MS = 5_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const MAX_STATUS_MODELS = 20;

interface OpenAiProviderOptions {
  fetchImpl?: typeof fetch;
  apiKey?: string;
}

interface OpenAiFunctionToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAiAssistantMessage {
  role: 'assistant';
  content?: string | null;
  tool_calls?: OpenAiFunctionToolCall[];
}

interface OpenAiChatResponse {
  choices?: Array<{
    message?: OpenAiAssistantMessage;
  }>;
  error?: { message?: string };
}

interface OpenAiModelsResponse {
  data?: Array<{ id?: string }>;
  error?: { message?: string };
}

type OpenAiRequestMessage = Record<string, unknown>;

interface OpenAiSessionState {
  history: OpenAiRequestMessage[];
  consumedMessages: number;
  pendingToolCalls: OpenAiFunctionToolCall[];
  assistantEcho: string | undefined;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resolveApiKey(explicit?: string): string | undefined {
  const value =
    explicit ??
    process.env.DEV_DASHBOARD_OPENAI_API_KEY ??
    process.env.OPENAI_API_KEY;
  return value?.trim() || undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isSupportedChatModel(model: string): boolean {
  if (!model.startsWith('gpt-')) return false;
  if (model.includes('-pro') || model.includes('-codex')) return false;
  return (
    model.startsWith('gpt-5') ||
    model === 'gpt-4.1' ||
    model.startsWith('gpt-4.1-')
  );
}

function openAiModels(models: readonly string[]): AiModelInfo[] {
  return Array.from(new Set(models))
    .filter(isSupportedChatModel)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, MAX_STATUS_MODELS)
    .map((name) => ({ name, capabilities: ['chat', 'tools'] }));
}

function openAiTools(tools: readonly AiProviderToolDefinition[]) {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      strict: false,
    },
  }));
}

function plainMessage(message: AiProviderMessage): OpenAiRequestMessage {
  if (message.role === 'tool') {
    throw new Error(
      'O provider OpenAI recebeu resultado de ferramenta sem uma chamada pendente.',
    );
  }
  return { role: message.role, content: message.content };
}

function parseToolCall(call: OpenAiFunctionToolCall): AiProviderToolCall {
  let parsed: unknown;
  try {
    parsed = JSON.parse(call.function.arguments || '{}');
  } catch {
    throw new Error(
      `A OpenAI devolveu argumentos inválidos para a ferramenta "${call.function.name}".`,
    );
  }
  const args = asObject(parsed);
  if (!args) {
    throw new Error(
      `A OpenAI devolveu argumentos inválidos para a ferramenta "${call.function.name}".`,
    );
  }
  return { name: call.function.name, arguments: args };
}

/**
 * Provider cloud da OpenAI.
 *
 * O adapter usa somente a API oficial e mantém IDs nativos de tool-calling
 * internamente. O domínio continua conhecendo apenas nome + argumentos da
 * ferramenta; o vínculo entre function call e tool result não vaza para o
 * contrato compartilhado.
 *
 * Este provider não conhece Project, filesystem, Git ou consentimento. Ele só
 * será ligado ao fluxo de produto quando existir resolução explícita de
 * provider + consentimento por projeto.
 */
export class OpenAiProvider implements AiProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly apiKey: string | undefined;
  private readonly sessions = new WeakMap<
    readonly AiProviderMessage[],
    OpenAiSessionState
  >();

  public constructor(options: OpenAiProviderOptions = {}) {
    this.fetchImpl = createAiOutboundProtectionFetch(
      options.fetchImpl ?? fetch,
    );
    this.apiKey = resolveApiKey(options.apiKey);
  }

  public async status(): Promise<ProjectAiStatus> {
    if (!this.apiKey) {
      return {
        available: false,
        baseUrl: OPENAI_BASE_URL,
        models: [],
        message:
          'OpenAI cloud não configurada. Defina DEV_DASHBOARD_OPENAI_API_KEY ou OPENAI_API_KEY para habilitar o provider.',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(`${OPENAI_BASE_URL}/models`, {
        headers: this.headers(),
        signal: controller.signal,
      });
      const body = (await response
        .json()
        .catch(() => ({}))) as OpenAiModelsResponse;
      if (!response.ok) {
        return {
          available: false,
          baseUrl: OPENAI_BASE_URL,
          models: [],
          message:
            body.error?.message ??
            `A OpenAI respondeu com status ${response.status}.`,
        };
      }

      const models = openAiModels(
        (body.data ?? [])
          .map((model) => model.id)
          .filter((model): model is string => Boolean(model)),
      );
      return {
        available: true,
        baseUrl: OPENAI_BASE_URL,
        models,
        message:
          models.length > 0
            ? `${models.length} ${models.length === 1 ? 'modelo compatível disponível' : 'modelos compatíveis disponíveis'} na OpenAI.`
            : 'OpenAI disponível, mas nenhum modelo compatível foi encontrado para este provider.',
      };
    } catch (error) {
      return {
        available: false,
        baseUrl: OPENAI_BASE_URL,
        models: [],
        message: isAbortError(error)
          ? 'A OpenAI demorou demais para responder ao status.'
          : 'Não foi possível consultar a OpenAI com a credencial configurada.',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  public async chatRound(
    model: string,
    messages: readonly AiProviderMessage[],
    options: AiProviderChatRoundOptions,
  ): Promise<AiProviderChatRoundResult> {
    this.requireApiKey();
    const state = this.prepareSession(messages);
    const tools = options.tools ?? [];
    const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = (): void => controller.abort();
    options.signal.addEventListener('abort', onAbort);

    try {
      const response = await this.fetchImpl(
        `${OPENAI_BASE_URL}/chat/completions`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({
            model,
            messages: state.history,
            store: false,
            stream: false,
            max_completion_tokens: options.maxOutputTokens,
            ...(tools.length > 0
              ? { tools: openAiTools(tools), tool_choice: 'auto' }
              : {}),
            ...(options.format === 'json'
              ? { response_format: { type: 'json_object' } }
              : {}),
          }),
          signal: controller.signal,
        },
      );
      const body = (await response
        .json()
        .catch(() => ({}))) as OpenAiChatResponse;
      if (!response.ok) {
        throw new Error(
          body.error?.message ??
            `A OpenAI respondeu com status ${response.status}.`,
        );
      }

      const message = body.choices?.[0]?.message;
      if (!message)
        throw new Error('A OpenAI não devolveu uma resposta válida.');
      const content =
        typeof message.content === 'string' ? message.content : '';
      const nativeToolCalls = message.tool_calls ?? [];
      const toolCalls = nativeToolCalls.map(parseToolCall);

      state.history.push({
        role: 'assistant',
        content: content || null,
        ...(nativeToolCalls.length > 0 ? { tool_calls: nativeToolCalls } : {}),
      });
      state.consumedMessages = messages.length;
      state.pendingToolCalls = nativeToolCalls;
      state.assistantEcho = content || undefined;
      this.sessions.set(messages, state);

      if (content) options.onTextDelta?.(content);
      return { content, toolCalls };
    } catch (error) {
      if (options.signal.aborted) throw error;
      if (isAbortError(error)) {
        throw new Error(
          `A OpenAI não respondeu em ${timeoutMs / 1_000} segundos.`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      options.signal.removeEventListener('abort', onAbort);
    }
  }

  public async complete(
    model: string,
    prefix: string,
    suffix: string,
    options: AiProviderCompletionOptions,
  ): Promise<AiCompletionResult> {
    this.requireApiKey();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    const onAbort = (): void => controller.abort();
    options.signal.addEventListener('abort', onAbort);

    try {
      const response = await this.fetchImpl(
        `${OPENAI_BASE_URL}/chat/completions`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({
            model,
            store: false,
            stream: false,
            max_completion_tokens: options.maxOutputTokens,
            messages: [
              {
                role: 'system',
                content:
                  'Complete o código entre PREFIX e SUFFIX. Responda somente com o texto que deve ser inserido, sem Markdown nem explicações.',
              },
              {
                role: 'user',
                content: `PREFIX:\n${prefix}\n\nSUFFIX:\n${suffix}`,
              },
            ],
          }),
          signal: controller.signal,
        },
      );
      const body = (await response
        .json()
        .catch(() => ({}))) as OpenAiChatResponse;
      if (!response.ok) {
        throw new Error(
          body.error?.message ??
            `A OpenAI respondeu com status ${response.status}.`,
        );
      }
      const content = body.choices?.[0]?.message?.content;
      return { text: typeof content === 'string' ? content : '' };
    } finally {
      clearTimeout(timeout);
      options.signal.removeEventListener('abort', onAbort);
    }
  }

  private prepareSession(
    messages: readonly AiProviderMessage[],
  ): OpenAiSessionState {
    const existing = this.sessions.get(messages);
    if (!existing) {
      return {
        history: messages.map(plainMessage),
        consumedMessages: messages.length,
        pendingToolCalls: [],
        assistantEcho: undefined,
      };
    }

    const pending = [...existing.pendingToolCalls];
    let assistantEcho = existing.assistantEcho;
    for (const message of messages.slice(existing.consumedMessages)) {
      if (
        message.role === 'assistant' &&
        assistantEcho !== undefined &&
        message.content === assistantEcho
      ) {
        assistantEcho = undefined;
        continue;
      }
      if (message.role !== 'tool') {
        existing.history.push(plainMessage(message));
        continue;
      }

      const index = pending.findIndex(
        (call) => call.function.name === message.toolName,
      );
      const call = index >= 0 ? pending.splice(index, 1)[0] : undefined;
      if (!call) {
        throw new Error(
          `O provider OpenAI não encontrou a chamada pendente da ferramenta "${message.toolName ?? 'desconhecida'}".`,
        );
      }
      existing.history.push({
        role: 'tool',
        tool_call_id: call.id,
        content: message.content,
      });
    }

    if (pending.length > 0) {
      throw new Error(
        'O provider OpenAI recebeu uma nova rodada antes de todos os resultados de ferramentas pendentes.',
      );
    }
    existing.pendingToolCalls = [];
    existing.assistantEcho = undefined;
    existing.consumedMessages = messages.length;
    return existing;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.requireApiKey()}`,
      'Content-Type': 'application/json',
    };
  }

  private requireApiKey(): string {
    if (!this.apiKey) {
      throw new Error(
        'OpenAI cloud não configurada. Defina DEV_DASHBOARD_OPENAI_API_KEY ou OPENAI_API_KEY.',
      );
    }
    return this.apiKey;
  }
}
