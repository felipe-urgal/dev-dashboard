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
import { NModal } from 'naive-ui';
import { useRouter } from 'vue-router';
import type { Project, Workspace } from '@dev-dashboard/contracts';
import {
  AdjustmentsHorizontalIcon,
  BeakerIcon,
  CircleStackIcon,
  CodeBracketIcon,
  CubeIcon,
  DocumentTextIcon,
  FolderIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  PlayCircleIcon,
  RocketLaunchIcon,
  ServerStackIcon,
  ShieldCheckIcon,
} from '@heroicons/vue/24/outline';

import {
  buildCommandPaletteNavigationItems,
  filterCommandPaletteNavigationItems,
  type CommandPaletteNavigationGroup,
  type CommandPaletteNavigationIcon,
  type CommandPaletteNavigationItem,
} from '../command-palette-navigation';
import { dashboardStore } from '../stores/dashboard';
import { parsePaletteQuery } from '../utils/command-palette';

const props = defineProps<{
  projects: Project[];
  workspaces: Workspace[];
}>();

const RECENTS_KEY = 'dev-dashboard:command-palette:recent-navigation';
const router = useRouter();
const open = ref(false);
const query = ref('');
const activeIndex = ref(0);
const searchInput = ref<HTMLInputElement>();
const dialog = ref<HTMLElement>();
const recentIds = ref<string[]>(readRecents());
let previousFocus: HTMLElement | null = null;

const iconByName: Record<CommandPaletteNavigationIcon, Component> = {
  home: HomeIcon,
  processes: PlayCircleIcon,
  production: RocketLaunchIcon,
  database: CircleStackIcon,
  workspace: FolderIcon,
  project: FolderIcon,
  server: ServerStackIcon,
  git: CodeBracketIcon,
  tests: BeakerIcon,
  dependencies: CubeIcon,
  environment: AdjustmentsHorizontalIcon,
  doctor: ShieldCheckIcon,
  readme: DocumentTextIcon,
};

const parsedQuery = computed(() => parsePaletteQuery(query.value));
const catalog = computed(() =>
  buildCommandPaletteNavigationItems(props.projects, props.workspaces),
);
const filteredItems = computed(() =>
  filterCommandPaletteNavigationItems(catalog.value, parsedQuery.value),
);
const orderedItems = computed(() => {
  if (parsedQuery.value.value || parsedQuery.value.mode !== 'all') {
    return filteredItems.value;
  }

  const recent = recentIds.value
    .map((id) => filteredItems.value.find((item) => item.id === id))
    .filter((item): item is CommandPaletteNavigationItem => Boolean(item));
  const recentSet = new Set(recent.map((item) => item.id));
  return [
    ...recent,
    ...filteredItems.value.filter((item) => !recentSet.has(item.id)),
  ];
});
const groupViews = computed(() => {
  const recentSet =
    parsedQuery.value.mode === 'all' && !parsedQuery.value.value
      ? new Set(recentIds.value)
      : new Set<string>();
  const groups: Array<{
    name: CommandPaletteNavigationGroup | 'Recentes';
    items: CommandPaletteNavigationItem[];
  }> = [];

  for (const item of orderedItems.value) {
    const name = recentSet.has(item.id) ? 'Recentes' : item.group;
    let group = groups.find((entry) => entry.name === name);
    if (!group) {
      group = { name, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }

  return groups;
});

function readRecents(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]');
    return Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === 'string')
          .slice(0, 6)
      : [];
  } catch {
    return [];
  }
}

function remember(item: CommandPaletteNavigationItem): void {
  recentIds.value = [
    item.id,
    ...recentIds.value.filter((id) => id !== item.id),
  ].slice(0, 6);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recentIds.value));
}

function show(): void {
  if (open.value) return;
  previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
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

function toggle(): void {
  if (open.value) close();
  else show();
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (
    event.repeat ||
    event.key.toLocaleLowerCase() !== 'k' ||
    (!event.metaKey && !event.ctrlKey)
  ) {
    return;
  }

  event.preventDefault();
  toggle();
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
    const count = orderedItems.value.length;
    if (count) {
      activeIndex.value = (activeIndex.value + direction + count) % count;
    }
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    const item = orderedItems.value[activeIndex.value];
    if (item) void select(item);
  }
}

function handleDialogKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.key !== 'Tab') return;

  const focusable = [
    ...(dialog.value?.querySelectorAll<HTMLElement>(
      'input, button:not([disabled])',
    ) ?? []),
  ];
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

async function select(item: CommandPaletteNavigationItem): Promise<void> {
  remember(item);
  close();

  if (
    item.workspaceId &&
    item.workspaceId !== dashboardStore.selectedWorkspaceId.value
  ) {
    await dashboardStore.switchWorkspace(item.workspaceId);
  }

  await router.push(item.to);
}

function itemIndex(item: CommandPaletteNavigationItem): number {
  return orderedItems.value.findIndex((entry) => entry.id === item.id);
}

function handleQuery(): void {
  activeIndex.value = 0;
}

watch(activeIndex, () =>
  nextTick(() => {
    const active = dialog.value?.querySelector<HTMLElement>(
      '[role="option"][aria-selected="true"]',
    );
    active?.scrollIntoView?.({ block: 'nearest' });
  }),
);
watch(orderedItems, (items) => {
  if (!items.length) activeIndex.value = 0;
  else if (activeIndex.value >= items.length) activeIndex.value = items.length - 1;
});

onMounted(() => window.addEventListener('keydown', handleGlobalKeydown));
onBeforeUnmount(() =>
  window.removeEventListener('keydown', handleGlobalKeydown),
);

defineExpose({ show, close });
</script>

<template>
  <NModal
    :show="open"
    preset="card"
    :mask-closable="true"
    :close-on-esc="false"
    :auto-focus="false"
    :return-focus="false"
    :trap-focus="false"
    style="width: min(720px, calc(100vw - 32px))"
    @update:show="(show) => !show && close()"
  >
    <section
      ref="dialog"
      class="command-palette"
      role="dialog"
      aria-modal="true"
      aria-label="Paleta de navegação"
      @keydown="handleDialogKeydown"
    >
      <header class="command-palette-header">
        <label class="command-palette-search">
          <MagnifyingGlassIcon aria-hidden="true" />
          <input
            ref="searchInput"
            v-model="query"
            type="search"
            placeholder="Buscar projetos ou ferramentas..."
            aria-label="Buscar projetos ou ferramentas"
            @input="handleQuery"
            @keydown="handleSearchKeydown"
          />
          <kbd>Esc</kbd>
        </label>
        <p>
          <kbd>/</kbd> páginas <span>·</span> <kbd>@</kbd> projetos
          <span>·</span> somente navegação
        </p>
      </header>

      <div
        v-if="orderedItems.length"
        class="command-palette-list"
        role="listbox"
        aria-label="Destinos disponíveis"
      >
        <section
          v-for="group in groupViews"
          :key="group.name"
          class="command-palette-group"
        >
          <h3>{{ group.name }}</h3>
          <ul>
            <li
              v-for="item in group.items"
              :key="item.id"
              role="option"
              :aria-selected="itemIndex(item) === activeIndex"
            >
              <button
                type="button"
                class="command-palette-item"
                :class="{
                  'command-palette-item-active':
                    itemIndex(item) === activeIndex,
                }"
                @mouseenter="activeIndex = itemIndex(item)"
                @click="select(item)"
              >
                <span class="command-palette-icon">
                  <component :is="iconByName[item.icon]" aria-hidden="true" />
                </span>
                <span class="command-palette-copy">
                  <strong>{{ item.label }}</strong>
                  <small>{{ item.description }}</small>
                </span>
                <span class="command-palette-item-kind">Abrir</span>
              </button>
            </li>
          </ul>
        </section>
      </div>

      <p v-else class="command-palette-empty">
        Nenhum destino encontrado. Tente outro termo ou prefixo.
      </p>

      <footer>
        <span>Navegação global segura</span>
        <span><kbd>↑</kbd><kbd>↓</kbd> navegar <kbd>Enter</kbd> abrir</span>
      </footer>
    </section>
  </NModal>
</template>