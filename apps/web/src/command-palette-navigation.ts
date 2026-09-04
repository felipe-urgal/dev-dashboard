import type { Project, Workspace } from '@dev-dashboard/contracts';
import type { RouteLocationRaw } from 'vue-router';

import {
  normalizePaletteText,
  paletteFuzzyScore,
  type ParsedPaletteQuery,
} from './utils/command-palette';

export type CommandPaletteNavigationGroup =
  'Páginas' | 'Workspaces' | 'Projetos' | 'Ferramentas';

export type CommandPaletteNavigationIcon =
  | 'home'
  | 'processes'
  | 'production'
  | 'database'
  | 'workspace'
  | 'project'
  | 'server'
  | 'git'
  | 'tests'
  | 'dependencies'
  | 'environment'
  | 'doctor'
  | 'readme';

export interface CommandPaletteNavigationItem {
  id: string;
  group: CommandPaletteNavigationGroup;
  label: string;
  description: string;
  searchText: string;
  icon: CommandPaletteNavigationIcon;
  mode: 'page' | 'project';
  to: RouteLocationRaw;
  workspaceId?: string;
  projectId?: string;
}

function item(
  value: Omit<CommandPaletteNavigationItem, 'searchText'> & {
    aliases?: string;
  },
): CommandPaletteNavigationItem {
  const { aliases = '', ...navigationItem } = value;
  return {
    ...navigationItem,
    searchText: normalizePaletteText(
      `${value.label} ${value.description} ${aliases}`,
    ),
  };
}

function projectTool(
  project: Project,
  value: {
    id: string;
    label: string;
    description: string;
    icon: CommandPaletteNavigationIcon;
    to: RouteLocationRaw;
    aliases?: string;
  },
): CommandPaletteNavigationItem {
  return item({
    id: `project-${project.id}-${value.id}`,
    group: 'Ferramentas',
    label: value.label,
    description: `${project.name} · ${value.description}`,
    icon: value.icon,
    mode: 'page',
    to: value.to,
    projectId: project.id,
    ...(project.workspaceId ? { workspaceId: project.workspaceId } : {}),
    aliases: `${project.id} ${project.name} ${project.path} ${value.aliases ?? ''} ${project.name} ${value.label}`,
  });
}

function buildProjectTools(project: Project): CommandPaletteNavigationItem[] {
  if (!project.enabled) return [];

  const params = { projectId: project.id };
  return [
    ...(project.capabilities.includes('server')
      ? [
          projectTool(project, {
            id: 'server',
            label: 'Servidor',
            description: 'Configuração, status e logs',
            icon: 'server',
            to: { name: 'project-server', params },
            aliases: 'server logs',
          }),
        ]
      : []),
    ...(project.capabilities.includes('git')
      ? [
          projectTool(project, {
            id: 'git',
            label: 'Git',
            description: 'Sincronização, branches, commit e histórico',
            icon: 'git',
            to: { name: 'project-git', params },
            aliases: 'branch branches commit diff histórico sincronização sync',
          }),
        ]
      : []),
    ...(project.capabilities.includes('tests')
      ? [
          projectTool(project, {
            id: 'tests',
            label: 'Testes',
            description: 'Suítes e histórico de execução',
            icon: 'tests',
            to: { name: 'project-tests', params },
            aliases: 'test tests testes suíte suite',
          }),
        ]
      : []),
    ...(project.capabilities.includes('production')
      ? [
          projectTool(project, {
            id: 'production',
            label: 'Produção',
            description: 'Status e fluxo de deployment',
            icon: 'production',
            to: { name: 'project-production', params },
            aliases: 'produção deploy deployment',
          }),
        ]
      : []),
    ...(project.type === 'rails' || project.type === 'node'
      ? [
          projectTool(project, {
            id: 'dependencies',
            label: 'Dependências',
            description: 'Dependências do projeto',
            icon: 'dependencies',
            to: { name: 'project-dependencies', params },
            aliases: 'dependencies packages gems npm bundle',
          }),
        ]
      : []),
    projectTool(project, {
      id: 'environment',
      label: 'Variáveis de ambiente',
      description: 'Configuração de ambiente do projeto',
      icon: 'environment',
      to: { name: 'project-environment', params },
      aliases: 'environment env variáveis ambiente',
    }),
    projectTool(project, {
      id: 'doctor',
      label: 'Diagnóstico',
      description: 'Diagnóstico e saúde do projeto',
      icon: 'doctor',
      to: { name: 'project-doctor', params },
      aliases: 'doctor diagnóstico saúde health',
    }),
    projectTool(project, {
      id: 'readme',
      label: 'README',
      description: 'Documentação do projeto',
      icon: 'readme',
      to: { name: 'project-readme', params },
      aliases: 'readme docs documentação',
    }),
  ];
}

export function buildCommandPaletteNavigationItems(
  projects: Project[],
  workspaces: Workspace[],
): CommandPaletteNavigationItem[] {
  const globalItems: CommandPaletteNavigationItem[] = [
    item({
      id: 'page-dashboard',
      group: 'Páginas',
      label: 'Visão geral',
      description: 'Dashboard e repositórios',
      icon: 'home',
      mode: 'page',
      to: { name: 'dashboard' },
      aliases: 'home início projetos repositórios',
    }),
    item({
      id: 'page-processes',
      group: 'Páginas',
      label: 'Processos',
      description: 'Processos gerenciados',
      icon: 'processes',
      mode: 'page',
      to: { name: 'processes' },
      aliases: 'process process manager',
    }),
    item({
      id: 'page-production',
      group: 'Páginas',
      label: 'Produção',
      description: 'Visão global de produção',
      icon: 'production',
      mode: 'page',
      to: { name: 'production' },
      aliases: 'deploy deployment produção',
    }),
    item({
      id: 'page-database',
      group: 'Páginas',
      label: 'Banco de dados',
      description: 'Serviços de banco da máquina',
      icon: 'database',
      mode: 'page',
      to: { name: 'database' },
      aliases: 'database db banco dados postgres mysql',
    }),
  ];

  const workspaceItems = [...workspaces]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((workspace) =>
      item({
        id: `workspace-${workspace.id}`,
        group: 'Workspaces',
        label: workspace.name,
        description: workspace.path,
        icon: 'workspace',
        mode: 'project',
        to: { name: 'dashboard', hash: '#repositories' },
        workspaceId: workspace.id,
        aliases: `workspace ${workspace.id}`,
      }),
    );

  const sortedProjects = [...projects].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const projectItems = sortedProjects.map((project) =>
    item({
      id: `project-${project.id}`,
      group: 'Projetos',
      label: project.name,
      description: project.enabled
        ? project.path
        : `${project.path} · desativado`,
      icon: 'project',
      mode: 'project',
      to: { name: 'project-details', params: { projectId: project.id } },
      projectId: project.id,
      ...(project.workspaceId ? { workspaceId: project.workspaceId } : {}),
      aliases: `${project.id} projeto ${project.type}`,
    }),
  );
  const toolItems = sortedProjects.flatMap(buildProjectTools);

  return [...globalItems, ...workspaceItems, ...projectItems, ...toolItems];
}

function tokenizeSearchText(value: string): string[] {
  return normalizePaletteText(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function scoreNavigationItem(searchText: string, queryValue: string): number {
  const searchTokens = tokenizeSearchText(searchText);
  const queryTokens = tokenizeSearchText(queryValue);
  let totalScore = 0;

  for (const queryToken of queryTokens) {
    let bestScore = -1;

    for (const searchToken of searchTokens) {
      bestScore = Math.max(
        bestScore,
        paletteFuzzyScore(searchToken, queryToken),
      );
    }

    if (bestScore < 0) return -1;
    totalScore += bestScore;
  }

  return totalScore;
}

export function filterCommandPaletteNavigationItems(
  items: CommandPaletteNavigationItem[],
  query: ParsedPaletteQuery,
): CommandPaletteNavigationItem[] {
  if (query.mode === 'action') return [];

  const candidates = items.filter((navigationItem) => {
    if (query.mode === 'all') return true;
    return navigationItem.mode === query.mode;
  });

  if (!query.value) return candidates;

  return candidates
    .map((navigationItem) => ({
      item: navigationItem,
      score: scoreNavigationItem(navigationItem.searchText, query.value),
    }))
    .filter(({ score }) => score >= 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.item.label.localeCompare(right.item.label),
    )
    .map(({ item: navigationItem }) => navigationItem);
}
