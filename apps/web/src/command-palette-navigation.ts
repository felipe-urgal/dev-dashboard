import type { Project, Workspace } from '@dev-dashboard/contracts';
import type { RouteLocationRaw } from 'vue-router';

import {
  buildProjectToolRoute,
  listProjectTools,
  type ProjectToolIcon,
} from './project-tools';
import {
  normalizePaletteText,
  paletteFuzzyScore,
  type ParsedPaletteQuery,
} from './utils/command-palette';

export type CommandPaletteNavigationGroup =
  'Páginas' | 'Workspaces' | 'Projetos' | 'Ferramentas';

export type CommandPaletteNavigationIcon =
  ProjectToolIcon | 'home' | 'activity' | 'database' | 'workspace' | 'project';

export interface CommandPaletteProjectContext {
  projectId: string;
  environmentInstanceId?: string | undefined;
}

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

function buildProjectTools(
  project: Project,
  context?: CommandPaletteProjectContext,
): CommandPaletteNavigationItem[] {
  if (!project.enabled) return [];

  const environmentInstanceId =
    context?.projectId === project.id
      ? context.environmentInstanceId
      : undefined;

  return listProjectTools(project).map((tool) =>
    item({
      id: `project-${project.id}-${tool.id}`,
      group: 'Ferramentas',
      label: tool.label,
      description: `${project.name} · ${tool.description}`,
      icon: tool.icon,
      mode: 'page',
      to: buildProjectToolRoute(tool, project.id, environmentInstanceId),
      projectId: project.id,
      ...(project.workspaceId ? { workspaceId: project.workspaceId } : {}),
      aliases: `${project.id} ${project.name} ${project.path} ${tool.aliases} ${project.name} ${tool.label}`,
    }),
  );
}

export function buildCommandPaletteNavigationItems(
  projects: Project[],
  workspaces: Workspace[],
  context?: CommandPaletteProjectContext,
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
        to: { name: 'dashboard', hash: '#overview' },
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
  const toolItems = sortedProjects.flatMap((project) =>
    buildProjectTools(project, context),
  );

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
