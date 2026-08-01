<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Component,
} from 'vue';
import {
  useRoute,
  useRouter,
  type RouteLocationRaw,
} from 'vue-router';
import type {
  ManagedProcess,
  Project,
  ProjectScript,
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
  MagnifyingGlassIcon,
  PlayCircleIcon,
  ServerStackIcon,
  ShieldCheckIcon,
  StopCircleIcon,
} from '@heroicons/vue/24/outline';
import {
  fetchProjectProcess,
  fetchProjectScripts,
  fetchProjectServerSettings,
  fetchProjectTestProcess,
  fetchProjectTests,
  prepareScriptExecution,
  startProjectProcess,
  startProjectTest,
  startScriptExecution,
  stopProjectProcess,
  stopProjectTest,
} from '../api';
import { useAutoDismiss } from '../composables/useAutoDismiss';
import { dashboardStore } from '../stores/dashboard';
import {
  normalizePaletteText,
  paletteFuzzyScore,
  parsePaletteQuery,
  type CommandPaletteMode,
} from '../utils/command-palette';

const props = defineProps<{
  projects: Project[];
  workspaces: Workspace[];
}>();

type PaletteGroup = 'Recentes' | 'Projeto atual' | 'Comandos do projeto' | 'Páginas' | 'Workspaces' | 'Projetos';
type ActionRisk = 'reversivel' | 'atencao';
type ActionOperation =
  | { type: 'server-start' }
  | { type: 'server-stop' }
  | { type: 'test-start'; commandId: string }
  | { type: 'test-stop' }
  | { type: 'script-start'; script: ProjectScript };

interface PaletteItemBase {
  id: string;
  group: Exclude<PaletteGroup, 'Recentes'>;
  label: string;
  description: string;
  searchText: string;
  icon: Component;
  mode: Exclude<CommandPaletteMode, 'all'>;
}

interface NavigationPaletteItem extends PaletteItemBase {
  kind: 'navigation';
  to: RouteLocationRaw;
  workspaceId?: string;
  hint?: string;
  projectId?: string;
}

interface ActionPaletteItem extends PaletteItemBase {
  kind: 'action';
  operation: ActionOperation;
  risk: ActionRisk;
}

type PaletteItem = NavigationPaletteItem | ActionPaletteItem;
interface PaletteGroupView { name: PaletteGroup; items: PaletteItem[] }

const RECENTS_KEY = 'dev-dashboard:command-palette:recent-items';
const route = useRoute();
const router = useRouter();
const open = ref(false);
const query = ref('');
const activeIndex = ref(0);
const searchInput = ref<HTMLInputElement>();
const dialog = ref<HTMLElement>();
const projectProcess = ref<ManagedProcess | null>();
const testProcess = ref<ManagedProcess | null>();
const testOverview = ref<ProjectTestOverview>();
const scriptCatalog = ref<ProjectScriptCatalog>();
const loadedProjectId = ref<string>();
const loadingActions = ref(false);
const executingAction = ref(false);
const pendingActionId = ref<string>();
const feedback = ref('');
const recentIds = ref<string[]>(readRecents());

useAutoDismiss(feedback, '');
let previousFocus: HTMLElement | null = null;

const currentProject = computed(() => {
  const value = route.params.projectId;
  const projectId = Array.isArray(value) ? value[0] : value;
  return props.projects.find((project) => project.id === projectId);
});

const parsedQuery = computed(() => parsePaletteQuery(query.value));
const selectedProject = computed(() => {
  const projectQuery = parsedQuery.value.project;
  if (projectQuery === undefined) return currentProject.value;
  const exact = props.projects.find((project) => [project.id, project.name].some((value) => normalizePaletteText(value) === projectQuery));
  if (exact) return exact;
  return props.projects
    .map((project) => ({ project, score: paletteFuzzyScore(`${project.name} ${project.id} ${project.path}`, projectQuery) }))
    .filter(({ score }) => score >= 0)
    .sort((left, right) => right.score - left.score)[0]?.project;
});

const items = computed<PaletteItem[]>(() => {
  const project = selectedProject.value;
  const projectItems: PaletteItem[] = project ? buildProjectItems(project) : [];
  const globalItems: NavigationPaletteItem[] = [
    navigationItem('pagina-visao-geral', 'Páginas', 'Visão geral', 'Dashboard e repositórios', { name: 'dashboard', hash: '#overview' }, HomeIcon, 'page'),
    navigationItem('pagina-atividade', 'Páginas', 'Atividade', 'Histórico unificado', { name: 'activity' }, ClockIcon, 'page'),
    navigationItem('pagina-processos', 'Páginas', 'Processos', 'Processos gerenciados', { name: 'processes' }, PlayCircleIcon, 'page'),
    navigationItem('pagina-configuracoes', 'Páginas', 'Configurações', 'Preferências e retenção local', { name: 'settings' }, Cog6ToothIcon, 'page'),
  ];
  const workspaceItems = props.workspaces.map((workspace) =>
    navigationItem(`workspace-${workspace.id}`, 'Workspaces', workspace.name, workspace.path, { name: 'dashboard', hash: '#repositories' }, FolderIcon, 'project', workspace.id),
  );
  const allProjectItems = [...props.projects]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((item) => ({
      ...navigationItem(`project-${item.id}`, 'Projetos', item.name, item.path, { name: 'project-details', params: { projectId: item.id } }, FolderIcon, 'project'),
      projectId: item.id,
    }));

  return [...projectItems, ...globalItems, ...workspaceItems, ...allProjectItems];
});

const orderedItems = computed<PaletteItem[]>(() => {
  const parsed = parsedQuery.value;
  const candidates = items.value.filter((item) => parsed.mode === 'all' || item.mode === parsed.mode);
  if (parsed.value) {
    return candidates
      .map((item) => ({ item, score: paletteFuzzyScore(item.searchText, parsed.value) }))
      .filter(({ score }) => score >= 0)
      .sort((left, right) => right.score - left.score || left.item.label.localeCompare(right.item.label))
      .map(({ item }) => item);
  }

  const recent = recentIds.value
    .map((id) => candidates.find((item) => item.id === id))
    .filter((item): item is PaletteItem => Boolean(item));
  const recentSet = new Set(recent.map((item) => item.id));
  return [...recent, ...candidates.filter((item) => !recentSet.has(item.id))];
});

const groupViews = computed<PaletteGroupView[]>(() => {
  const parsed = parsedQuery.value;
  const recentSet = !parsed.value
    ? new Set(recentIds.value.filter((id) => orderedItems.value.some((item) => item.id === id)))
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
    for (const script of scriptCatalog.value?.items.filter((item) => item.enabled) ?? []) {
      actions.push(actionItem(`${project.id}:script-${script.id}`, script.name, script.description || script.command, CommandLineIcon, script.risk === 'read-only' ? 'reversivel' : 'atencao', { type: 'script-start', script }));
    }
  }
  return [...areas, ...actions, ...shortcuts];
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

function actionItem(id: string, label: string, description: string, icon: Component, risk: ActionRisk, operation: ActionOperation, aliases = ''): ActionPaletteItem {
  return { id, group: 'Comandos do projeto', label, description, icon, risk, operation, mode: 'action', kind: 'action', searchText: normalizePaletteText(`${label} ${description} ${aliases}`) };
}

function readRecents(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 6) : [];
  } catch {
    return [];
  }
}

function remember(item: PaletteItem): void {
  recentIds.value = [item.id, ...recentIds.value.filter((id) => id !== item.id)].slice(0, 6);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recentIds.value));
}

function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function show(): void {
  if (open.value) return;
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  open.value = true;
  query.value = '';
  activeIndex.value = 0;
  feedback.value = '';
  pendingActionId.value = undefined;
  void loadProjectActions(selectedProject.value);
  void nextTick(() => searchInput.value?.focus());
}

async function loadProjectActions(project = selectedProject.value): Promise<void> {
  projectProcess.value = undefined;
  testProcess.value = undefined;
  testOverview.value = undefined;
  scriptCatalog.value = undefined;
  loadedProjectId.value = undefined;
  loadingActions.value = false;
  if (!project) return;
  loadingActions.value = true;
  const projectId = project.id;
  const requests: Promise<void>[] = [];
  if (project.capabilities.includes('server')) requests.push(fetchProjectProcess(projectId).then((value) => { if (isSelectedProject(projectId)) projectProcess.value = value; }));
  if (project.capabilities.includes('tests')) requests.push(Promise.all([fetchProjectTests(projectId), fetchProjectTestProcess(projectId)]).then(([overview, process]) => { if (isSelectedProject(projectId)) { testOverview.value = overview; testProcess.value = process; } }));
  if (project.capabilities.includes('scripts')) {
    const parameters = new URLSearchParams({ page: '1', pageSize: '100' });
    requests.push(fetchProjectScripts(projectId, parameters).then((value) => { if (isSelectedProject(projectId)) scriptCatalog.value = value; }));
  }
  const results = await Promise.allSettled(requests);
  if (open.value && requests.length && results.every((result) => result.status === 'rejected')) feedback.value = 'Não foi possível consultar as ações autorizadas.';
  if (isSelectedProject(projectId)) {
    loadedProjectId.value = projectId;
    loadingActions.value = false;
  }
}

function isSelectedProject(projectId: string): boolean {
  return open.value && selectedProject.value?.id === projectId;
}

function close(): void {
  if (!open.value) return;
  open.value = false;
  void nextTick(() => previousFocus?.focus());
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.key.toLocaleLowerCase() !== 'k' || (!event.metaKey && !event.ctrlKey)) return;
  if (isTextEntry(event.target)) return;
  event.preventDefault();
  show();
}

function handleSearchKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') { event.preventDefault(); close(); return; }
  if (event.key === 'Tab' && !event.shiftKey) {
    if (completeActiveItem()) {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }
  if (event.key === '>' && parsedQuery.value.mode === 'project') {
    if (completeActiveProject()) {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const count = orderedItems.value.length;
    if (count) activeIndex.value = (activeIndex.value + direction + count) % count;
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const item = orderedItems.value[activeIndex.value];
    if (item) void select(item);
  }
}

function handleDialogKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented) return;
  if (event.key !== 'Tab') return;
  const focusable = [...(dialog.value?.querySelectorAll<HTMLElement>('input, button:not([disabled])') ?? [])];
  if (!focusable.length) return;
  const index = focusable.indexOf(document.activeElement as HTMLElement);
  if (event.shiftKey && index <= 0) { event.preventDefault(); focusable.at(-1)?.focus(); }
  else if (!event.shiftKey && index === focusable.length - 1) { event.preventDefault(); focusable[0]?.focus(); }
}

function completeActiveProject(): boolean {
  const item = orderedItems.value[activeIndex.value];
  if (item?.kind !== 'navigation' || !item.projectId) return false;
  const project = props.projects.find((entry) => entry.id === item.projectId);
  if (!project) return false;
  query.value = `@${project.name} > `;
  activeIndex.value = 0;
  pendingActionId.value = undefined;
  feedback.value = '';
  return true;
}

function completeActiveItem(): boolean {
  if (parsedQuery.value.mode === 'project') return completeActiveProject();
  if (parsedQuery.value.mode !== 'action' || !selectedProject.value) return false;
  const item = orderedItems.value[activeIndex.value];
  if (!item) return false;
  query.value = `@${selectedProject.value.name} > ${item.label}`;
  activeIndex.value = 0;
  pendingActionId.value = undefined;
  feedback.value = '';
  return true;
}

function handleQuery(): void {
  activeIndex.value = 0;
  pendingActionId.value = undefined;
}

async function select(item: PaletteItem): Promise<void> {
  if (item.kind === 'navigation') {
    remember(item);
    close();
    if (item.workspaceId) await dashboardStore.switchWorkspace(item.workspaceId);
    await router.push(item.to);
    return;
  }
  if (pendingActionId.value !== item.id) {
    pendingActionId.value = item.id;
    feedback.value = `Pressione Enter novamente para ${item.label.toLocaleLowerCase('pt-BR')}.`;
    return;
  }
  const project = selectedProject.value;
  if (!project || executingAction.value) return;
  executingAction.value = true;
  feedback.value = '';
  try {
    await executeAction(project.id, item.operation);
    remember(item);
    pendingActionId.value = undefined;
    query.value = parsedQuery.value.project !== undefined ? `@${project.name} > ` : '';
    activeIndex.value = 0;
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : 'Não foi possível executar a ação.';
  } finally {
    executingAction.value = false;
  }
}

async function executeAction(projectId: string, operation: ActionOperation): Promise<void> {
  if (operation.type === 'server-start') {
    const settings = await fetchProjectServerSettings(projectId);
    projectProcess.value = await startProjectProcess(projectId, { port: settings.port ?? null });
    feedback.value = 'Servidor iniciado com sucesso.';
  } else if (operation.type === 'server-stop') {
    projectProcess.value = await stopProjectProcess(projectId);
    feedback.value = 'Servidor interrompido com sucesso.';
  } else if (operation.type === 'test-start') {
    testProcess.value = await startProjectTest(projectId, operation.commandId);
    feedback.value = 'Testes iniciados com sucesso.';
  } else if (operation.type === 'test-stop') {
    testProcess.value = await stopProjectTest(projectId);
    feedback.value = 'Execução de testes interrompida.';
  } else {
    const token = operation.script.risk === 'read-only' ? undefined : (await prepareScriptExecution(projectId, operation.script.id)).token;
    await startScriptExecution(projectId, operation.script.id, token);
    feedback.value = `Script “${operation.script.name}” iniciado.`;
  }
}

function itemIndex(item: PaletteItem): number {
  return orderedItems.value.findIndex((entry) => entry.id === item.id);
}

function itemHint(item: PaletteItem): string {
  if (pendingActionId.value === item.id) return 'Confirmar';
  if (parsedQuery.value.mode === 'project' && item.kind === 'navigation' && item.projectId) return 'Tab para usar';
  if (parsedQuery.value.mode === 'action') return item.kind === 'action' && item.risk === 'atencao' ? 'Ação sensível' : 'Tab completa';
  if (item.kind === 'navigation') return item.hint ?? 'Abrir';
  return item.risk === 'atencao' ? 'Ação sensível' : 'Executar';
}

watch(activeIndex, () => nextTick(() => {
  const active = dialog.value?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
  active?.scrollIntoView?.({ block: 'nearest' });
}));
watch(() => selectedProject.value?.id, (projectId, previousProjectId) => {
  if (!open.value || parsedQuery.value.project === undefined || projectId === previousProjectId) return;
  void loadProjectActions(selectedProject.value);
});
onMounted(() => window.addEventListener('keydown', handleGlobalKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', handleGlobalKeydown));

defineExpose({ show });
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="command-palette-backdrop" @mousedown.self="close">
      <section ref="dialog" class="command-palette" role="dialog" aria-modal="true" aria-label="Central de comandos" @keydown="handleDialogKeydown">
        <header class="command-palette-header">
          <label class="command-palette-search">
            <MagnifyingGlassIcon aria-hidden="true" />
            <input ref="searchInput" v-model="query" type="search" placeholder="Buscar ou executar um comando..." aria-label="Buscar ou executar um comando" @input="handleQuery" @keydown="handleSearchKeydown">
            <kbd>Esc</kbd>
          </label>
          <p><kbd>&gt;</kbd> ações <span>·</span> <kbd>/</kbd> páginas <span>·</span> <kbd>@</kbd> projetos</p>
        </header>

        <div v-if="parsedQuery.project !== undefined" class="command-palette-context" :class="{ 'command-palette-context-invalid': !selectedProject }">
          <FolderIcon aria-hidden="true" />
          <span>Projeto</span>
          <strong>{{ selectedProject?.name ?? parsedQuery.project }}</strong>
          <small>{{ selectedProject ? 'Comandos e ferramentas deste projeto' : 'Projeto não encontrado' }}</small>
        </div>

        <div v-if="orderedItems.length" class="command-palette-list" role="listbox">
          <section v-for="group in groupViews" :key="group.name" class="command-palette-group">
            <h3>{{ group.name }}</h3>
            <ul>
              <li v-for="item in group.items" :key="item.id" role="option" :aria-selected="itemIndex(item) === activeIndex">
                <button type="button" class="command-palette-item" :class="{ 'command-palette-item-active': itemIndex(item) === activeIndex }" :disabled="executingAction" @mouseenter="activeIndex = itemIndex(item)" @click="select(item)">
                  <span class="command-palette-icon"><component :is="item.icon" aria-hidden="true" /></span>
                  <span class="command-palette-copy"><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span>
                  <span class="command-palette-item-kind" :class="item.kind === 'action' ? `command-palette-risk-${item.risk}` : ''">
                    <ShieldCheckIcon v-if="item.kind === 'action' && item.risk === 'atencao'" aria-hidden="true" />
                    {{ itemHint(item) }}
                  </span>
                </button>
              </li>
            </ul>
          </section>
        </div>

        <p v-else class="command-palette-empty">Nenhum comando encontrado. Tente outro termo ou prefixo.</p>
        <p v-if="feedback" class="command-palette-feedback" role="status">{{ feedback }}</p>
        <footer><span>{{ loadingActions ? 'Consultando ações autorizadas…' : 'Catálogo seguro do projeto' }}</span><span><kbd>↑</kbd><kbd>↓</kbd> navegar <kbd>Tab</kbd> autocompletar <kbd>Enter</kbd> selecionar</span></footer>
      </section>
    </div>
  </Teleport>
</template>
