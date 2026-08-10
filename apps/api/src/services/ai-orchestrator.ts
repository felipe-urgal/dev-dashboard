import { extname } from 'node:path';

import type {
  AiChatMessage,
  AiChatStreamEvent,
  AiTool,
  Project,
  ProjectTextPosition,
  ProjectTextRange,
  ProjectWorkspaceFileEdit,
  ProjectWorkspaceTextEdit,
} from '@dev-dashboard/contracts';

import type {
  AiProvider,
  AiProviderMessage,
  AiProviderToolDefinition,
} from './ai-provider.js';
import {
  ProjectFileError,
  ProjectFileService,
} from './project-file-service.js';
import { GitService } from './git-service.js';
import { ProjectWorkspaceEditService } from './project-workspace-edit-service.js';
import { ProjectLanguageServerService } from './project-language-server-service.js';

const CHAT_ROUND_TIMEOUT_MS = 120_000;
const MAX_TOOL_RESULT_CHARS = 8_000;
const MAX_TOOL_ROUNDS = 4;

const TOOL_NAMES: readonly AiTool[] = [
  'read_project_file',
  'search_project_text',
  'list_project_files',
  'get_git_diff',
  'propose_workspace_edit',
  'get_symbol_definition',
  'get_symbol_references',
];

const TOOL_DEFINITIONS: readonly AiProviderToolDefinition[] = [
  {
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
  {
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
  {
    name: 'list_project_files',
    description: 'Lista arquivos e diretórios de um caminho do projeto atual.',
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
  {
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
  {
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
  {
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
  {
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
];

export interface AiChatHandlers {
  send: (event: AiChatStreamEvent) => void;
  signal: AbortSignal;
}

export interface AiOrchestratorOptions {
  provider: AiProvider;
  projectFileService: ProjectFileService;
  gitService: GitService;
  workspaceEditService: ProjectWorkspaceEditService;
  languageServerService: ProjectLanguageServerService;
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

export class AiOrchestrator {
  private readonly provider: AiProvider;
  private readonly projectFileService: ProjectFileService;
  private readonly gitService: GitService;
  private readonly workspaceEditService: ProjectWorkspaceEditService;
  private readonly languageServerService: ProjectLanguageServerService;

  public constructor(options: AiOrchestratorOptions) {
    this.provider = options.provider;
    this.projectFileService = options.projectFileService;
    this.gitService = options.gitService;
    this.workspaceEditService = options.workspaceEditService;
    this.languageServerService = options.languageServerService;
  }

  public async chat(
    project: Project,
    model: string,
    messages: AiChatMessage[],
    handlers: AiChatHandlers,
  ): Promise<void> {
    const conversation: AiProviderMessage[] = messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        if (handlers.signal.aborted) return;

        const result = await this.provider.chatRound(model, conversation, {
          signal: handlers.signal,
          tools: TOOL_DEFINITIONS,
          timeoutMs: CHAT_ROUND_TIMEOUT_MS,
          onTextDelta: (content) =>
            handlers.send({ type: 'message-delta', content }),
        });

        if (result.content) {
          conversation.push({ role: 'assistant', content: result.content });
        }

        if (result.toolCalls.length === 0) {
          handlers.send({ type: 'done' });
          return;
        }

        for (const call of result.toolCalls) {
          if (handlers.signal.aborted) return;
          if (!isToolName(call.name)) {
            handlers.send({
              type: 'error',
              message: `O modelo tentou chamar "${call.name}", que não faz parte do catálogo autorizado.`,
            });
            return;
          }

          const toolResult = await this.runTool(
            project,
            call.name,
            call.arguments,
            handlers,
          );
          conversation.push({
            role: 'tool',
            toolName: call.name,
            content: JSON.stringify(toolResult),
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
      handlers.send({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Falha ao conversar com o motor de IA.',
      });
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
        throw new Error(error.message);
      }
      throw error;
    }
  }

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
}

function requireStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`O argumento "${key}" é obrigatório.`);
  }
  return value;
}

function requireNumberArg(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`O argumento "${key}" deve ser um número.`);
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
  if (JAVASCRIPT_TYPESCRIPT_EXTENSIONS.has(extension)) {
    return 'javascript-typescript';
  }
  return undefined;
}

interface WorkspaceEditFileInput {
  path: string;
  edits: ProjectWorkspaceTextEdit[];
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error(message);
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
    throw new Error(
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
    throw new Error(
      `O campo "newText" é obrigatório em uma edição de "${filePath}".`,
    );
  }
  return { range, newText };
}

function parseWorkspaceEditFile(value: unknown): WorkspaceEditFileInput {
  const record = asRecord(value, 'Cada item de "files" deve ser um objeto.');
  const path = record.path;
  if (typeof path !== 'string' || !path.trim()) {
    throw new Error('O campo "path" é obrigatório em cada arquivo.');
  }
  const edits = record.edits;
  if (!Array.isArray(edits) || edits.length === 0) {
    throw new Error(`O arquivo "${path}" precisa de ao menos uma edição.`);
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
    throw new Error('O argumento "files" deve ser uma lista não vazia.');
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
