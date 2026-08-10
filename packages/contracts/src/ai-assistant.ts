import type { ProjectWorkspaceEditPreview } from './project-files.js';

export type AiCapability = 'chat' | 'tools' | 'fill-in-the-middle';

export type AiExecutionMode = 'fast' | 'complete';

export type AiProviderId = 'ollama' | 'openai';

export type AiProviderKind = 'local' | 'cloud';

export interface AiModelInfo {
  name: string;
  capabilities: AiCapability[];
}

export interface ProjectAiStatus {
  available: boolean;
  baseUrl?: string;
  models: AiModelInfo[];
  message: string;
}

export interface ProjectAiProviderStatus extends ProjectAiStatus {
  id: AiProviderId;
  label: string;
  kind: AiProviderKind;
  consentRequired: boolean;
  consentGranted: boolean;
}

export interface ProjectAiProvidersStatus {
  selectedProvider: AiProviderId;
  selectedMode: AiExecutionMode;
  providers: ProjectAiProviderStatus[];
}

export const AI_RECOMMENDED_MODELS = [
  {
    name: 'qwen2.5-coder:7b',
    label: 'Leve',
    description: 'Resposta rápida para revisões curtas.',
  },
  {
    name: 'qwen2.5-coder:14b',
    label: 'Recomendado',
    description: 'Melhor equilíbrio para revisão de Pull Request.',
  },
  {
    name: 'devstral:24b',
    label: 'Avançado',
    description: 'Mais profundo, indicado para máquina forte.',
  },
] as const;

export type AiRecommendedModelName =
  (typeof AI_RECOMMENDED_MODELS)[number]['name'];

export type AiModelPullStreamEvent =
  | {
      type: 'progress';
      model: AiRecommendedModelName;
      status: string;
      completed?: number;
      total?: number;
    }
  | { type: 'done'; model: AiRecommendedModelName }
  | { type: 'error'; message: string };

export type AiTool =
  | 'read_project_file'
  | 'search_project_text'
  | 'list_project_files'
  | 'get_git_diff'
  | 'propose_workspace_edit'
  | 'get_symbol_definition'
  | 'get_symbol_references';

export type AiChatRole = 'user' | 'assistant' | 'system';

export interface AiChatMessage {
  role: AiChatRole;
  content: string;
}

export interface AiChatRequest {
  model: string;
  messages: AiChatMessage[];
  provider?: AiProviderId;
  mode?: AiExecutionMode;
}

export type AiChatStreamEvent =
  | { type: 'message-delta'; content: string }
  | { type: 'tool-call'; tool: AiTool; arguments: Record<string, unknown> }
  | { type: 'tool-result'; tool: AiTool; ok: boolean; summary: string }
  | { type: 'workspace-edit-proposed'; preview: ProjectWorkspaceEditPreview }
  | { type: 'done' }
  | { type: 'error'; message: string };

/**
 * Execução de uma solicitação de implementação iniciada pelo usuário.
 *
 * A execução é mantida pela API para que a navegação entre abas não interrompa
 * a conversa com o provider selecionado. Ela é efêmera: reiniciar a API encerra
 * execuções em andamento e descarta o histórico em memória.
 */
export type AiImplementationExecutionStatus =
  'running' | 'succeeded' | 'failed' | 'cancelled';

export interface AiImplementationExecution {
  id: string;
  projectId: string;
  model: string;
  prompt: string;
  status: AiImplementationExecutionStatus;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  events: AiChatStreamEvent[];
}

export interface AiImplementationExecutionRequest {
  model: string;
  prompt: string;
  provider?: AiProviderId;
  mode?: AiExecutionMode;
}

export interface AiImplementationExecutionList {
  execution: AiImplementationExecution | null;
}

export interface AiCompletionRequest {
  model: string;
  prefix: string;
  suffix?: string;
  provider?: AiProviderId;
}

export interface AiCompletionResult {
  text: string;
}
