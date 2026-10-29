import type { Project } from '@dev-dashboard/contracts';
export type ProjectToolIcon =
  | 'server'
  | 'terminal'
  | 'console'
  | 'sidekiq'
  | 'webpack'
  | 'git'
  | 'worktrees'
  | 'tests'
  | 'environment'
  | 'agent'
  | 'production'
  | 'readme';

export type ProjectToolGroup = 'server' | 'git' | 'development' | 'direct';

export interface ProjectToolContext {
  project: Project;
  sidekiqDetected: boolean;
  webpackDetected: boolean;
}

export interface ProjectTool {
  id: string;
  label: string;
  description: string;
  routeName: string;
  /** Rotas adicionais que marcam a ferramenta como ativa. */
  activeRouteNames?: string[];
  group: ProjectToolGroup;
  aliases: string;
  icon: ProjectToolIcon;
  /** Preserva `environmentInstanceId` ao navegar. */
  environmentAware: boolean;
  /** Visibilidade derivada apenas do projeto; usada por todas as superfícies. */
  isAvailable: (project: Project) => boolean;
  /** Exige detecção em runtime (só disponível no shell do projeto). */
  requiresDetection?: 'sidekiq' | 'webpack';
  /** Ferramenta presente apenas na Command Palette (sub-recursos ficam na Sidebar). */
  sidebar?: false;
}

const always = (): boolean => true;
const isRails = (project: Project): boolean => project.type === 'rails';

export const PROJECT_TOOLS: readonly ProjectTool[] = [
  {
    id: 'server',
    label: 'Servidor',
    description: 'Configuração, status e logs',
    routeName: 'project-server',
    activeRouteNames: ['project-details'],
    group: 'server',
    aliases: 'server logs',
    icon: 'server',
    environmentAware: true,
    isAvailable: (project) => project.capabilities.includes('server'),
  },
  {
    id: 'terminal',
    label: 'Terminal',
    description: 'Terminal do projeto',
    routeName: 'project-terminal',
    group: 'server',
    aliases: 'terminal shell bash',
    icon: 'terminal',
    environmentAware: true,
    isAvailable: always,
  },
  {
    id: 'console',
    label: 'Console Rails',
    description: 'Console Rails do projeto',
    routeName: 'project-console',
    group: 'server',
    aliases: 'console rails irb',
    icon: 'console',
    environmentAware: true,
    isAvailable: isRails,
  },
  {
    id: 'sidekiq',
    label: 'Sidekiq',
    description: 'Filas e jobs Sidekiq',
    routeName: 'project-rails-sidekiq',
    group: 'server',
    aliases: 'sidekiq filas jobs queue',
    icon: 'sidekiq',
    environmentAware: true,
    isAvailable: isRails,
    requiresDetection: 'sidekiq',
  },
  {
    id: 'webpack',
    label: 'Webpack',
    description: 'Dev server de assets Webpack',
    routeName: 'project-rails-webpack',
    group: 'server',
    aliases: 'webpack assets frontend',
    icon: 'webpack',
    environmentAware: true,
    isAvailable: isRails,
    requiresDetection: 'webpack',
  },
  {
    id: 'git',
    label: 'Git',
    description: 'Sincronização, branches, commit e histórico',
    routeName: 'project-git',
    group: 'git',
    aliases: 'branch branches commit diff histórico sincronização sync',
    icon: 'git',
    environmentAware: false,
    isAvailable: (project) => project.capabilities.includes('git'),
    sidebar: false,
  },
  {
    id: 'worktrees',
    label: 'Worktrees',
    description: 'Worktrees e ambientes do repositório',
    routeName: 'project-worktrees',
    group: 'git',
    aliases: 'worktree worktrees branches ambientes',
    icon: 'worktrees',
    environmentAware: false,
    isAvailable: (project) => project.capabilities.includes('git'),
  },
  {
    id: 'tests',
    label: 'Testes',
    description: 'Suítes e histórico de execução',
    routeName: 'project-tests',
    group: 'development',
    aliases: 'test tests testes suíte suite',
    icon: 'tests',
    environmentAware: true,
    isAvailable: (project) => project.capabilities.includes('tests'),
  },
  {
    id: 'environment',
    label: 'Variáveis de ambiente',
    description: 'Configuração de ambiente do projeto',
    routeName: 'project-environment',
    group: 'development',
    aliases: 'environment env variáveis ambiente',
    icon: 'environment',
    environmentAware: true,
    isAvailable: always,
  },
  {
    id: 'agent',
    label: 'Agente',
    description: 'Tasks, providers, checkpoints e autorizações',
    routeName: 'project-agent',
    group: 'direct',
    aliases: 'agent agente codex claude chatgpt automation automação',
    icon: 'agent',
    environmentAware: true,
    isAvailable: always,
  },
  {
    id: 'production',
    label: 'Produção',
    description: 'Status e fluxo de deployment',
    routeName: 'project-production',
    group: 'direct',
    aliases: 'produção deploy deployment',
    icon: 'production',
    environmentAware: false,
    isAvailable: (project) => project.capabilities.includes('production'),
  },
  {
    id: 'readme',
    label: 'README',
    description: 'Documentação do projeto',
    routeName: 'project-readme',
    group: 'direct',
    aliases: 'readme docs documentação',
    icon: 'readme',
    environmentAware: false,
    isAvailable: always,
  },
];

/** Sub-recursos da aba Git (`?tab=`), declarados uma única vez. */
export const PROJECT_GIT_TABS = [
  { id: 'sync', label: 'Sincronização' },
  { id: 'branches', label: 'Branches' },
  { id: 'diff', label: 'Diff' },
  { id: 'commit', label: 'Commit' },
  { id: 'undo', label: 'Desfazer' },
  { id: 'issues', label: 'Issues' },
  { id: 'pull-request', label: 'Pull Request' },
  { id: 'history', label: 'Histórico' },
] as const;

export type ProjectGitTabId = (typeof PROJECT_GIT_TABS)[number]['id'];

export function isProjectGitTabId(value: unknown): value is ProjectGitTabId {
  return PROJECT_GIT_TABS.some((tab) => tab.id === value);
}

/** Ferramentas disponíveis para o projeto, respeitando detecções quando informadas. */
export function listProjectTools(
  project: Project,
  detection?: { sidekiqDetected: boolean; webpackDetected: boolean },
): ProjectTool[] {
  return PROJECT_TOOLS.filter((tool) => {
    if (!tool.isAvailable(project)) return false;
    if (!tool.requiresDetection) return true;
    // Sem contexto de detecção (ex.: Command Palette) a ferramenta não é oferecida.
    if (!detection) return false;
    return tool.requiresDetection === 'sidekiq'
      ? detection.sidekiqDetected
      : detection.webpackDetected;
  });
}

export interface ProjectToolRoute {
  name: string;
  params: { projectId: string };
  query?: Record<string, string>;
}

export function buildProjectToolRoute(
  tool: ProjectTool,
  projectId: string,
  environmentInstanceId?: string,
  query?: Record<string, string>,
): ProjectToolRoute {
  const finalQuery = {
    ...(tool.environmentAware && environmentInstanceId
      ? { environmentInstanceId }
      : {}),
    ...(query ?? {}),
  };
  return {
    name: tool.routeName,
    params: { projectId },
    ...(Object.keys(finalQuery).length ? { query: finalQuery } : {}),
  };
}

export function findProjectTool(id: string): ProjectTool | undefined {
  return PROJECT_TOOLS.find((tool) => tool.id === id);
}

/**
 * Rota de uma Project Tool pelo id. Id desconhecido falha explicitamente,
 * sem cair em rota genérica. Só ferramentas environment-aware recebem
 * `environmentInstanceId`; `query` extra pertence ao destino (ex.: `taskId`).
 */
export function projectToolRoute(
  toolId: string,
  projectId: string,
  options: {
    environmentInstanceId?: string | undefined;
    query?: Record<string, string>;
  } = {},
): ProjectToolRoute {
  const tool = findProjectTool(toolId);
  if (!tool) throw new Error(`Project Tool desconhecida: ${toolId}`);
  return buildProjectToolRoute(
    tool,
    projectId,
    options.environmentInstanceId,
    options.query,
  );
}
