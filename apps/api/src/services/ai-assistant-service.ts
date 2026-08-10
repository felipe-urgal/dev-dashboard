import { extname } from 'node:path';

import type {
  AiCapability,
  AiChatMessage,
  AiChatStreamEvent,
  AiCompletionResult,
  AiModelPullStreamEvent,
  AiModelInfo,
  AiRecommendedModelName,
  AiTool,
  Project,
  ProjectAiStatus,
  ProjectTextPosition,
  ProjectTextRange,
  ProjectWorkspaceFileEdit,
  ProjectWorkspaceTextEdit,
} from '@dev-dashboard/contracts';
import { AI_RECOMMENDED_MODELS } from '@dev-dashboard/contracts';

import {
  ProjectFileError,
  ProjectFileService,
} from './project-file-service.js';
import { GitService } from './git-service.js';
import { ProjectWorkspaceEditService } from './project-workspace-edit-service.js';
import { ProjectLanguageServerService } from './project-language-server-service.js';

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
const COMPLETION_TIMEOUT_MS = 15_000;
const MAX_COMPLETION_PREFIX_CHARS = 4_000;
const MAX_COMPLETION_SUFFIX_CHARS = 1_000;
const MAX_COMPLETION_RESPONSE_CHARS = 2_000;
const MODEL_PULL_TIMEOUT_MS = 60 * 60 * 1_000;

const TOOL_NAMES: readonly AiTool[] = [
  'read_project_file',
  'search_project_text',
  'list_project_files',
  'get_git_diff',
  'propose_workspace_edit',
  'get_symbol_definition',
  'get_symbol_references',
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
      description:
        'Lê o conteúdo de um arquivo de texto do projeto atual, pelo caminho relativo.',
      parameters: {
        type: 'object',
        required: ['path'],
        properties: {
          path: {
            type: 'string',
            description: 'Caminho relativo do arquivo dentro do projeto.',
          },
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
          query: {
            type: 'string',
            description: 'Texto a procurar (2 a 100 caracteres).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_project_files',
      description:
        'Lista arquivos e diretórios de um caminho do projeto atual.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Caminho relativo do diretório. Vazio para a raiz.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_git_diff',
      description:
        'Obtém o diff Git (não commitado) de um arquivo do projeto atual.',
      parameters: {
        type: 'object',
        required: ['path'],
        properties: {
          path: {
            type: 'string',
            description: 'Caminho relativo do arquivo dentro do projeto.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_workspace_edit',
      description:
        'Propõe uma edição de texto em um ou mais arquivos do projeto atual. A edição não é ' +
        'aplicada automaticamente: o usuário revisa um preview e confirma antes de qualquer ' +
        'escrita em disco.',
      parameters: {
        type: 'object',
        required: ['files'],
        properties: {
          files: {
            type: 'array',
            description: 'Lista de arquivos a editar (até 20).',
            items: {
              type: 'object',
              required: ['path', 'edits'],
              properties: {
                path: {
                  type: 'string',
                  description: 'Caminho relativo do arquivo dentro do projeto.',
                },
                edits: {
                  type: 'array',
                  description:
                    'Edições de texto a aplicar no arquivo (até 200), sem sobreposição.',
                  items: {
                    type: 'object',
                    required: ['range', 'newText'],
                    properties: {
                      range: {
                        type: 'object',
                        required: ['start', 'end'],
                        description:
                          'Faixa de texto a substituir, com linha e coluna baseadas em 1.',
                        properties: {
                          start: {
                            type: 'object',
                            required: ['line', 'column'],
                            properties: {
                              line: { type: 'number' },
                              column: { type: 'number' },
                            },
                          },
                          end: {
                            type: 'object',
                            required: ['line', 'column'],
                            properties: {
                              line: { type: 'number' },
                              column: { type: 'number' },
                            },
                          },
                        },
                      },
                      newText: {
                        type: 'string',
                        description: 'Texto que substitui a faixa indicada.',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_symbol_definition',
      description:
        'Localiza a definição de um símbolo (variável, método, classe) numa posição de um ' +
        'arquivo do projeto atual, usando o servidor de linguagem (LSP) já ativo para o projeto.',
      parameters: {
        type: 'object',
        required: ['path', 'line', 'column'],
        properties: {
          path: {
            type: 'string',
            description: 'Caminho relativo do arquivo dentro do projeto.',
          },
          line: { type: 'number', description: 'Linha do símbolo (1-based).' },
          column: {
            type: 'number',
            description: 'Coluna do símbolo (1-based).',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_symbol_references',
      description:
        'Lista onde um símbolo (variável, método, classe) numa posição de um arquivo do projeto ' +
        'atual é referenciado, usando o servidor de linguagem (LSP) já ativo para o projeto.',
      parameters: {
        type: 'object',
        required: ['path', 'line', 'column'],
        properties: {
          path: {
            type: 'string',
            description: 'Caminho relativo do arquivo dentro do projeto.',
          },
          line: { type: 'number', description: 'Linha do símbolo (1-based).' },
          column: {
            type: 'number',
            description: 'Coluna do símbolo (1-based).',
          },
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

interface OllamaModelPullChunk {
  status?: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
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

export interface AiModelPullHandlers {
  send: (event: AiModelPullStreamEvent) => void;
  signal: AbortSignal;
}

function isRecommendedModel(value: string): value is AiRecommendedModelName {
  return AI_RECOMMENDED_MODELS.some((model) => model.name === value);
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
 * O `timeoutController` interno de cada rodada aborta o fetch ao Ollama por
 * conta própria (não é o cancelamento do usuário, já tratado antes de chegar
 * aqui via `handlers.signal.aborted`). Sem esta tradução, o erro nativo do
 * `AbortController` ("This operation was aborted"/"The operation was
 * aborted.") vazava para o usuário sem nenhum contexto do que aconteceu.
 */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function truncate(
  value: string,
  maxChars: number,
): { text: string; truncated: boolean } {
  if (value.length <= maxChars) return { text: value, truncated: false };
  return { text: value.slice(0, maxChars), truncated: true };
}

function isToolName(value: string): value is AiTool {
  return (TOOL_NAMES as readonly string[]).includes(value);
}

export interface AiAssistantServiceOptions {
  projectFileService?: ProjectFileService;
  gitService?: GitService;
  fetchImpl?: typeof fetch;
  workspaceEditService?: ProjectWorkspaceEditService;
  languageServerService?: ProjectLanguageServerService;
}

export class AiAssistantService {
  private readonly projectFileService: ProjectFileService;
  private readonly gitService: GitService;
  private readonly fetchImpl: typeof fetch;
  private readonly workspaceEditService: ProjectWorkspaceEditService;
  private readonly languageServerService: ProjectLanguageServerService;

  public constructor(options: AiAssistantServiceOptions = {}) {
    const projectFileService =
      options.projectFileService ?? new ProjectFileService();

    this.projectFileService = projectFileService;
    this.gitService = options.gitService ?? new GitService();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.workspaceEditService =
      options.workspaceEditService ??
      new ProjectWorkspaceEditService(projectFileService);
    this.languageServerService =
      options.languageServerService ??
      new ProjectLanguageServerService({ projectFileService });
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

  public async chat(
    project: Project,
    model: string,
    messages: AiChatMessage[],
    handlers: AiChatHandlers,
  ): Promise<void> {
    const baseUrl = resolveOllamaBaseUrl();
    if (!baseUrl) {
      handlers.send({
        type: 'error',
        message: 'O assistente de IA está desabilitado neste ambiente.',
      });
      return;
    }
    if (!model.trim()) {
      handlers.send({
        type: 'error',
        message: 'Selecione um modelo instalado no Ollama.',
      });
      return;
    }
    if (messages.length === 0 || messages.length > MAX_MESSAGES) {
      handlers.send({
        type: 'error',
        message: `A conversa deve conter entre 1 e ${MAX_MESSAGES} mensagens.`,
      });
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
        const toolCalls = await this.streamOneRound(
          baseUrl,
          model,
          conversation,
          handlers,
        );
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
          const result = await this.runTool(
            project,
            call.function.name,
            call.function.arguments,
            handlers,
          );
          conversation.push({
            role: 'tool',
            tool_name: call.function.name,
            content: JSON.stringify(result),
          });
        }
      }
      handlers.send({
        type: 'error',
        message:
          'O assistente encadeou ferramentas demais para esta solicitação. Tente reformular a pergunta.',
      });
    } catch (error) {
      if (handlers.signal.aborted) return;
      const message = isAbortError(error)
        ? `O Ollama não respondeu em ${CHAT_ROUND_TIMEOUT_MS / 1_000} segundos. Tente novamente ` +
          'ou reformule a pergunta em partes menores.'
        : error instanceof Error
          ? error.message
          : 'Falha ao conversar com o Ollama local.';
      handlers.send({ type: 'error', message });
    }
  }

  /**
   * Executa uma resposta única sem catálogo de ferramentas. É usada em fluxos
   * que já carregam um contexto fechado pelo servidor (como a revisão de PR),
   * evitando que o modelo leia ou proponha alterações fora daquele contexto.
   */
  public async review(
    model: string,
    messages: AiChatMessage[],
    signal: AbortSignal,
  ): Promise<string> {
    const baseUrl = resolveOllamaBaseUrl();
    if (!baseUrl)
      throw new AiAssistantError(
        'O assistente de IA está desabilitado neste ambiente.',
      );
    if (!model.trim())
      throw new AiAssistantError('Selecione um modelo instalado no Ollama.');
    if (messages.length === 0 || messages.length > MAX_MESSAGES)
      throw new AiAssistantError(
        `A revisão deve conter entre 1 e ${MAX_MESSAGES} mensagens.`,
      );
    if (messages.some((message) => message.content.length > MAX_MESSAGE_CHARS))
      throw new AiAssistantError(
        `Cada mensagem deve ter no máximo ${MAX_MESSAGE_CHARS} caracteres.`,
      );

    let content = '';
    try {
      const toolCalls = await this.streamOneRound(
        baseUrl,
        model,
        messages.map((message) => ({ ...message })),
        {
          signal,
          send: (event) => {
            if (event.type === 'message-delta') content += event.content;
          },
        },
        false,
        {
          // A revisão pode processar arquivos grandes em modelos locais sem
          // GPU. Diferente do chat interativo, ela é uma tarefa em segundo
          // plano e aguarda a resposta do Ollama sem encerrar por tempo.
          timeoutMs: null,
          numPredict: 700,
          temperature: 0.1,
        },
      );
      if (toolCalls.length > 0)
        throw new AiAssistantError(
          'O modelo tentou usar ferramentas durante a revisão, o que não é permitido.',
        );
      if (!content.trim())
        throw new AiAssistantError('O modelo não devolveu uma revisão.');
      return content;
    } catch (error) {
      if (error instanceof AiAssistantError) throw error;
      if (signal.aborted)
        throw new AiAssistantError('A revisão foi cancelada pelo usuário.');
      if (isAbortError(error))
        throw new AiAssistantError(
          'A conexão com o Ollama foi encerrada antes de concluir a revisão.',
        );
      throw error;
    }
  }

  /** Baixa somente os modelos recomendados, sempre pelo Ollama loopback. */
  public async pullRecommendedModel(
    model: string,
    handlers: AiModelPullHandlers,
  ): Promise<void> {
    const baseUrl = resolveOllamaBaseUrl();
    if (!baseUrl)
      throw new AiAssistantError(
        'O Ollama local não está disponível para instalar modelos.',
      );
    if (!isRecommendedModel(model))
      throw new AiAssistantError(
        'Este modelo não está disponível para instalação.',
      );

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
      if (!response.ok || !response.body)
        throw new AiAssistantError(
          `O Ollama respondeu com status ${response.status} ao instalar o modelo.`,
        );

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
          throw new AiAssistantError(
            'O Ollama enviou um progresso de instalação inválido.',
          );
        }
        if (chunk.error) throw new AiAssistantError(chunk.error);
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
      if (isAbortError(error))
        throw new AiAssistantError(
          'A instalação demorou demais para responder. Tente novamente.',
        );
      throw error;
    } finally {
      clearTimeout(timeout);
      handlers.signal.removeEventListener('abort', onAbort);
    }
  }

  /**
   * Compleção inline curta (ghost text): uma chamada direta e sem
   * tool-calling a `/api/generate`, para manter a latência previsível
   * enquanto o usuário digita. `suffix` só é enviado quando presente,
   * habilitando fill-in-the-middle nos modelos que o suportam.
   */
  public async complete(
    model: string,
    prefix: string,
    suffix: string,
    signal: AbortSignal,
  ): Promise<AiCompletionResult> {
    const baseUrl = resolveOllamaBaseUrl();
    if (!baseUrl) {
      throw new AiAssistantError(
        'O assistente de IA está desabilitado neste ambiente.',
      );
    }
    if (!model.trim()) {
      throw new AiAssistantError('Selecione um modelo instalado no Ollama.');
    }
    if (
      prefix.length > MAX_COMPLETION_PREFIX_CHARS ||
      suffix.length > MAX_COMPLETION_SUFFIX_CHARS
    ) {
      throw new AiAssistantError(
        'O contexto de compleção excede o limite permitido.',
      );
    }
    if (!prefix.trim() && !suffix.trim()) return { text: '' };

    const timeoutController = new AbortController();
    const timeout = setTimeout(
      () => timeoutController.abort(),
      COMPLETION_TIMEOUT_MS,
    );
    const onAbort = (): void => timeoutController.abort();
    signal.addEventListener('abort', onAbort);
    try {
      const response = await this.fetchImpl(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: prefix,
          ...(suffix ? { suffix } : {}),
          stream: false,
          options: { num_predict: 128 },
        }),
        signal: timeoutController.signal,
      });
      if (!response.ok) {
        throw new AiAssistantError(
          `O Ollama respondeu com status ${response.status}.`,
        );
      }
      const body = (await response.json()) as { response?: string };
      return {
        text: truncate(body.response ?? '', MAX_COMPLETION_RESPONSE_CHARS).text,
      };
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
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
      // Ollama reporta 'insert' para modelos que aceitam o parâmetro `suffix`
      // de /api/generate (fill-in-the-middle).
      if (response.capabilities?.includes('insert'))
        capabilities.push('fill-in-the-middle');
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
    includeTools = true,
    options?: {
      timeoutMs?: number | null;
      format?: 'json';
      numPredict?: number;
      temperature?: number;
    },
  ): Promise<OllamaToolCall[]> {
    const timeoutController = new AbortController();
    const timeoutMs =
      options?.timeoutMs === undefined
        ? CHAT_ROUND_TIMEOUT_MS
        : options.timeoutMs;
    const timeout =
      timeoutMs === null
        ? undefined
        : setTimeout(() => timeoutController.abort(), timeoutMs);
    const onAbort = (): void => timeoutController.abort();
    handlers.signal.addEventListener('abort', onAbort);

    try {
      const response = await this.fetchImpl(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: conversation,
          ...(includeTools ? { tools: TOOL_DEFINITIONS } : {}),
          ...(options?.format ? { format: options.format } : {}),
          ...(options?.numPredict || options?.temperature !== undefined
            ? {
                options: {
                  ...(options.numPredict
                    ? { num_predict: options.numPredict }
                    : {}),
                  ...(options.temperature !== undefined
                    ? { temperature: options.temperature }
                    : {}),
                },
              }
            : {}),
          // Tool calling não-streaming é compatível também com versões do
          // Ollama anteriores ao parser incremental de chamadas de ferramenta.
          stream: includeTools ? false : true,
        }),
        signal: timeoutController.signal,
      });
      if (!response.ok || !response.body) {
        throw new AiAssistantError(
          `O Ollama respondeu com status ${response.status}.`,
        );
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
          throw new AiAssistantError(
            'O Ollama enviou um trecho de resposta que não pôde ser interpretado.',
          );
        }
        const content = chunk.message?.content;
        if (content) {
          assistantContent += content;
          handlers.send({ type: 'message-delta', content });
        }
        if (chunk.message?.tool_calls)
          toolCalls.push(...chunk.message.tool_calls);
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
      if (assistantContent)
        conversation.push({ role: 'assistant', content: assistantContent });
      return toolCalls;
    } finally {
      if (timeout) clearTimeout(timeout);
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
      const result = await this.executeTool(project, name, args, handlers);
      handlers.send({
        type: 'tool-result',
        tool: name,
        ok: true,
        summary: summaryFor(name),
      });
      return result;
    } catch (error) {
      const summary =
        error instanceof Error
          ? error.message
          : 'Falha ao executar a ferramenta.';
      handlers.send({ type: 'tool-result', tool: name, ok: false, summary });
      return { error: summary };
    }
  }

  private async executeTool(
    project: Project,
    tool: AiTool,
    args: Record<string, unknown>,
    handlers: AiChatHandlers,
  ): Promise<Record<string, unknown>> {
    try {
      switch (tool) {
        case 'read_project_file': {
          const path = requireStringArg(args, 'path');
          const file = await this.projectFileService.readFile(
            project.path,
            path,
          );
          const { text, truncated } = truncate(
            file.content,
            MAX_TOOL_RESULT_CHARS,
          );
          return { path: file.path, content: text, truncated };
        }
        case 'search_project_text': {
          const query = requireStringArg(args, 'query');
          const result = await this.projectFileService.search(
            project.path,
            query,
            20,
          );
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
          const listing = await this.projectFileService.listDirectory(
            project.path,
            path,
          );
          return {
            path: listing.path,
            entries: listing.entries.map((entry) => ({
              path: entry.path,
              kind: entry.kind,
            })),
            truncated: listing.truncated,
          };
        }
        case 'get_git_diff': {
          const path = requireStringArg(args, 'path');
          const diff = await this.gitService.getFileDiff(
            project.path,
            path,
            'combined',
          );
          const { text, truncated } = truncate(
            diff.content,
            MAX_TOOL_RESULT_CHARS,
          );
          return {
            path: diff.path,
            content: text,
            truncated: truncated || diff.truncated,
          };
        }
        case 'propose_workspace_edit': {
          const files = parseWorkspaceEditFiles(args);
          const request = await this.buildWorkspaceEditRequest(project, files);
          const preview = await this.workspaceEditService.previewWorkspaceEdit(
            project.path,
            project.id,
            request,
          );
          handlers.send({ type: 'workspace-edit-proposed', preview });
          return {
            status: 'pending_confirmation',
            files: preview.files.map((file) => file.path),
            expiresAt: preview.expiresAt,
          };
        }
        case 'get_symbol_definition':
        case 'get_symbol_references': {
          const path = requireStringArg(args, 'path');
          const line = requireNumberArg(args, 'line');
          const column = requireNumberArg(args, 'column');
          const kind = languageServerKindForPath(path);
          if (!kind) {
            return {
              available: false,
              message:
                'Nenhum servidor de linguagem reconhece este tipo de arquivo.',
            };
          }
          const method =
            tool === 'get_symbol_definition'
              ? ('textDocument/definition' as const)
              : ('textDocument/references' as const);
          const locations =
            await this.languageServerService.requestSymbolLocations(
              project,
              kind,
              path,
              { line, column },
              method,
            );
          if (locations === undefined) {
            return {
              available: false,
              message:
                'O servidor de linguagem não está disponível para este projeto.',
            };
          }
          return { available: true, locations };
        }
      }
    } catch (error) {
      if (error instanceof ProjectFileError || error instanceof Error) {
        throw new AiAssistantError(error.message);
      }
      throw error;
    }
  }

  /**
   * A versão esperada de cada arquivo é sempre lida aqui, no servidor —
   * nunca aceita do modelo. O modelo não tem acesso ao hash de versão e não
   * pode ser a fonte de verdade sobre qual estado do arquivo está editando;
   * confiar nele abriria a possibilidade de o modelo forçar uma escrita
   * "por cima" de uma versão que nunca viu de fato.
   */
  private async buildWorkspaceEditRequest(
    project: Project,
    files: readonly WorkspaceEditFileInput[],
  ): Promise<{ files: ProjectWorkspaceFileEdit[] }> {
    const prepared: ProjectWorkspaceFileEdit[] = [];
    for (const file of files) {
      const current = await this.projectFileService.readFile(
        project.path,
        file.path,
      );
      prepared.push({
        path: file.path,
        expectedVersion: current.version,
        edits: file.edits,
      });
    }
    return { files: prepared };
  }

  private async getJson<T>(url: string, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(url, { signal: controller.signal });
      if (!response.ok)
        throw new AiAssistantError(`Resposta ${response.status} do Ollama.`);
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
        throw new AiAssistantError(`Resposta ${response.status} do Ollama.`);
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

function requireNumberArg(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AiAssistantError(`O argumento "${key}" deve ser um número.`);
  }
  return value;
}

const JAVASCRIPT_TYPESCRIPT_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
]);

function languageServerKindForPath(
  filePath: string,
): 'javascript-typescript' | 'ruby' | undefined {
  const extension = extname(filePath).toLowerCase();
  if (extension === '.rb') return 'ruby';
  if (JAVASCRIPT_TYPESCRIPT_EXTENSIONS.has(extension))
    return 'javascript-typescript';
  return undefined;
}

interface WorkspaceEditFileInput {
  path: string;
  edits: ProjectWorkspaceTextEdit[];
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new AiAssistantError(message);
  return value as Record<string, unknown>;
}

function parseTextPosition(
  value: unknown,
  filePath: string,
): ProjectTextPosition {
  const record = asRecord(
    value,
    `Uma posição de edição de "${filePath}" é inválida.`,
  );
  const { line, column } = record;
  if (typeof line !== 'number' || typeof column !== 'number') {
    throw new AiAssistantError(
      `Uma posição de edição de "${filePath}" precisa de "line" e "column" numéricos.`,
    );
  }
  return { line, column };
}

function parseTextRange(value: unknown, filePath: string): ProjectTextRange {
  const record = asRecord(
    value,
    `O campo "range" é obrigatório em uma edição de "${filePath}".`,
  );
  return {
    start: parseTextPosition(record.start, filePath),
    end: parseTextPosition(record.end, filePath),
  };
}

function parseWorkspaceTextEdit(
  value: unknown,
  filePath: string,
): ProjectWorkspaceTextEdit {
  const record = asRecord(
    value,
    `Uma edição de "${filePath}" não é um objeto válido.`,
  );
  const range = parseTextRange(record.range, filePath);
  const newText = record.newText;
  if (typeof newText !== 'string') {
    throw new AiAssistantError(
      `O campo "newText" é obrigatório em uma edição de "${filePath}".`,
    );
  }
  return { range, newText };
}

function parseWorkspaceEditFile(value: unknown): WorkspaceEditFileInput {
  const record = asRecord(value, 'Cada item de "files" deve ser um objeto.');
  const path = record.path;
  if (typeof path !== 'string' || !path.trim()) {
    throw new AiAssistantError('O campo "path" é obrigatório em cada arquivo.');
  }
  const edits = record.edits;
  if (!Array.isArray(edits) || edits.length === 0) {
    throw new AiAssistantError(
      `O arquivo "${path}" precisa de ao menos uma edição.`,
    );
  }
  return {
    path,
    edits: edits.map((edit) => parseWorkspaceTextEdit(edit, path)),
  };
}

function parseWorkspaceEditFiles(
  args: Record<string, unknown>,
): WorkspaceEditFileInput[] {
  const files = args.files;
  if (!Array.isArray(files) || files.length === 0) {
    throw new AiAssistantError(
      'O argumento "files" deve ser uma lista não vazia.',
    );
  }
  return files.map((file) => parseWorkspaceEditFile(file));
}

function summaryFor(tool: AiTool): string {
  switch (tool) {
    case 'read_project_file':
      return 'Arquivo lido.';
    case 'search_project_text':
      return 'Busca concluída.';
    case 'list_project_files':
      return 'Diretório listado.';
    case 'get_git_diff':
      return 'Diff obtido.';
    case 'propose_workspace_edit':
      return 'Edição proposta, aguardando confirmação do usuário.';
    case 'get_symbol_definition':
      return 'Definição consultada.';
    case 'get_symbol_references':
      return 'Referências consultadas.';
  }
}
