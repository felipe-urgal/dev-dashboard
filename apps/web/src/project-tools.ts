import type { Project } from '@dev-dashboard/contracts';
import type { RouteLocationRaw } from 'vue-router';

export type ProjectToolIcon =
  | 'server'
  | 'terminal'
  | 'console'
  | 'sidekiq'
  | 'webpack'
  | 'git'
  | 'worktrees'
  | 'tests'
  | 'dependencies'
  | 'dev-container'
  | 'compose'
  | 'environment'
  | 'migrations'
  | 'local-ci'
  | 'readiness'
  | 'security'
  | 'doctor'
  | 'agent'
  | 'production'
  | 'readme';

export type ProjectToolGroup =
  'server' | 'git' | 'development' | 'quality' | 'direct';

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
    id: 'dependencies',
    label: 'Dependências',
    description: 'Dependências do projeto',
    routeName: 'project-dependencies',
    group: 'development',
    aliases: 'dependencies packages gems npm bundle',
    icon: 'dependencies',
    environmentAware: true,
    isAvailable: (project) =>
      project.type === 'rails' || project.type === 'node',
  },
  {
    id: 'dev-container',
    label: 'Dev Container',
    description: 'Dev Container do projeto',
    routeName: 'project-dev-container',
    group: 'development',
    aliases: 'devcontainer dev container docker',
    icon: 'dev-container',
    environmentAware: true,
    isAvailable: always,
  },
  {
    id: 'compose',
    label: 'Compose',
    description: 'Docker Compose do projeto',
    routeName: 'project-compose',
    group: 'development',
    aliases: 'compose docker serviços services',
    icon: 'compose',
    environmentAware: true,
    isAvailable: always,
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
    id: 'migrations',
    label: 'Migrations',
    description: 'Migrations do projeto',
    routeName: 'project-migrations',
    group: 'development',
    aliases: 'migrations migração schema',
    icon: 'migrations',
    environmentAware: true,
    isAvailable: always,
  },
  {
    id: 'local-ci',
    label: 'Local CI',
    description: 'Pipeline de verificação local',
    routeName: 'project-local-ci',
    group: 'quality',
    aliases: 'ci local pipeline checks',
    icon: 'local-ci',
    environmentAware: false,
    isAvailable: always,
  },
  {
    id: 'readiness',
    label: 'Readiness',
    description: 'Prontidão para release',
    routeName: 'project-readiness',
    group: 'quality',
    aliases: 'readiness release prontidão',
    icon: 'readiness',
    environmentAware: false,
    isAvailable: always,
  },
  {
    id: 'security',
    label: 'Segurança',
    description: 'Centro de segurança do projeto',
    routeName: 'project-security-center',
    group: 'quality',
    aliases: 'security segurança vulnerabilidades audit',
    icon: 'security',
    environmentAware: false,
    isAvailable: always,
  },
  {
    id: 'doctor',
    label: 'Diagnóstico',
    description: 'Diagnóstico e saúde do projeto',
    routeName: 'project-doctor',
    group: 'quality',
    aliases: 'doctor diagnóstico saúde health',
    icon: 'doctor',
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

export function buildProjectToolRoute(
  tool: ProjectTool,
  projectId: string,
  environmentInstanceId?: string,
  query?: Record<string, string>,
): RouteLocationRaw {
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
