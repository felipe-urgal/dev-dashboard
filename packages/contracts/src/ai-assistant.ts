import type { ProjectWorkspaceEditPreview } from './project-files.js';

export type AiCapability = 'chat' | 'tools' | 'fill-in-the-middle';

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
}

export type AiChatStreamEvent =
  | { type: 'message-delta'; content: string }
  | { type: 'tool-call'; tool: AiTool; arguments: Record<string, unknown> }
  | { type: 'tool-result'; tool: AiTool; ok: boolean; summary: string }
  | { type: 'workspace-edit-proposed'; preview: ProjectWorkspaceEditPreview }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface AiCompletionRequest {
  model: string;
  prefix: string;
  suffix?: string;
}

export interface AiCompletionResult {
  text: string;
}
