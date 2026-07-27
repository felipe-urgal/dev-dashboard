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

const props = defineProps<{
  projects: Project[];
  workspaces: Workspace[];
}>();

interface PaletteItem {
  id: string;
  group: 'Páginas' | 'Workspaces' | 'Projetos' | 'Projeto atual';
  label: string;
  description: string;
  searchText: string;
  to: RouteLocationRaw;
}

const route = useRoute();
const router = useRouter();
const open = ref(false);
const query = ref('');
const activeIndex = ref(0);
const searchInput = ref<HTMLInputElement>();
let previousFocus: HTMLElement | null = null;

const currentProject = computed(() => {
  const value = route.params.projectId;
  const projectId = Array.isArray(value) ? value[0] : value;
  return props.projects.find((project) => project.id === projectId);
});

const items = computed<PaletteItem[]>(() => {
  const globalItems: PaletteItem[] = [
    navigationItem('pagina-visao-geral', 'Páginas', 'Visão geral', 'Dashboard e repositórios', { name: 'dashboard', hash: '#overview' }),
    navigationItem('pagina-atividade', 'Páginas', 'Atividade', 'Histórico unificado', { name: 'activity' }),
    navigationItem('pagina-processos', 'Páginas', 'Processos', 'Processos gerenciados', { name: 'processes' }),
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
  const projectAreaItems = project
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

  return [...globalItems, ...projectAreaItems, ...workspaceItems, ...projectItems];
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
  group: PaletteItem['group'],
  label: string,
  description: string,
  to: RouteLocationRaw,
): PaletteItem {
  return { id, group, label, description, to, searchText: normalize(`${label} ${description}`) };
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

function handleQuery(): void {
  activeIndex.value = 0;
}

async function select(item: PaletteItem): Promise<void> {
  close();
  await router.push(item.to);
}

onMounted(() => window.addEventListener('keydown', handleGlobalKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', handleGlobalKeydown));

defineExpose({ show });
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="command-palette-backdrop" @mousedown.self="close">
      <section class="command-palette" role="dialog" aria-modal="true" aria-label="Navegação rápida">
        <label class="command-palette-search">
          <span aria-hidden="true">⌕</span>
          <input
            ref="searchInput"
            v-model="query"
            type="search"
            placeholder="Buscar página, workspace ou projeto"
            aria-label="Buscar navegação"
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
              @mouseenter="activeIndex = index"
              @click="select(item)"
            >
              <span class="command-palette-item-group">{{ item.group }}</span>
              <strong>{{ item.label }}</strong>
              <small>{{ item.description }}</small>
            </button>
          </li>
        </ul>

        <p v-else class="command-palette-empty">Nenhum destino encontrado.</p>
        <footer>Use ↑ ↓ para navegar e Enter para abrir.</footer>
      </section>
    </div>
  </Teleport>
</template>
