import type {
  AiCapability,
  AiChatMessage,
  AiChatStreamEvent,
  AiModelInfo,
  AiTool,
  Project,
  ProjectAiStatus,
} from '@dev-dashboard/contracts';

import { ProjectFileError, ProjectFileService } from './project-file-service.js';
import { GitService } from './git-service.js';

const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
// `new URL(...).hostname` mantém colchetes para literais IPv6 (ex.: '[::1]',
// não '::1') — confirmado no runtime desta versão do Node. `[::1]` é a única
// forma que `.hostname` de fato produz para o loopback IPv6.
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);
const STATUS_TIMEOUT_MS = 5_000;
const CHAT_ROUND_TIMEOUT_MS = 120_000;
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 8_000;
const MAX_TOOL_RESULT_CHARS = 8_000;
const MAX_TOOL_ROUNDS = 4;
const MAX_MODELS_INSPECTED = 20;

const TOOL_NAMES: readonly AiTool[] = [
  'read_project_file',
  'search_project_text',
  'list_project_files',
  'get_git_diff',
];

/**
 * Definições enviadas ao Ollama no formato de "function calling" que a API
 * `/api/chat` espera. O catálogo é fechado: o modelo só pode invocar estas
 * quatro ferramentas, todas somente leitura e limitadas ao projeto atual.
 */
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'read_project_file',
      description: 'Lê o conteúdo de um arquivo de texto do projeto atual, pelo caminho relativo.',
      parameters: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string', description: 'Caminho relativo do arquivo dentro do projeto.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_project_text',
      description: 'Busca um trecho de texto nos arquivos do projeto atual.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Texto a procurar (2 a 100 caracteres).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_project_files',
      description: 'Lista arquivos e diretórios de um caminho do projeto atual.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho relativo do diretório. Vazio para a raiz.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_git_diff',
      description: 'Obtém o diff Git (não commitado) de um arquivo do projeto atual.',
      parameters: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string', description: 'Caminho relativo do arquivo dentro do projeto.' },
        },
      },
    },
  },
] as const;

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

interface OllamaChatChunk {
  message?: { role?: string; content?: string; tool_calls?: OllamaToolCall[] };
  done?: boolean;
}

interface InternalMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_name?: string;
}

export class AiAssistantError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AiAssistantError';
  }
}

export interface AiChatHandlers {
  send: (event: AiChatStreamEvent) => void;
  signal: AbortSignal;
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

function truncate(value: string, maxChars: number): { text: string; truncated: boolean } {
  if (value.length <= maxChars) return { text: value, truncated: false };
  return { text: value.slice(0, maxChars), truncated: true };
}

function isToolName(value: string): value is AiTool {
  return (TOOL_NAMES as readonly string[]).includes(value);
}

export class AiAssistantService {
  public constructor(
    private readonly projectFileService: ProjectFileService = new ProjectFileService(),
    private readonly gitService: GitService = new GitService(),
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

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
      models.push({ name, capabilities: await this.capabilitiesFor(baseUrl, name) });
    }
    for (const name of names.slice(MAX_MODELS_INSPECTED)) {
      models.push({ name, capabilities: ['chat'] });
    }

    return {
      available: true,
      baseUrl,
      models,
      message: models.length > 0
        ? `${models.length} ${models.length === 1 ? 'modelo instalado' : 'modelos instalados'} no Ollama local.`
        : 'Ollama local detectado, mas nenhum modelo está instalado.',
    };
  }

  public async chat(
    project: Project,
    model: string,
    messages: AiChatMessage[],
    handlers: AiChatHandlers,
  ): Promise<void> {
    const baseUrl = resolveOllamaBaseUrl();
    if (!baseUrl) {
      handlers.send({ type: 'error', message: 'O assistente de IA está desabilitado neste ambiente.' });
      return;
    }
    if (!model.trim()) {
      handlers.send({ type: 'error', message: 'Selecione um modelo instalado no Ollama.' });
      return;
    }
    if (messages.length === 0 || messages.length > MAX_MESSAGES) {
      handlers.send({ type: 'error', message: `A conversa deve conter entre 1 e ${MAX_MESSAGES} mensagens.` });
      return;
    }
    for (const message of messages) {
      if (message.content.length > MAX_MESSAGE_CHARS) {
        handlers.send({
          type: 'error',
          message: `Cada mensagem deve ter no máximo ${MAX_MESSAGE_CHARS} caracteres.`,
        });
        return;
      }
    }

    const conversation: InternalMessage[] = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        if (handlers.signal.aborted) return;
        const toolCalls = await this.streamOneRound(baseUrl, model, conversation, handlers);
        if (toolCalls.length === 0) {
          handlers.send({ type: 'done' });
          return;
        }
        for (const call of toolCalls) {
          if (handlers.signal.aborted) return;
          if (!isToolName(call.function.name)) {
            handlers.send({
              type: 'error',
              message: `O modelo tentou chamar "${call.function.name}", que não faz parte do catálogo autorizado.`,
            });
            return;
          }
          const result = await this.runTool(project, call.function.name, call.function.arguments, handlers);
          conversation.push({
            role: 'tool',
            tool_name: call.function.name,
            content: JSON.stringify(result),
          });
        }
      }
      handlers.send({
        type: 'error',
        message: 'O assistente encadeou ferramentas demais para esta solicitação. Tente reformular a pergunta.',
      });
    } catch (error) {
      if (handlers.signal.aborted) return;
      handlers.send({
        type: 'error',
        message: error instanceof Error ? error.message : 'Falha ao conversar com o Ollama local.',
      });
    }
  }

  private async capabilitiesFor(baseUrl: string, name: string): Promise<AiCapability[]> {
    try {
      const response = await this.postJson<{ capabilities?: string[] }>(
        `${baseUrl}/api/show`,
        { model: name },
        STATUS_TIMEOUT_MS,
      );
      const capabilities: AiCapability[] = ['chat'];
      if (response.capabilities?.includes('tools')) capabilities.push('tools');
      return capabilities;
    } catch {
      return ['chat'];
    }
  }

  private async streamOneRound(
    baseUrl: string,
    model: string,
    conversation: InternalMessage[],
    handlers: AiChatHandlers,
  ): Promise<OllamaToolCall[]> {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), CHAT_ROUND_TIMEOUT_MS);
    const onAbort = (): void => timeoutController.abort();
    handlers.signal.addEventListener('abort', onAbort);

    try {
      const response = await this.fetchImpl(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: conversation,
          tools: TOOL_DEFINITIONS,
          stream: true,
        }),
        signal: timeoutController.signal,
      });
      if (!response.ok || !response.body) {
        throw new AiAssistantError(`O Ollama respondeu com status ${response.status}.`);
      }

      const toolCalls: OllamaToolCall[] = [];
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';
      const handleLine = (rawLine: string): void => {
        const line = rawLine.trim();
        if (!line) return;
        let chunk: OllamaChatChunk;
        try {
          chunk = JSON.parse(line) as OllamaChatChunk;
        } catch {
          throw new AiAssistantError('O Ollama enviou um trecho de resposta que não pôde ser interpretado.');
        }
        const content = chunk.message?.content;
        if (content) {
          assistantContent += content;
          handlers.send({ type: 'message-delta', content });
        }
        if (chunk.message?.tool_calls) toolCalls.push(...chunk.message.tool_calls);
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
      if (assistantContent) conversation.push({ role: 'assistant', content: assistantContent });
      return toolCalls;
    } finally {
      clearTimeout(timeout);
      handlers.signal.removeEventListener('abort', onAbort);
    }
  }

  private async runTool(
    project: Project,
    name: AiTool,
    args: Record<string, unknown>,
    handlers: AiChatHandlers,
  ): Promise<Record<string, unknown>> {
    handlers.send({ type: 'tool-call', tool: name, arguments: args });

    try {
      const result = await this.executeTool(project, name, args);
      handlers.send({ type: 'tool-result', tool: name, ok: true, summary: summaryFor(name) });
      return result;
    } catch (error) {
      const summary = error instanceof Error ? error.message : 'Falha ao executar a ferramenta.';
      handlers.send({ type: 'tool-result', tool: name, ok: false, summary });
      return { error: summary };
    }
  }

  private async executeTool(
    project: Project,
    tool: AiTool,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      switch (tool) {
        case 'read_project_file': {
          const path = requireStringArg(args, 'path');
          const file = await this.projectFileService.readFile(project.path, path);
          const { text, truncated } = truncate(file.content, MAX_TOOL_RESULT_CHARS);
          return { path: file.path, content: text, truncated };
        }
        case 'search_project_text': {
          const query = requireStringArg(args, 'query');
          const result = await this.projectFileService.search(project.path, query, 20);
          return {
            items: result.items.map((item) => ({
              path: item.path,
              line: item.line,
              column: item.column,
              preview: item.preview,
            })),
            truncated: result.truncated,
          };
        }
        case 'list_project_files': {
          const path = typeof args.path === 'string' ? args.path : '';
          const listing = await this.projectFileService.listDirectory(project.path, path);
          return {
            path: listing.path,
            entries: listing.entries.map((entry) => ({ path: entry.path, kind: entry.kind })),
            truncated: listing.truncated,
          };
        }
        case 'get_git_diff': {
          const path = requireStringArg(args, 'path');
          const diff = await this.gitService.getFileDiff(project.path, path, 'combined');
          const { text, truncated } = truncate(diff.content, MAX_TOOL_RESULT_CHARS);
          return { path: diff.path, content: text, truncated: truncated || diff.truncated };
        }
      }
    } catch (error) {
      if (error instanceof ProjectFileError || error instanceof Error) {
        throw new AiAssistantError(error.message);
      }
      throw error;
    }
  }

  private async getJson<T>(url: string, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(url, { signal: controller.signal });
      if (!response.ok) throw new AiAssistantError(`Resposta ${response.status} do Ollama.`);
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async postJson<T>(url: string, body: unknown, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw new AiAssistantError(`Resposta ${response.status} do Ollama.`);
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function requireStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new AiAssistantError(`O argumento "${key}" é obrigatório.`);
  }
  return value;
}

function summaryFor(tool: AiTool): string {
  switch (tool) {
    case 'read_project_file': return 'Arquivo lido.';
    case 'search_project_text': return 'Busca concluída.';
    case 'list_project_files': return 'Diretório listado.';
    case 'get_git_diff': return 'Diff obtido.';
  }
}
