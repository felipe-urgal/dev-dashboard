<script setup lang="ts">
import {
  ChevronDownIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  FolderIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import type * as Monaco from 'monaco-editor';

import type {
  Project,
  ProjectFileContent,
  ProjectFileEntry,
  ProjectFileSearchMatch,
} from '@dev-dashboard/contracts';

import {
  fetchProjectDirectory,
  fetchProjectFileContent,
  searchProjectFiles,
} from '../api';
import { configureMonacoEnvironment } from '../monaco-environment';
import ProjectEditorLauncher from './ProjectEditorLauncher.vue';

interface FlatTreeEntry {
  entry: ProjectFileEntry;
  depth: number;
}

const props = defineProps<{ project: Project }>();

const editorHost = ref<HTMLElement | null>(null);
const directoryEntries = ref(new Map<string, ProjectFileEntry[]>());
const loadedDirectories = ref(new Set<string>());
const expandedDirectories = ref(new Set<string>());
const openFiles = ref<ProjectFileContent[]>([]);
const activePath = ref('');
const fallbackContent = ref('');
const loadingTree = ref(true);
const loadingFile = ref(false);
const loadingMonaco = ref(true);
const searching = ref(false);
const errorMessage = ref('');
const searchQuery = ref('');
const searchResults = ref<ProjectFileSearchMatch[]>([]);
const searchTruncated = ref(false);

let monaco: typeof Monaco | undefined;
let editor: Monaco.editor.IStandaloneCodeEditor | undefined;
let themeObserver: MutationObserver | undefined;
const models = new Map<string, Monaco.editor.ITextModel>();

const activeFile = computed(() =>
  openFiles.value.find((file) => file.path === activePath.value),
);

const flatTree = computed<FlatTreeEntry[]>(() => {
  const items: FlatTreeEntry[] = [];

  function append(parent: string, depth: number): void {
    for (const entry of directoryEntries.value.get(parent) ?? []) {
      items.push({ entry, depth });
      if (
        entry.kind === 'directory'
        && expandedDirectories.value.has(entry.path)
      ) {
        append(entry.path, depth + 1);
      }
    }
  }

  append('', 0);
  return items;
});

function readableError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function replaceSet(
  source: Set<string>,
  value: string,
  enabled: boolean,
): Set<string> {
  const next = new Set(source);
  if (enabled) next.add(value);
  else next.delete(value);
  return next;
}

async function loadDirectory(relativePath: string): Promise<void> {
  if (loadedDirectories.value.has(relativePath)) return;
  try {
    const listing = await fetchProjectDirectory(props.project.id, relativePath);
    const next = new Map(directoryEntries.value);
    next.set(relativePath, listing.entries);
    directoryEntries.value = next;
    loadedDirectories.value = replaceSet(
      loadedDirectories.value,
      relativePath,
      true,
    );
  } catch (error) {
    errorMessage.value = readableError(
      error,
      'Não foi possível carregar os arquivos do projeto.',
    );
  }
}

async function toggleDirectory(entry: ProjectFileEntry): Promise<void> {
  const opening = !expandedDirectories.value.has(entry.path);
  expandedDirectories.value = replaceSet(
    expandedDirectories.value,
    entry.path,
    opening,
  );
  if (opening) await loadDirectory(entry.path);
}

function modelUri(filePath: string): Monaco.Uri {
  const encodedPath = filePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return monaco!.Uri.parse(
    `file:///dev-dashboard/projects/${encodeURIComponent(props.project.id)}/${encodedPath}`,
  );
}

function themeName(): 'vs' | 'vs-dark' {
  return document.documentElement.dataset.theme === 'light' ? 'vs' : 'vs-dark';
}

function modelFor(file: ProjectFileContent): Monaco.editor.ITextModel | undefined {
  if (!monaco) return undefined;
  const existing = models.get(file.path);
  if (existing) return existing;
  const model = monaco.editor.createModel(
    file.content,
    file.language,
    modelUri(file.path),
  );
  models.set(file.path, model);
  return model;
}

function displayFile(
  file: ProjectFileContent,
  position?: { line: number; column: number },
): void {
  activePath.value = file.path;
  fallbackContent.value = file.content;
  const model = modelFor(file);
  if (!editor || !model) return;
  editor.setModel(model);
  if (position) {
    editor.setPosition({
      lineNumber: position.line,
      column: position.column,
    });
    editor.revealPositionInCenter({
      lineNumber: position.line,
      column: position.column,
    });
    editor.focus();
  }
}

async function openFile(
  filePath: string,
  position?: { line: number; column: number },
): Promise<void> {
  errorMessage.value = '';
  const opened = openFiles.value.find((file) => file.path === filePath);
  if (opened) {
    displayFile(opened, position);
    return;
  }

  loadingFile.value = true;
  try {
    const file = await fetchProjectFileContent(props.project.id, filePath);
    openFiles.value = [...openFiles.value, file];
    displayFile(file, position);
  } catch (error) {
    errorMessage.value = readableError(
      error,
      'Não foi possível abrir o arquivo.',
    );
  } finally {
    loadingFile.value = false;
  }
}

function closeFile(filePath: string): void {
  const index = openFiles.value.findIndex((file) => file.path === filePath);
  openFiles.value = openFiles.value.filter((file) => file.path !== filePath);
  models.get(filePath)?.dispose();
  models.delete(filePath);

  if (activePath.value !== filePath) return;
  const next = openFiles.value[Math.max(0, index - 1)] ?? openFiles.value[0];
  activePath.value = next?.path ?? '';
  fallbackContent.value = next?.content ?? '';
  editor?.setModel(next ? modelFor(next) ?? null : null);
}

async function submitSearch(): Promise<void> {
  const query = searchQuery.value.trim();
  if (query.length < 2 || searching.value) return;
  searching.value = true;
  errorMessage.value = '';
  try {
    const result = await searchProjectFiles(props.project.id, query);
    searchResults.value = result.items;
    searchTruncated.value = result.truncated;
  } catch (error) {
    searchResults.value = [];
    searchTruncated.value = false;
    errorMessage.value = readableError(
      error,
      'Não foi possível buscar nos arquivos.',
    );
  } finally {
    searching.value = false;
  }
}

function clearSearch(): void {
  searchQuery.value = '';
  searchResults.value = [];
  searchTruncated.value = false;
}

async function initializeMonaco(): Promise<void> {
  loadingMonaco.value = true;
  try {
    configureMonacoEnvironment();
    monaco = await import('monaco-editor');
    await nextTick();
    if (!editorHost.value) return;
    editor = monaco.editor.create(editorHost.value, {
      readOnly: true,
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 13,
      lineHeight: 21,
      scrollBeyondLastLine: false,
      renderWhitespace: 'selection',
      wordWrap: 'off',
      theme: themeName(),
      accessibilitySupport: 'auto',
      ariaLabel: 'Editor de código somente leitura',
    });
    if (activeFile.value) displayFile(activeFile.value);

    themeObserver = new MutationObserver(() => {
      if (monaco) monaco.editor.setTheme(themeName());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  } catch (error) {
    errorMessage.value = readableError(
      error,
      'O Monaco não pôde ser carregado. A visualização simplificada permanece disponível.',
    );
  } finally {
    loadingMonaco.value = false;
  }
}

async function resetProject(): Promise<void> {
  editor?.setModel(null);
  for (const model of models.values()) model.dispose();
  models.clear();
  directoryEntries.value = new Map();
  loadedDirectories.value = new Set();
  expandedDirectories.value = new Set();
  openFiles.value = [];
  activePath.value = '';
  fallbackContent.value = '';
  searchResults.value = [];
  searchQuery.value = '';
  errorMessage.value = '';
  loadingTree.value = true;
  await loadDirectory('');
  loadingTree.value = false;
}

watch(
  () => props.project.id,
  () => void resetProject(),
);

onMounted(async () => {
  await Promise.all([resetProject(), initializeMonaco()]);
});

onBeforeUnmount(() => {
  themeObserver?.disconnect();
  editor?.dispose();
  for (const model of models.values()) model.dispose();
  models.clear();
});
</script>

<template>
  <section
    class="embedded-ide"
    aria-labelledby="embedded-ide-title"
    :aria-busy="loadingTree || loadingFile"
  >
    <header class="embedded-ide-header">
      <div>
        <span class="section-kicker">IDE local</span>
        <h3 id="embedded-ide-title">Editor</h3>
        <p>
          Explore e leia arquivos do projeto com Monaco. Salvamento, LSP e IA
          entram nas próximas etapas.
        </p>
      </div>
      <div class="embedded-ide-header-actions">
        <span class="embedded-ide-readonly">Somente leitura</span>
        <ProjectEditorLauncher :project-id="project.id" />
      </div>
    </header>

    <p v-if="errorMessage" class="alert alert-error embedded-ide-error" role="alert">
      {{ errorMessage }}
    </p>

    <div class="embedded-ide-shell">
      <aside class="embedded-ide-sidebar" aria-label="Arquivos do projeto">
        <form class="embedded-ide-search" role="search" @submit.prevent="submitSearch">
          <MagnifyingGlassIcon aria-hidden="true" />
          <label class="sr-only" for="embedded-ide-search-input">
            Buscar nos arquivos
          </label>
          <input
            id="embedded-ide-search-input"
            v-model="searchQuery"
            type="search"
            autocomplete="off"
            placeholder="Buscar no projeto"
          >
          <button
            v-if="searchQuery"
            type="button"
            aria-label="Limpar busca"
            @click="clearSearch"
          >
            <XMarkIcon aria-hidden="true" />
          </button>
        </form>

        <div v-if="searchResults.length || searching" class="embedded-ide-results">
          <header>
            <strong>Resultados</strong>
            <span>{{ searching ? 'Buscando…' : searchResults.length }}</span>
          </header>
          <button
            v-for="result in searchResults"
            :key="`${result.path}:${result.line}:${result.column}`"
            type="button"
            class="embedded-ide-result"
            @click="openFile(result.path, { line: result.line, column: result.column })"
          >
            <strong>{{ result.path }}</strong>
            <small>Linha {{ result.line }} · {{ result.preview }}</small>
          </button>
          <p v-if="searchTruncated" class="embedded-ide-truncated">
            Resultado limitado. Refine a busca.
          </p>
        </div>

        <div v-else class="embedded-ide-tree" role="tree" aria-label="Explorer">
          <p v-if="loadingTree" class="embedded-ide-placeholder" role="status">
            Carregando arquivos…
          </p>
          <button
            v-for="node in flatTree"
            v-else
            :key="node.entry.path"
            type="button"
            class="embedded-ide-tree-item"
            :class="{
              'embedded-ide-tree-item-active': activePath === node.entry.path,
            }"
            role="treeitem"
            :aria-expanded="node.entry.kind === 'directory'
              ? expandedDirectories.has(node.entry.path)
              : undefined"
            :style="{ paddingInlineStart: `${10 + node.depth * 15}px` }"
            @click="node.entry.kind === 'directory'
              ? toggleDirectory(node.entry)
              : openFile(node.entry.path)"
          >
            <template v-if="node.entry.kind === 'directory'">
              <ChevronDownIcon
                v-if="expandedDirectories.has(node.entry.path)"
                aria-hidden="true"
              />
              <ChevronRightIcon v-else aria-hidden="true" />
              <FolderIcon aria-hidden="true" />
            </template>
            <template v-else>
              <span class="embedded-ide-tree-spacer" aria-hidden="true" />
              <DocumentTextIcon aria-hidden="true" />
            </template>
            <span>{{ node.entry.name }}</span>
          </button>
        </div>
      </aside>

      <div class="embedded-ide-workbench">
        <div class="embedded-ide-tabs" role="tablist" aria-label="Arquivos abertos">
          <div
            v-for="file in openFiles"
            :key="file.path"
            class="embedded-ide-tab"
            :class="{ 'embedded-ide-tab-active': activePath === file.path }"
          >
            <button
              type="button"
              role="tab"
              :aria-selected="activePath === file.path"
              @click="displayFile(file)"
            >
              {{ file.name }}
            </button>
            <button
              type="button"
              :aria-label="`Fechar ${file.name}`"
              @click="closeFile(file.path)"
            >
              <XMarkIcon aria-hidden="true" />
            </button>
          </div>
        </div>

        <div class="embedded-ide-editor-area">
          <div
            v-show="!loadingMonaco && monaco"
            ref="editorHost"
            class="embedded-ide-monaco"
          />
          <pre
            v-if="!monaco && fallbackContent"
            class="embedded-ide-fallback"
            tabindex="0"
            aria-label="Conteúdo do arquivo em visualização simplificada"
          ><code>{{ fallbackContent }}</code></pre>
          <div
            v-if="!activeFile"
            class="embedded-ide-welcome"
          >
            <DocumentTextIcon aria-hidden="true" />
            <strong>Selecione um arquivo</strong>
            <span>O conteúdo será aberto em modo somente leitura.</span>
          </div>
          <p v-if="loadingMonaco" class="embedded-ide-loading" role="status">
            Carregando Monaco…
          </p>
        </div>

        <footer class="embedded-ide-statusbar">
          <span>{{ activeFile?.path ?? project.name }}</span>
          <span>{{ activeFile?.language ?? 'Nenhum arquivo' }}</span>
        </footer>
      </div>
    </div>
  </section>
</template>

<style scoped>
.embedded-ide {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.embedded-ide-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
}

.embedded-ide-header h3 {
  margin: 4px 0 0;
  font-size: var(--font-xl);
}

.embedded-ide-header p {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.embedded-ide-header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.embedded-ide-readonly {
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  white-space: nowrap;
}

.embedded-ide-error {
  margin: 0;
}

.embedded-ide-shell {
  display: grid;
  grid-template-columns: minmax(210px, 260px) minmax(0, 1fr);
  min-height: 620px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-0);
}

.embedded-ide-sidebar {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  border-right: 1px solid var(--border);
  background: var(--surface-1);
}

.embedded-ide-search {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  margin: 10px;
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-0);
}

.embedded-ide-search:focus-within {
  border-color: var(--accent);
  outline: 2px solid var(--accent-soft);
}

.embedded-ide-search > svg,
.embedded-ide-search button svg {
  width: 15px;
  height: 15px;
}

.embedded-ide-search input,
.embedded-ide-search button {
  border: 0;
  outline: 0;
  color: var(--text);
  background: transparent;
  font: inherit;
}

.embedded-ide-search input {
  min-width: 0;
  font-size: var(--font-sm);
}

.embedded-ide-search button {
  display: grid;
  padding: 2px;
  place-items: center;
  cursor: pointer;
}

.embedded-ide-tree,
.embedded-ide-results {
  overflow: auto;
  padding: 4px 6px 10px;
}

.embedded-ide-tree-item,
.embedded-ide-result {
  width: 100%;
  border: 0;
  color: var(--text);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.embedded-ide-tree-item {
  display: grid;
  grid-template-columns: 14px 16px minmax(0, 1fr);
  align-items: center;
  gap: 5px;
  min-height: 29px;
  padding-block: 4px;
  padding-right: 8px;
  border-radius: 5px;
  font-size: var(--font-sm);
}

.embedded-ide-tree-item:hover,
.embedded-ide-tree-item:focus-visible,
.embedded-ide-tree-item-active {
  outline: none;
  background: var(--accent-soft);
}

.embedded-ide-tree-item svg {
  width: 14px;
  height: 14px;
}

.embedded-ide-tree-spacer {
  width: 14px;
}

.embedded-ide-results header {
  display: flex;
  justify-content: space-between;
  padding: 7px 8px;
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.embedded-ide-result {
  display: grid;
  gap: 4px;
  padding: 8px;
  border-radius: 6px;
}

.embedded-ide-result:hover,
.embedded-ide-result:focus-visible {
  outline: none;
  background: var(--accent-soft);
}

.embedded-ide-result strong,
.embedded-ide-result small {
  overflow: hidden;
  text-overflow: ellipsis;
}

.embedded-ide-result strong {
  font-size: var(--font-sm);
  white-space: nowrap;
}

.embedded-ide-result small,
.embedded-ide-truncated,
.embedded-ide-placeholder {
  color: var(--text-muted);
  font-size: var(--font-xs);
}

.embedded-ide-result small {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.embedded-ide-truncated,
.embedded-ide-placeholder {
  margin: 8px;
}

.embedded-ide-workbench {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-width: 0;
  background: var(--surface-0);
}

.embedded-ide-tabs {
  display: flex;
  min-height: 37px;
  overflow-x: auto;
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
}

.embedded-ide-tab {
  display: flex;
  align-items: stretch;
  border-right: 1px solid var(--border);
  color: var(--text-muted);
}

.embedded-ide-tab-active {
  color: var(--text);
  background: var(--surface-0);
  box-shadow: inset 0 2px 0 var(--accent);
}

.embedded-ide-tab button {
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  font-size: var(--font-sm);
  cursor: pointer;
}

.embedded-ide-tab button:first-child {
  padding: 8px 8px 8px 12px;
}

.embedded-ide-tab button:last-child {
  display: grid;
  padding: 8px;
  place-items: center;
}

.embedded-ide-tab svg {
  width: 13px;
  height: 13px;
}

.embedded-ide-editor-area {
  position: relative;
  min-width: 0;
  min-height: 0;
}

.embedded-ide-monaco,
.embedded-ide-fallback {
  position: absolute;
  inset: 0;
}

.embedded-ide-fallback {
  margin: 0;
  overflow: auto;
  padding: 18px;
  color: var(--text);
  background: var(--surface-0);
  font-family: var(--font-mono);
  font-size: var(--font-md);
  line-height: 1.6;
  white-space: pre;
}

.embedded-ide-welcome,
.embedded-ide-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 8px;
  margin: 0;
  color: var(--text-muted);
  text-align: center;
}

.embedded-ide-welcome svg {
  width: 38px;
  height: 38px;
}

.embedded-ide-welcome strong {
  color: var(--text);
}

.embedded-ide-welcome span,
.embedded-ide-loading {
  font-size: var(--font-sm);
}

.embedded-ide-statusbar {
  display: flex;
  min-width: 0;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 10px;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  background: var(--surface-1);
  font-size: var(--font-xs);
}

.embedded-ide-statusbar span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 860px) {
  .embedded-ide-header,
  .embedded-ide-header-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .embedded-ide-shell {
    grid-template-columns: 210px minmax(520px, 1fr);
    overflow-x: auto;
  }
}
</style>
