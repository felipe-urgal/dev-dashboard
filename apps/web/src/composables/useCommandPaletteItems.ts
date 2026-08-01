import { computed, type Component, type Ref } from 'vue';
import type { RouteLocationRaw } from 'vue-router';

import type {
  ManagedProcess,
  Project,
  ProjectScriptCatalog,
  ProjectTestOverview,
  Workspace,
} from '@dev-dashboard/contracts';

import {
  ArrowPathIcon,
  BeakerIcon,
  CircleStackIcon,
  ClockIcon,
  CodeBracketIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  DocumentTextIcon,
  FolderIcon,
  HomeIcon,
  PlayCircleIcon,
  ServerStackIcon,
  StopCircleIcon,
} from '@heroicons/vue/24/outline';

import { normalizePaletteText, paletteFuzzyScore, type CommandPaletteMode, type ParsedPaletteQuery } from '../utils/command-palette';
import { isRunnableProjectScript } from '../utils/project-script-visibility';
import type { CommandPaletteActionOperation } from './useCommandPaletteProjectActions';

export type PaletteGroup = 'Recentes' | 'Projeto atual' | 'Comandos do projeto' | 'Páginas' | 'Workspaces' | 'Projetos';
type ActionRisk = 'reversivel' | 'atencao';

interface PaletteItemBase {
  id: string;
  group: Exclude<PaletteGroup, 'Recentes'>;
  label: string;
  description: string;
  searchText: string;
  icon: Component;
  mode: Exclude<CommandPaletteMode, 'all'>;
}

export interface NavigationPaletteItem extends PaletteItemBase {
  kind: 'navigation';
  to: RouteLocationRaw;
  workspaceId?: string;
  hint?: string;
  projectId?: string;
}

export interface ActionPaletteItem extends PaletteItemBase {
  kind: 'action';
  operation: CommandPaletteActionOperation;
  risk: ActionRisk;
}

export type PaletteItem = NavigationPaletteItem | ActionPaletteItem;
export interface PaletteGroupView { name: PaletteGroup; items: PaletteItem[] }

export interface UseCommandPaletteItemsOptions {
  projects: () => Project[];
  workspaces: () => Workspace[];
  selectedProject: () => Project | undefined;
  parsedQuery: () => ParsedPaletteQuery;
  recentIds: Ref<string[]>;
  loadedProjectId: Ref<string | undefined>;
  projectProcess: Ref<ManagedProcess | null | undefined>;
  testProcess: Ref<ManagedProcess | null | undefined>;
  testOverview: Ref<ProjectTestOverview | undefined>;
  scriptCatalog: Ref<ProjectScriptCatalog | undefined>;
}

function navigationItem(
  id: string,
  group: NavigationPaletteItem['group'],
  label: string,
  description: string,
  to: RouteLocationRaw,
  icon: Component,
  mode: NavigationPaletteItem['mode'],
  workspaceId?: string,
  hint?: string,
): NavigationPaletteItem {
  return { id, group, label, description, to, icon, mode, kind: 'navigation', searchText: normalizePaletteText(`${label} ${description}`), ...(workspaceId ? { workspaceId } : {}), ...(hint ? { hint } : {}) };
}

function actionItem(id: string, label: string, description: string, icon: Component, risk: ActionRisk, operation: CommandPaletteActionOperation, aliases = ''): ActionPaletteItem {
  return { id, group: 'Comandos do projeto', label, description, icon, risk, operation, mode: 'action', kind: 'action', searchText: normalizePaletteText(`${label} ${description} ${aliases}`) };
}

/**
 * Monta a lista de itens da paleta (navegação global + ações do projeto
 * selecionado) e as duas derivações que a UI consome: ordenada por busca/
 * recentes e agrupada por seção. Separado do carregamento de estado do
 * projeto (`useCommandPaletteProjectActions`) porque a montagem de itens não
 * precisa saber como esse estado chega, só lê os `ref`s já resolvidos.
 */
export function useCommandPaletteItems(options: UseCommandPaletteItemsOptions) {
  function buildProjectItems(project: Project): PaletteItem[] {
    const params = { projectId: project.id };
    const areas: NavigationPaletteItem[] = [
      navigationItem(`area-project-details-${project.id}`, 'Projeto atual', 'Visão geral do projeto', project.name, { name: 'project-details', params }, HomeIcon, 'page'),
      navigationItem(`area-project-server-${project.id}`, 'Projeto atual', 'Servidor', 'Configurar e controlar o servidor', { name: 'project-server', params }, ServerStackIcon, 'page'),
      navigationItem(`area-project-logs-${project.id}`, 'Projeto atual', 'Logs', 'Acompanhar a saída do servidor', { name: 'project-logs', params }, DocumentTextIcon, 'page'),
      navigationItem(`area-project-git-${project.id}`, 'Projeto atual', 'Git', 'Branches, diff, commit e sincronização', { name: 'project-git', params }, CodeBracketIcon, 'page'),
      navigationItem(`area-project-tests-${project.id}`, 'Projeto atual', 'Testes', 'Suítes e histórico de execução', { name: 'project-tests', params }, BeakerIcon, 'page'),
      navigationItem(`area-project-database-${project.id}`, 'Projeto atual', 'Banco de dados', 'Ambientes, snapshots e migrations', { name: 'project-database', params }, CircleStackIcon, 'page'),
      navigationItem(`area-project-scripts-${project.id}`, 'Projeto atual', 'Scripts', 'Catálogo autorizado do projeto', { name: 'project-scripts', params }, CommandLineIcon, 'page'),
    ];
    const shortcuts: NavigationPaletteItem[] = [
      ...(project.capabilities.includes('server') ? [
        navigationItem(`command-server-${project.id}`, 'Comandos do projeto', 'Abrir servidor', 'Configuração e status do servidor', { name: 'project-server', params }, ServerStackIcon, 'action', undefined, 'Abrir'),
        navigationItem(`command-logs-${project.id}`, 'Comandos do projeto', 'Abrir logs', 'Acompanhar a saída do servidor', { name: 'project-logs', params }, DocumentTextIcon, 'action', undefined, 'Abrir'),
      ] : []),
      ...(project.capabilities.includes('git') ? [
        navigationItem(`command-git-${project.id}`, 'Comandos do projeto', 'Abrir Git', 'Branches, diff e histórico', { name: 'project-git', params }, CodeBracketIcon, 'action', undefined, 'Abrir'),
        navigationItem(`command-git-sync-${project.id}`, 'Comandos do projeto', 'Sincronizar main', 'Abrir sincronização segura do repositório', { name: 'project-git', params, query: { tab: 'sync' } }, ArrowPathIcon, 'action', undefined, 'Abrir'),
        navigationItem(`command-git-branch-${project.id}`, 'Comandos do projeto', 'Criar branch', 'Abrir gerenciamento de branches', { name: 'project-git', params, query: { tab: 'branches' } }, CodeBracketIcon, 'action', undefined, 'Abrir'),
        navigationItem(`command-git-commit-${project.id}`, 'Comandos do projeto', 'Commitar alterações', 'Abrir criação e correção de commit', { name: 'project-git', params, query: { tab: 'commit' } }, CodeBracketIcon, 'action', undefined, 'Abrir'),
      ] : []),
      ...(project.capabilities.includes('tests') ? [navigationItem(`command-tests-${project.id}`, 'Comandos do projeto', 'Abrir testes', 'Suítes e histórico de execução', { name: 'project-tests', params }, BeakerIcon, 'action', undefined, 'Abrir')] : []),
      ...(project.capabilities.includes('database') ? [
        navigationItem(`command-database-${project.id}`, 'Comandos do projeto', 'Abrir banco de dados', 'Ambientes e ferramentas do banco', { name: 'project-database', params }, CircleStackIcon, 'action', undefined, 'Abrir'),
        navigationItem(`command-database-snapshot-${project.id}`, 'Comandos do projeto', 'Criar snapshot', 'Abrir snapshots do banco de dados', { name: 'project-database', params, query: { section: 'snapshots' } }, CircleStackIcon, 'action', undefined, 'Abrir'),
      ] : []),
      ...(project.capabilities.includes('scripts') ? [navigationItem(`command-scripts-${project.id}`, 'Comandos do projeto', 'Abrir scripts', 'Catálogo autorizado do projeto', { name: 'project-scripts', params }, CommandLineIcon, 'action', undefined, 'Abrir')] : []),
    ];
    const actions: ActionPaletteItem[] = [];
    const { loadedProjectId, projectProcess, testProcess, testOverview, scriptCatalog } = options;
    if (loadedProjectId.value === project.id && project.capabilities.includes('server') && projectProcess.value !== undefined) {
      const status = projectProcess.value?.status ?? 'stopped';
      if (status === 'running' || status === 'starting') {
        actions.push(actionItem(`${project.id}:server-stop`, 'Parar servidor', `Interromper o servidor de ${project.name}`, StopCircleIcon, 'atencao', { type: 'server-stop' }, 'stop server server stop'));
      } else if (status !== 'stopping') {
        actions.push(actionItem(`${project.id}:server-start`, 'Iniciar servidor', `Executar o servidor de ${project.name}`, ServerStackIcon, 'reversivel', { type: 'server-start' }, 'start server server start iniciar server'));
      }
    }
    if (loadedProjectId.value === project.id && project.capabilities.includes('tests') && testOverview.value?.supported) {
      const status = testProcess.value?.status;
      if (status === 'running' || status === 'starting') {
        actions.push(actionItem(`${project.id}:test-stop`, 'Parar testes', 'Interromper a suíte em execução', StopCircleIcon, 'atencao', { type: 'test-stop' }));
      } else {
        for (const command of testOverview.value.commands) {
          actions.push(actionItem(`${project.id}:test-${command.id}`, command.label, command.description, BeakerIcon, 'reversivel', { type: 'test-start', commandId: command.id }));
        }
      }
    }
    if (loadedProjectId.value === project.id && project.capabilities.includes('scripts')) {
      for (const script of scriptCatalog.value?.items.filter(
        (item) => item.enabled && isRunnableProjectScript(item, project),
      ) ?? []) {
        actions.push(actionItem(`${project.id}:script-${script.id}`, script.name, script.description || script.command, CommandLineIcon, script.risk === 'read-only' ? 'reversivel' : 'atencao', { type: 'script-start', script }));
      }
    }
    return [...areas, ...actions, ...shortcuts];
  }

  const items = computed<PaletteItem[]>(() => {
    const project = options.selectedProject();
    const projectItems: PaletteItem[] = project ? buildProjectItems(project) : [];
    const globalItems: NavigationPaletteItem[] = [
      navigationItem('pagina-visao-geral', 'Páginas', 'Visão geral', 'Dashboard e repositórios', { name: 'dashboard', hash: '#overview' }, HomeIcon, 'page'),
      navigationItem('pagina-atividade', 'Páginas', 'Atividade', 'Histórico unificado', { name: 'activity' }, ClockIcon, 'page'),
      navigationItem('pagina-processos', 'Páginas', 'Processos', 'Processos gerenciados', { name: 'processes' }, PlayCircleIcon, 'page'),
      navigationItem('pagina-configuracoes', 'Páginas', 'Configurações', 'Preferências e retenção local', { name: 'settings' }, Cog6ToothIcon, 'page'),
    ];
    const workspaceItems = options.workspaces().map((workspace) =>
      navigationItem(`workspace-${workspace.id}`, 'Workspaces', workspace.name, workspace.path, { name: 'dashboard', hash: '#repositories' }, FolderIcon, 'project', workspace.id),
    );
    const allProjectItems = [...options.projects()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((item) => ({
        ...navigationItem(`project-${item.id}`, 'Projetos', item.name, item.path, { name: 'project-details', params: { projectId: item.id } }, FolderIcon, 'project'),
        projectId: item.id,
      }));

    return [...projectItems, ...globalItems, ...workspaceItems, ...allProjectItems];
  });

  const orderedItems = computed<PaletteItem[]>(() => {
    const parsed = options.parsedQuery();
    const candidates = items.value.filter((item) => parsed.mode === 'all' || item.mode === parsed.mode);
    if (parsed.value) {
      return candidates
        .map((item) => ({ item, score: paletteFuzzyScore(item.searchText, parsed.value) }))
        .filter(({ score }) => score >= 0)
        .sort((left, right) => right.score - left.score || left.item.label.localeCompare(right.item.label))
        .map(({ item }) => item);
    }

    const recent = options.recentIds.value
      .map((id) => candidates.find((item) => item.id === id))
      .filter((item): item is PaletteItem => Boolean(item));
    const recentSet = new Set(recent.map((item) => item.id));
    return [...recent, ...candidates.filter((item) => !recentSet.has(item.id))];
  });

  const groupViews = computed<PaletteGroupView[]>(() => {
    const parsed = options.parsedQuery();
    const recentSet = !parsed.value
      ? new Set(options.recentIds.value.filter((id) => orderedItems.value.some((item) => item.id === id)))
      : new Set<string>();
    const result: PaletteGroupView[] = [];
    for (const item of orderedItems.value) {
      const name: PaletteGroup = recentSet.has(item.id) ? 'Recentes' : item.group;
      let group = result.find((entry) => entry.name === name);
      if (!group) {
        group = { name, items: [] };
        result.push(group);
      }
      group.items.push(item);
    }
    return result;
  });

  return { items, orderedItems, groupViews };
}
