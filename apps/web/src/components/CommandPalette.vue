<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import {
  useRoute,
  useRouter,
} from 'vue-router';
import type {
  Project,
  Workspace,
} from '@dev-dashboard/contracts';
import { MagnifyingGlassIcon, ShieldCheckIcon } from '@heroicons/vue/24/outline';
import { useAutoDismiss } from '../composables/useAutoDismiss';
import { useCommandPaletteItems, type PaletteItem } from '../composables/useCommandPaletteItems';
import { useCommandPaletteProjectActions } from '../composables/useCommandPaletteProjectActions';
import { dashboardStore } from '../stores/dashboard';
import { normalizePaletteText, paletteFuzzyScore, parsePaletteQuery } from '../utils/command-palette';

const props = defineProps<{
  projects: Project[];
  workspaces: Workspace[];
}>();

const RECENTS_KEY = 'dev-dashboard:command-palette:recent-items';
const route = useRoute();
const router = useRouter();
const open = ref(false);
const query = ref('');
const activeIndex = ref(0);
const searchInput = ref<HTMLInputElement>();
const dialog = ref<HTMLElement>();
const executingAction = ref(false);
const pendingActionId = ref<string>();
const feedback = ref('');
const recentIds = ref<string[]>(readRecents());

useAutoDismiss(feedback, '');
let previousFocus: HTMLElement | null = null;

const {
  projectProcess,
  testProcess,
  testOverview,
  scriptCatalog,
  loadedProjectId,
  loadingActions,
  loadProjectActions,
  executeAction,
} = useCommandPaletteProjectActions({
  isOpen: () => open.value,
  getSelectedProject: () => selectedProject.value,
});

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


const { items, orderedItems, groupViews } = useCommandPaletteItems({
  projects: () => props.projects,
  workspaces: () => props.workspaces,
  selectedProject: () => selectedProject.value,
  parsedQuery: () => parsedQuery.value,
  recentIds,
  loadedProjectId,
  projectProcess,
  testProcess,
  testOverview,
  scriptCatalog,
});

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
  void loadProjectActions(selectedProject.value).then((result) => {
    if (result.feedback) feedback.value = result.feedback;
  });
  void nextTick(() => searchInput.value?.focus());
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
    feedback.value = await executeAction(project.id, item.operation);
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
  void loadProjectActions(selectedProject.value).then((result) => {
    if (result.feedback) feedback.value = result.feedback;
  });
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
