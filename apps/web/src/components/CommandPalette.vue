<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
} from 'vue';
import {
  useRoute,
  useRouter,
  type RouteLocationRaw,
} from 'vue-router';
import type { Project, Workspace } from '@dev-dashboard/contracts';
import {
  fetchProjectProcess,
  fetchProjectServerSettings,
  startProjectProcess,
  stopProjectProcess,
} from '../api';
import {
  projectCommandActions,
  type ProjectCommandAction,
} from '../utils/project-command-actions';

const props = defineProps<{
  projects: Project[];
  workspaces: Workspace[];
}>();

interface NavigationPaletteItem {
  id: string;
  group: 'Páginas' | 'Workspaces' | 'Projetos' | 'Projeto atual';
  label: string;
  description: string;
  searchText: string;
  to: RouteLocationRaw;
  kind: 'navigation';
}

interface ActionPaletteItem extends ProjectCommandAction {
  group: 'Ações do projeto';
  searchText: string;
  kind: 'action';
}

type PaletteItem = NavigationPaletteItem | ActionPaletteItem;

const route = useRoute();
const router = useRouter();
const open = ref(false);
const query = ref('');
const activeIndex = ref(0);
const searchInput = ref<HTMLInputElement>();
const dialog = ref<HTMLElement>();
const projectProcess = ref<Awaited<ReturnType<typeof fetchProjectProcess>> | undefined>();
const loadingActions = ref(false);
const executingAction = ref(false);
const pendingActionId = ref<string>();
const feedback = ref('');
let previousFocus: HTMLElement | null = null;

const currentProject = computed(() => {
  const value = route.params.projectId;
  const projectId = Array.isArray(value) ? value[0] : value;
  return props.projects.find((project) => project.id === projectId);
});

const items = computed<PaletteItem[]>(() => {
  const globalItems: NavigationPaletteItem[] = [
    navigationItem('pagina-visao-geral', 'Páginas', 'Visão geral', 'Dashboard e repositórios', { name: 'dashboard', hash: '#overview' }),
    navigationItem('pagina-atividade', 'Páginas', 'Atividade', 'Histórico unificado', { name: 'activity' }),
    navigationItem('pagina-processos', 'Páginas', 'Processos', 'Processos gerenciados', { name: 'processes' }),
    navigationItem('pagina-configuracoes', 'Páginas', 'Configurações', 'Retenção local', { name: 'settings' }),
  ];

  const workspaceItems = props.workspaces.map((workspace) =>
    navigationItem(
      `workspace-${workspace.id}`,
      'Workspaces',
      workspace.name,
      workspace.path,
      { name: 'dashboard', hash: '#repositories' },
    ),
  );

  const projectItems = [...props.projects]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((project) =>
      navigationItem(
        `project-${project.id}`,
        'Projetos',
        project.name,
        project.path,
        { name: 'project-details', params: { projectId: project.id } },
      ),
    );

  const project = currentProject.value;
  const projectAreaItems: NavigationPaletteItem[] = project
    ? [
        ['Visão geral do projeto', 'project-details'],
        ['Git', 'project-git'],
        ['Testes', 'project-tests'],
        ['Banco de dados', 'project-database'],
        ['Scripts', 'project-scripts'],
      ].map(([label, routeName]) =>
        navigationItem(
          `area-${routeName}`,
          'Projeto atual',
          label!,
          project.name,
          { name: routeName!, params: { projectId: project.id } },
        ),
      )
    : [];

  const actionItems: ActionPaletteItem[] = project && projectProcess.value !== undefined
    ? projectCommandActions(project, projectProcess.value).map((action) => ({
        ...action,
        group: 'Ações do projeto',
        kind: 'action',
        searchText: normalize(`${action.label} ${action.description}`),
      }))
    : [];

  return [...globalItems, ...projectAreaItems, ...actionItems, ...workspaceItems, ...projectItems];
});

const filteredItems = computed(() => {
  const normalizedQuery = normalize(query.value);
  if (!normalizedQuery) return items.value;
  return items.value.filter((item) => item.searchText.includes(normalizedQuery));
});

function normalize(value: string): string {
  return value.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function navigationItem(
  id: string,
  group: NavigationPaletteItem['group'],
  label: string,
  description: string,
  to: RouteLocationRaw,
): NavigationPaletteItem {
  return { id, group, label, description, to, kind: 'navigation', searchText: normalize(`${label} ${description}`) };
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
  void loadProjectActions();
  void nextTick(() => searchInput.value?.focus());
}

async function loadProjectActions(): Promise<void> {
  const project = currentProject.value;
  projectProcess.value = undefined;
  if (!project?.capabilities.includes('server')) return;
  const projectId = project.id;
  loadingActions.value = true;
  try {
    const process = await fetchProjectProcess(projectId);
    if (open.value && currentProject.value?.id === projectId) projectProcess.value = process;
  } catch (error) {
    if (open.value) feedback.value = error instanceof Error ? error.message : 'Não foi possível consultar as ações.';
  } finally {
    if (currentProject.value?.id === projectId) loadingActions.value = false;
  }
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
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const count = filteredItems.value.length;
    if (count) activeIndex.value = (activeIndex.value + direction + count) % count;
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    const item = filteredItems.value[activeIndex.value];
    if (item) void select(item);
  }
}

function handleDialogKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Tab') return;
  const focusable = [...(dialog.value?.querySelectorAll<HTMLElement>('input, button:not([disabled])') ?? [])];
  if (!focusable.length) return;
  const index = focusable.indexOf(document.activeElement as HTMLElement);
  if (event.shiftKey && index <= 0) {
    event.preventDefault();
    focusable.at(-1)?.focus();
  } else if (!event.shiftKey && index === focusable.length - 1) {
    event.preventDefault();
    focusable[0]?.focus();
  }
}

function handleQuery(): void {
  activeIndex.value = 0;
}

async function select(item: PaletteItem): Promise<void> {
  if (item.kind === 'navigation') {
    close();
    await router.push(item.to);
    return;
  }

  if (pendingActionId.value !== item.id) {
    pendingActionId.value = item.id;
    feedback.value = `Confirme para ${item.label.toLocaleLowerCase('pt-BR')}.`;
    return;
  }

  const project = currentProject.value;
  if (!project || executingAction.value) return;
  executingAction.value = true;
  feedback.value = '';
  try {
    if (item.id === 'server-start') {
      const settings = await fetchProjectServerSettings(project.id);
      projectProcess.value = await startProjectProcess(project.id, { port: settings.port ?? null });
      feedback.value = 'Servidor iniciado com sucesso.';
    } else {
      projectProcess.value = await stopProjectProcess(project.id);
      feedback.value = 'Servidor interrompido com sucesso.';
    }
    pendingActionId.value = undefined;
    query.value = '';
    activeIndex.value = 0;
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : 'Não foi possível executar a ação.';
  } finally {
    executingAction.value = false;
  }
}

onMounted(() => window.addEventListener('keydown', handleGlobalKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', handleGlobalKeydown));

defineExpose({ show });
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="command-palette-backdrop" @mousedown.self="close">
      <section ref="dialog" class="command-palette" role="dialog" aria-modal="true" aria-label="Navegação e ações rápidas" @keydown="handleDialogKeydown">
        <label class="command-palette-search">
          <span aria-hidden="true">⌕</span>
          <input
            ref="searchInput"
            v-model="query"
            type="search"
            placeholder="Buscar destino ou ação"
            aria-label="Buscar destino ou ação"
            @input="handleQuery"
            @keydown="handleSearchKeydown"
          >
          <kbd>Esc</kbd>
        </label>

        <ul v-if="filteredItems.length" class="command-palette-list" role="listbox">
          <li v-for="(item, index) in filteredItems" :key="item.id" role="option" :aria-selected="index === activeIndex">
            <button
              type="button"
              class="command-palette-item"
              :class="{ 'command-palette-item-active': index === activeIndex }"
              :disabled="executingAction"
              @mouseenter="activeIndex = index"
              @click="select(item)"
            >
              <span class="command-palette-item-group">{{ item.group }}</span>
              <strong>{{ item.label }}</strong>
              <small>{{ item.description }}</small>
              <span v-if="item.kind === 'navigation'" class="command-palette-item-kind">Abrir</span>
              <span v-else class="command-palette-item-kind" :class="`command-palette-risk-${item.risk}`">
                {{ pendingActionId === item.id ? 'Confirmar ação' : item.risk === 'atencao' ? 'Ação · atenção' : 'Ação reversível' }}
              </span>
            </button>
          </li>
        </ul>

        <p v-else class="command-palette-empty">Nenhum destino ou ação encontrado.</p>
        <p v-if="feedback" class="command-palette-feedback" role="status">{{ feedback }}</p>
        <footer>{{ loadingActions ? 'Consultando ações autorizadas…' : 'Use ↑ ↓ para navegar e Enter para selecionar.' }}</footer>
      </section>
    </div>
  </Teleport>
</template>
