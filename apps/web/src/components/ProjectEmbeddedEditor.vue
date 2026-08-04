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
  ProjectFileMutationResult,
  ProjectFileSearchMatch,
  ProjectLanguageServerKind,
  ProjectLanguageServerStatus,
  ProjectWorkspaceEditPreview,
} from '@dev-dashboard/contracts';

import {
  ApiRequestError,
  fetchProjectDirectory,
  fetchProjectFileContent,
  prepareProjectRailsRuntimeConfirmation,
  saveProjectFileContent,
  searchProjectFiles,
  setProjectRailsRuntimeEnabled,
} from '../api';
import { confirmDialog } from '../stores/app-dialog';
import { configureMonacoEnvironment } from '../monaco-environment';
import {
  defineEmbeddedEditorCustomThemes,
  EMBEDDED_EDITOR_THEME_OPTIONS,
  type EmbeddedEditorThemePreference,
} from '../monaco-themes';
import { registerEmbeddedEditorCustomLanguages } from '../monaco-languages';
import ProjectEditorLauncher from './ProjectEditorLauncher.vue';
import ProjectEditorConflictReview from './ProjectEditorConflictReview.vue';
import ProjectFileMutationPanel from './ProjectFileMutationPanel.vue';
import ProjectWorkspaceEditReview from './ProjectWorkspaceEditReview.vue';
import ProjectAiPanel from './ProjectAiPanel.vue';
import { useProjectOpenFileWatcher } from '../composables/useProjectOpenFileWatcher';
import {
  LANGUAGE_SERVER_MONACO_LANGUAGES,
  ProjectLanguageServerClient,
  projectLanguageServerModelUri,
} from '../language-server/project-language-server-client';
import { AiInlineCompletionProvider } from '../language-server/ai-inline-completion';

interface FlatTreeEntry {
  entry: ProjectFileEntry;
  depth: number;
}

// Deriva do mapa já mantido pelo client (única fonte de verdade do lado web
// para quais kinds existem) em vez de duplicar a lista aqui.
const LANGUAGE_SERVER_KINDS = Object.keys(
  LANGUAGE_SERVER_MONACO_LANGUAGES,
) as ProjectLanguageServerKind[];

const props = defineProps<{ project: Project }>();

const editorHost = ref<HTMLElement | null>(null);
const directoryEntries = ref(new Map<string, ProjectFileEntry[]>());
const loadedDirectories = ref(new Set<string>());
const expandedDirectories = ref(new Set<string>());
const openFiles = ref<ProjectFileContent[]>([]);
const dirtyPaths = ref(new Set<string>());
const previewPath = ref('');
const activePath = ref('');
const selectedPath = ref('');
const fallbackContent = ref('');
const loadingTree = ref(true);
const loadingFile = ref(false);
const loadingMonaco = ref(true);
const monacoReady = ref(false);
const searching = ref(false);
const savingPath = ref('');
const pendingClosePath = ref('');
const conflictPath = ref('');
const errorMessage = ref('');
const statusMessage = ref('');
const searchQuery = ref('');
const searchResults = ref<ProjectFileSearchMatch[]>([]);
const searchTruncated = ref(false);
const languageServerStatuses = ref<
  Partial<Record<ProjectLanguageServerKind, ProjectLanguageServerStatus>>
>({});
const languageServerDiagnostics = ref('');
const workspaceEditPreview = ref<ProjectWorkspaceEditPreview | null>(null);
const railsRuntimeBusy = ref(false);
const selectedText = ref('');
const aiPanelOpen = ref(false);

let monaco: typeof Monaco | undefined;
let editor: Monaco.editor.IStandaloneCodeEditor | undefined;
let themeObserver: MutationObserver | undefined;
let languageServerClients: Partial<Record<ProjectLanguageServerKind, ProjectLanguageServerClient>> = {};
let aiInlineCompletionProvider: AiInlineCompletionProvider | undefined;
const models = new Map<string, Monaco.editor.ITextModel>();
const modelListeners = new Map<string, Monaco.IDisposable>();

const rubyRailsStatus = computed(() => languageServerStatuses.value.ruby?.rails);

const activeFile = computed(() =>
  openFiles.value.find((file) => file.path === activePath.value),
);
const activeDirty = computed(() => dirtyPaths.value.has(activePath.value));
const pendingCloseFile = computed(() =>
  openFiles.value.find((file) => file.path === pendingClosePath.value),
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

const selectedEntry = computed(() =>
  flatTree.value.find((node) => node.entry.path === selectedPath.value)?.entry,
);
const mutationBlocked = computed(() => {
  const selected = selectedEntry.value;
  if (!selected) return false;
  return [...dirtyPaths.value].some((filePath) =>
    filePath === selected.path
    || (
      selected.kind === 'directory'
      && filePath.startsWith(`${selected.path}/`)
    ),
  );
});

function readableError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function parentPath(value: string): string {
  const index = value.lastIndexOf('/');
  return index < 0 ? '' : value.slice(0, index);
}

function affectsPath(filePath: string, targetPath: string): boolean {
  return filePath === targetPath || filePath.startsWith(`${targetPath}/`);
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

function setDirty(filePath: string, dirty: boolean): void {
  dirtyPaths.value = replaceSet(dirtyPaths.value, filePath, dirty);
}

function forEachLanguageServerClient(
  action: (client: ProjectLanguageServerClient) => void,
): void {
  for (const client of Object.values(languageServerClients)) {
    if (client) action(client);
  }
}

function replaceOpenFile(file: ProjectFileContent): void {
  openFiles.value = openFiles.value.map((opened) =>
    opened.path === file.path ? file : opened,
  );
  forEachLanguageServerClient((client) => client.savedFile(file));
}

function replaceModelContent(file: ProjectFileContent): void {
  const model = models.get(file.path);
  if (model && model.getValue() !== file.content) model.setValue(file.content);
  if (activePath.value === file.path) {
    fallbackContent.value = file.content;
    displayFile(file);
  }
}

const {
  conflicts: externalConflicts,
  checking: checkingExternalFiles,
  keepLocal: keepExternalLocal,
  registerSaveConflict,
  removeConflict: removeExternalConflict,
  useDisk: useExternalDisk,
} = useProjectOpenFileWatcher({
  projectId: () => props.project.id,
  openFiles,
  dirtyPaths,
  getLocalContent: (filePath) =>
    models.get(filePath)?.getValue()
      ?? openFiles.value.find((file) => file.path === filePath)?.content
      ?? '',
  replaceOpenFile,
  replaceModelContent,
  setDirty,
  onStatus: (message) => {
    errorMessage.value = '';
    statusMessage.value = message;
  },
  onError: (message) => {
    if (!errorMessage.value) errorMessage.value = message;
  },
});

const activeExternalConflict = computed(() =>
  externalConflicts.value.get(activePath.value),
);

async function loadDirectory(
  relativePath: string,
  force = false,
): Promise<void> {
  if (!force && loadedDirectories.value.has(relativePath)) return;
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

async function selectEntry(entry: ProjectFileEntry): Promise<void> {
  selectedPath.value = entry.path;
  if (entry.kind === 'directory') await toggleDirectory(entry);
  else await openFile(entry.path);
}

async function pinEntry(entry: ProjectFileEntry): Promise<void> {
  if (entry.kind === 'directory') return;
  selectedPath.value = entry.path;
  await openFile(entry.path, undefined, { pin: true });
}

function pinPreview(filePath: string): void {
  if (previewPath.value === filePath) previewPath.value = '';
}

function modelUri(filePath: string): Monaco.Uri {
  return monaco!.Uri.parse(
    projectLanguageServerModelUri(props.project.id, filePath),
  );
}

const EDITOR_THEME_STORAGE_KEY = 'dev-dashboard:embedded-editor-theme';

function readStoredEditorTheme(): EmbeddedEditorThemePreference {
  try {
    const stored = window.localStorage.getItem(EDITOR_THEME_STORAGE_KEY);
    return stored === 'monokai' ? 'monokai' : 'auto';
  } catch {
    return 'auto';
  }
}

const editorThemePreference = ref<EmbeddedEditorThemePreference>(readStoredEditorTheme());

watch(editorThemePreference, (value) => {
  try {
    window.localStorage.setItem(EDITOR_THEME_STORAGE_KEY, value);
  } catch {
    // Preferência local é opcional; o editor continua funcional sem ela.
  }
  if (monaco) monaco.editor.setTheme(themeName());
});

function themeName(): string {
  if (editorThemePreference.value === 'monokai') return 'monokai';
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
  const listener = model.onDidChangeContent(() => {
    const opened = openFiles.value.find((item) => item.path === file.path);
    if (!opened) return;
    const value = model.getValue();
    const changed = value !== opened.content;
    setDirty(file.path, changed);
    if (changed) pinPreview(file.path);
    if (activePath.value === file.path) fallbackContent.value = value;
    statusMessage.value = '';
  });
  models.set(file.path, model);
  modelListeners.set(file.path, listener);
  forEachLanguageServerClient((client) => client.openFile(file, model));
  return model;
}

function displayFile(
  file: ProjectFileContent,
  position?: { line: number; column: number },
): void {
  activePath.value = file.path;
  selectedPath.value = file.path;
  pendingClosePath.value = '';
  selectedText.value = '';
  const model = modelFor(file);
  fallbackContent.value = model?.getValue() ?? file.content;
  if (!editor || !model) return;
  editor.setModel(model);
  editor.updateOptions({ readOnly: !file.writable });
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

const pendingFileLoads = new Map<string, Promise<void>>();

async function openFile(
  filePath: string,
  position?: { line: number; column: number },
  options?: { pin?: boolean },
): Promise<void> {
  const pin = options?.pin ?? false;
  selectedPath.value = filePath;
  errorMessage.value = '';
  statusMessage.value = '';
  const opened = openFiles.value.find((file) => file.path === filePath);
  if (opened) {
    if (pin) pinPreview(filePath);
    displayFile(opened, position);
    return;
  }

  // O navegador dispara `click` duas vezes antes de um `dblclick`. Sem essa
  // deduplicação, cada evento chamaria `fetchProjectFileContent` para o
  // mesmo caminho antes do primeiro terminar, inserindo o arquivo mais de
  // uma vez em `openFiles`. Chamadas concorrentes para o mesmo caminho
  // aguardam a busca já em andamento em vez de iniciar uma nova.
  const pending = pendingFileLoads.get(filePath);
  if (pending) {
    await pending;
    if (pin) pinPreview(filePath);
    const loaded = openFiles.value.find((file) => file.path === filePath);
    if (loaded) displayFile(loaded, position);
    return;
  }

  loadingFile.value = true;
  const load = (async () => {
    try {
      const file = await fetchProjectFileContent(props.project.id, filePath);
      if (
        !pin
        && previewPath.value
        && previewPath.value !== filePath
        && !dirtyPaths.value.has(previewPath.value)
      ) {
        const stalePath = previewPath.value;
        openFiles.value = openFiles.value.filter((item) => item.path !== stalePath);
        disposeModel(stalePath);
        removeExternalConflict(stalePath);
      }
      openFiles.value = [...openFiles.value, file];
      if (!pin) previewPath.value = filePath;
      displayFile(file, position);
    } catch (error) {
      errorMessage.value = readableError(
        error,
        'Não foi possível abrir o arquivo.',
      );
    } finally {
      loadingFile.value = false;
      pendingFileLoads.delete(filePath);
    }
  })();
  pendingFileLoads.set(filePath, load);
  await load;
}

function disposeModel(filePath: string): void {
  forEachLanguageServerClient((client) => client.closeFile(filePath));
  modelListeners.get(filePath)?.dispose();
  modelListeners.delete(filePath);
  models.get(filePath)?.dispose();
  models.delete(filePath);
}

function closeFileNow(filePath: string): void {
  const index = openFiles.value.findIndex((file) => file.path === filePath);
  openFiles.value = openFiles.value.filter((file) => file.path !== filePath);
  setDirty(filePath, false);
  disposeModel(filePath);
  removeExternalConflict(filePath);
  pendingClosePath.value = '';
  if (conflictPath.value === filePath) conflictPath.value = '';
  if (previewPath.value === filePath) previewPath.value = '';

  if (activePath.value !== filePath) return;
  const next = openFiles.value[Math.max(0, index - 1)] ?? openFiles.value[0];
  if (next) displayFile(next);
  else {
    activePath.value = '';
    fallbackContent.value = '';
    editor?.setModel(null);
  }
}

function closeAffectedFiles(targetPath: string): void {
  for (const file of [...openFiles.value]) {
    if (affectsPath(file.path, targetPath)) closeFileNow(file.path);
  }
}

function requestCloseFile(filePath: string): void {
  if (dirtyPaths.value.has(filePath)) {
    pendingClosePath.value = filePath;
    return;
  }
  closeFileNow(filePath);
}

async function reloadFile(filePath: string): Promise<void> {
  loadingFile.value = true;
  errorMessage.value = '';
  try {
    const fresh = await fetchProjectFileContent(props.project.id, filePath);
    replaceOpenFile(fresh);
    const model = models.get(filePath);
    if (model && model.getValue() !== fresh.content) model.setValue(fresh.content);
    setDirty(filePath, false);
    conflictPath.value = '';
    removeExternalConflict(filePath);
    pendingClosePath.value = '';
    statusMessage.value = `${fresh.name} recarregado do disco.`;
    if (activePath.value === filePath) displayFile(fresh);
  } catch (error) {
    errorMessage.value = readableError(
      error,
      'Não foi possível recarregar o arquivo.',
    );
  } finally {
    loadingFile.value = false;
  }
}

async function saveActiveFile(): Promise<void> {
  const file = activeFile.value;
  if (
    !file
    || !file.writable
    || !dirtyPaths.value.has(file.path)
    || savingPath.value
  ) return;

  const content = models.get(file.path)?.getValue() ?? fallbackContent.value;
  savingPath.value = file.path;
  errorMessage.value = '';
  statusMessage.value = '';
  try {
    const saved = await saveProjectFileContent(props.project.id, {
      path: file.path,
      content,
      expectedVersion: file.version,
    });
    replaceOpenFile(saved);
    setDirty(file.path, false);
    conflictPath.value = '';
    fallbackContent.value = saved.content;
    statusMessage.value = `${saved.name} salvo.`;
  } catch (error) {
    if (
      error instanceof ApiRequestError
      && error.code === 'FILE_CHANGED_EXTERNALLY'
    ) {
      try {
        const diskFile = await fetchProjectFileContent(
          props.project.id,
          file.path,
        );
        registerSaveConflict(file, diskFile);
        errorMessage.value =
          'O arquivo mudou fora do dashboard. Compare a base, sua edição e o disco.';
      } catch (reloadError) {
        errorMessage.value = readableError(
          reloadError,
          'O arquivo mudou no disco e não pôde ser recarregado para comparação.',
        );
      }
    } else {
      errorMessage.value = readableError(
        error,
        'Não foi possível salvar o arquivo.',
      );
    }
  } finally {
    savingPath.value = '';
  }
}

async function handleFileMutation(
  result: ProjectFileMutationResult,
): Promise<void> {
  errorMessage.value = '';
  statusMessage.value = '';

  if (result.operation === 'create') {
    await loadDirectory(parentPath(result.path), true);
    selectedPath.value = result.path;
    if (result.kind === 'directory') {
      expandedDirectories.value = replaceSet(
        expandedDirectories.value,
        result.path,
        true,
      );
      await loadDirectory(result.path, true);
    } else {
      await openFile(result.path);
    }
    statusMessage.value = `${result.path} criado.`;
    return;
  }

  if (result.operation === 'rename' && result.destinationPath) {
    const reopenFile =
      result.kind === 'file'
      && openFiles.value.some((file) => file.path === result.path);
    closeAffectedFiles(result.path);
    const parents = new Set([
      parentPath(result.path),
      parentPath(result.destinationPath),
    ]);
    await Promise.all([...parents].map((parent) => loadDirectory(parent, true)));
    selectedPath.value = result.destinationPath;
    if (reopenFile) await openFile(result.destinationPath);
    statusMessage.value = `${result.path} renomeado para ${result.destinationPath}.`;
    return;
  }

  closeAffectedFiles(result.path);
  await loadDirectory(parentPath(result.path), true);
  selectedPath.value = '';
  statusMessage.value = `${result.path} excluído.`;
}

async function submitSearch(): Promise<void> {
  const query = searchQuery.value.trim();
  if (query.length < 2 || searching.value) return;
  searching.value = true;
  errorMessage.value = '';
  try {
    if (query.startsWith('@')) {
      const symbolQuery = query.slice(1).trim();
      const clients = Object.values(languageServerClients).filter(
        (client): client is ProjectLanguageServerClient => Boolean(client),
      );
      searchResults.value = symbolQuery && clients.length > 0
        ? (await Promise.all(clients.map((client) => client.workspaceSymbols(symbolQuery)))).flat()
        : [];
      searchTruncated.value = false;
      return;
    }
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

function handleWorkspaceEditApplied(files: ProjectFileContent[]): void {
  for (const file of files) {
    replaceOpenFile(file);
    replaceModelContent(file);
    setDirty(file.path, false);
  }
  workspaceEditPreview.value = null;
  errorMessage.value = '';
  statusMessage.value = `${files.length} ${files.length === 1 ? 'arquivo atualizado' : 'arquivos atualizados'} pelo fluxo seguro.`;
}

function disposeLanguageServerClients(): void {
  forEachLanguageServerClient((client) => client.dispose());
  languageServerClients = {};
  languageServerStatuses.value = {};
  languageServerDiagnostics.value = '';
  workspaceEditPreview.value = null;
}

function disposeAiInlineCompletionProvider(): void {
  aiInlineCompletionProvider?.dispose();
  aiInlineCompletionProvider = undefined;
}

function createAiInlineCompletionProvider(): void {
  disposeAiInlineCompletionProvider();
  if (!monaco) return;
  const provider = new AiInlineCompletionProvider(monaco, props.project.id);
  aiInlineCompletionProvider = provider;
  void provider.initialize();
}

function createLanguageServerClients(): void {
  disposeLanguageServerClients();
  if (!monaco) return;
  for (const kind of LANGUAGE_SERVER_KINDS) {
    languageServerClients[kind] = new ProjectLanguageServerClient(
      monaco,
      props.project.id,
      props.project.name,
      kind,
      {
        onStatus: (status) => {
          languageServerStatuses.value = {
            ...languageServerStatuses.value,
            [kind]: status,
          };
        },
        onDiagnostics: (message) => {
          languageServerDiagnostics.value = message;
        },
        onWorkspaceEdit: (preview) => {
          workspaceEditPreview.value = preview;
        },
        onError: (message) => {
          if (!errorMessage.value) errorMessage.value = message;
        },
      },
    );
  }
}

async function enableRailsRuntime(): Promise<void> {
  if (railsRuntimeBusy.value) return;
  const confirmed = await confirmDialog({
    title: 'Habilitar introspecção Rails',
    message:
      'O add-on ruby-lsp-rails poderá inicializar a aplicação Rails deste projeto (banco, cache e configuração local) para oferecer recursos semânticos mais precisos. Habilitar agora?',
    tone: 'warning',
    confirmLabel: 'Habilitar',
  });
  if (!confirmed) return;
  railsRuntimeBusy.value = true;
  errorMessage.value = '';
  try {
    const confirmation = await prepareProjectRailsRuntimeConfirmation(props.project.id);
    const status = await setProjectRailsRuntimeEnabled(
      props.project.id,
      true,
      confirmation.token,
    );
    languageServerStatuses.value = { ...languageServerStatuses.value, ruby: status };
    statusMessage.value = 'Introspecção Rails habilitada.';
  } catch (error) {
    errorMessage.value = readableError(
      error,
      'Não foi possível habilitar a introspecção Rails.',
    );
  } finally {
    railsRuntimeBusy.value = false;
  }
}

async function disableRailsRuntime(): Promise<void> {
  if (railsRuntimeBusy.value) return;
  railsRuntimeBusy.value = true;
  errorMessage.value = '';
  try {
    const status = await setProjectRailsRuntimeEnabled(props.project.id, false);
    languageServerStatuses.value = { ...languageServerStatuses.value, ruby: status };
    statusMessage.value = 'Introspecção Rails desabilitada.';
  } catch (error) {
    errorMessage.value = readableError(
      error,
      'Não foi possível desabilitar a introspecção Rails.',
    );
  } finally {
    railsRuntimeBusy.value = false;
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    void saveActiveFile();
  }
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (dirtyPaths.value.size === 0) return;
  event.preventDefault();
  event.returnValue = '';
}

async function initializeMonaco(): Promise<void> {
  loadingMonaco.value = true;
  try {
    configureMonacoEnvironment();
    monaco = await import('monaco-editor');
    defineEmbeddedEditorCustomThemes(monaco);
    registerEmbeddedEditorCustomLanguages(monaco);
    createLanguageServerClients();
    createAiInlineCompletionProvider();
    await nextTick();
    if (!editorHost.value) return;
    editor = monaco.editor.create(editorHost.value, {
      readOnly: true,
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 13,
      lineHeight: 21,
      scrollBeyondLastLine: false,
      scrollbar: { alwaysConsumeMouseWheel: false },
      renderWhitespace: 'selection',
      wordWrap: 'off',
      theme: themeName(),
      accessibilitySupport: 'auto',
      ariaLabel: 'Editor de código do projeto',
    });
    monacoReady.value = true;
    if (activeFile.value) displayFile(activeFile.value);

    editor.onDidChangeCursorSelection((event) => {
      const model = editor?.getModel();
      selectedText.value = model && !event.selection.isEmpty()
        ? model.getValueInRange(event.selection)
        : '';
    });

    themeObserver = new MutationObserver(() => {
      if (monaco) monaco.editor.setTheme(themeName());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  } catch (error) {
    monacoReady.value = false;
    errorMessage.value = readableError(
      error,
      'O Monaco não pôde ser carregado. A visualização simplificada permanece disponível.',
    );
  } finally {
    loadingMonaco.value = false;
  }
}

async function resetProject(): Promise<void> {
  disposeLanguageServerClients();
  disposeAiInlineCompletionProvider();
  selectedText.value = '';
  editor?.setModel(null);
  for (const listener of modelListeners.values()) listener.dispose();
  for (const model of models.values()) model.dispose();
  modelListeners.clear();
  models.clear();
  directoryEntries.value = new Map();
  loadedDirectories.value = new Set();
  expandedDirectories.value = new Set();
  openFiles.value = [];
  dirtyPaths.value = new Set();
  activePath.value = '';
  selectedPath.value = '';
  fallbackContent.value = '';
  searchResults.value = [];
  searchQuery.value = '';
  pendingClosePath.value = '';
  conflictPath.value = '';
  errorMessage.value = '';
  statusMessage.value = '';
  if (monaco) {
    createLanguageServerClients();
    createAiInlineCompletionProvider();
  }
  loadingTree.value = true;
  await loadDirectory('');
  loadingTree.value = false;
}

watch(
  () => props.project.id,
  () => void resetProject(),
);

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('beforeunload', handleBeforeUnload);
  await Promise.all([resetProject(), initializeMonaco()]);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('beforeunload', handleBeforeUnload);
  themeObserver?.disconnect();
  forEachLanguageServerClient((client) => client.dispose());
  disposeAiInlineCompletionProvider();
  editor?.dispose();
  for (const listener of modelListeners.values()) listener.dispose();
  for (const model of models.values()) model.dispose();
  modelListeners.clear();
  models.clear();
});
</script>

<template>
  <section
    class="embedded-ide"
    aria-labelledby="embedded-ide-title"
    :aria-busy="loadingTree || loadingFile || Boolean(savingPath)"
  >
    <header class="embedded-ide-header">
      <div>
        <span class="section-kicker">IDE local</span>
        <h3 id="embedded-ide-title">Editor</h3>
        <p>
          Edite arquivos permitidos com salvamento versionado. Mudanças externas
          nunca são sobrescritas automaticamente.
        </p>
      </div>
      <div class="embedded-ide-header-actions">
        <template v-for="kind in LANGUAGE_SERVER_KINDS" :key="kind">
          <span
            v-if="languageServerStatuses[kind]?.supported"
            class="embedded-ide-language-server"
            :data-state="languageServerStatuses[kind]!.state"
            :title="languageServerStatuses[kind]!.message"
          >
            LSP {{ kind === 'ruby' ? 'Ruby' : 'JS/TS' }}
            {{ languageServerStatuses[kind]!.state === 'ready'
              ? 'ativo'
              : languageServerStatuses[kind]!.state === 'unavailable'
                ? 'indisponível'
                : languageServerStatuses[kind]!.state === 'failed'
                  ? 'falhou'
                  : 'iniciando' }}
          </span>
        </template>
        <span
          v-if="rubyRailsStatus?.addonAvailable"
          class="embedded-ide-rails-runtime"
          :data-state="rubyRailsStatus.runtimeState"
          :title="rubyRailsStatus.message"
        >
          <span>Rails runtime {{ rubyRailsStatus.runtimeState === 'enabled' ? 'habilitado' : 'desabilitado' }}</span>
          <button
            v-if="rubyRailsStatus.runtimeState === 'disabled'"
            type="button"
            :disabled="railsRuntimeBusy"
            @click="enableRailsRuntime"
          >
            Habilitar
          </button>
          <button
            v-else
            type="button"
            :disabled="railsRuntimeBusy"
            @click="disableRailsRuntime"
          >
            Desabilitar
          </button>
        </span>
        <label class="embedded-ide-theme-picker">
          <span class="sr-only">Tema do editor</span>
          <select v-model="editorThemePreference">
            <option
              v-for="option in EMBEDDED_EDITOR_THEME_OPTIONS"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
        <span class="embedded-ide-readonly">
          {{ activeFile?.writable ? 'Edição segura' : 'Somente leitura' }}
        </span>
        <button
          type="button"
          class="button button-primary embedded-ide-save"
          :disabled="!activeFile?.writable || !activeDirty || Boolean(savingPath)"
          @click="saveActiveFile"
        >
          {{ savingPath ? 'Salvando…' : 'Salvar' }}
        </button>
        <button
          type="button"
          class="button embedded-ide-ai-toggle"
          :aria-pressed="aiPanelOpen"
          @click="aiPanelOpen = !aiPanelOpen"
        >
          IA
        </button>
        <ProjectEditorLauncher :project-id="project.id" />
      </div>
    </header>

    <p v-if="errorMessage" class="alert alert-error embedded-ide-error" role="alert">
      {{ errorMessage }}
    </p>
    <p v-else-if="statusMessage" class="alert embedded-ide-status" role="status">
      {{ statusMessage }}
    </p>
    <p class="sr-only" role="status" aria-live="polite">
      {{ languageServerDiagnostics }}
    </p>

    <div v-if="conflictPath" class="embedded-ide-decision" role="alert">
      <span>Sua edição continua aberta e o arquivo no disco foi preservado.</span>
      <div>
        <button type="button" @click="reloadFile(conflictPath)">
          Recarregar do disco
        </button>
        <button
          type="button"
          @click="conflictPath = ''; errorMessage = ''"
        >
          Manter edição
        </button>
      </div>
    </div>

    <div v-if="pendingCloseFile" class="embedded-ide-decision" role="alert">
      <span>{{ pendingCloseFile.name }} possui alterações não salvas.</span>
      <div>
        <button type="button" @click="closeFileNow(pendingCloseFile.path)">
          Descartar e fechar
        </button>
        <button type="button" @click="pendingClosePath = ''">
          Cancelar
        </button>
      </div>
    </div>

    <ProjectWorkspaceEditReview
      v-if="workspaceEditPreview"
      :project-id="project.id"
      :preview="workspaceEditPreview"
      @applied="handleWorkspaceEditApplied"
      @cancel="workspaceEditPreview = null"
    />

    <ProjectEditorConflictReview
      v-if="activeExternalConflict"
      :path="activeExternalConflict.path"
      :base-content="activeExternalConflict.baseContent"
      :local-content="activeExternalConflict.localContent"
      :disk-content="activeExternalConflict.diskFile.content"
      @use-disk="useExternalDisk(activeExternalConflict.path)"
      @keep-local="keepExternalLocal(activeExternalConflict.path)"
    />

    <div
      class="embedded-ide-shell"
      :class="{ 'embedded-ide-shell-with-ai': aiPanelOpen }"
    >
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
            placeholder="Buscar no projeto ou @símbolo"
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

        <ProjectFileMutationPanel
          :project-id="project.id"
          :selected="selectedEntry"
          :blocked="mutationBlocked"
          @completed="handleFileMutation"
        />

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
              'embedded-ide-tree-item-selected': selectedPath === node.entry.path,
            }"
            role="treeitem"
            :aria-expanded="node.entry.kind === 'directory'
              ? expandedDirectories.has(node.entry.path)
              : undefined"
            :style="{ paddingInlineStart: `${10 + node.depth * 15}px` }"
            @click="selectEntry(node.entry)"
            @dblclick="pinEntry(node.entry)"
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
            <span class="embedded-ide-tree-item-name">
              {{ node.entry.name }}
              <span
                v-if="dirtyPaths.has(node.entry.path)"
                class="embedded-ide-tree-item-dirty"
                aria-label="alterado"
              >•</span>
            </span>
          </button>
        </div>
      </aside>

      <div class="embedded-ide-workbench">
        <div class="embedded-ide-tabs" role="tablist" aria-label="Arquivos abertos">
          <div
            v-for="file in openFiles"
            :key="file.path"
            class="embedded-ide-tab"
            :class="{
              'embedded-ide-tab-active': activePath === file.path,
              'embedded-ide-tab-preview': previewPath === file.path,
            }"
          >
            <button
              type="button"
              role="tab"
              :aria-selected="activePath === file.path"
              @click="displayFile(file)"
              @dblclick="pinPreview(file.path)"
            >
              {{ file.name }}<span v-if="dirtyPaths.has(file.path)" aria-label="alterado"> •</span>
            </button>
            <button
              type="button"
              :aria-label="`Fechar ${file.name}`"
              @click="requestCloseFile(file.path)"
            >
              <XMarkIcon aria-hidden="true" />
            </button>
          </div>
        </div>

        <div class="embedded-ide-editor-area">
          <div
            v-show="!loadingMonaco && monacoReady"
            ref="editorHost"
            class="embedded-ide-monaco"
          />
          <pre
            v-if="!monacoReady && fallbackContent"
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
            <span>Arquivos permitidos podem ser editados e salvos com Ctrl+S.</span>
          </div>
          <p v-if="loadingMonaco" class="embedded-ide-loading" role="status">
            Carregando Monaco…
          </p>
        </div>

        <footer class="embedded-ide-statusbar">
          <span>{{ activeFile?.path ?? project.name }}</span>
          <span>
            {{ checkingExternalFiles
              ? 'Verificando mudanças externas…'
              : activeDirty
                ? 'Alterações não salvas'
                : (activeFile?.language ?? 'Nenhum arquivo') }}
          </span>
        </footer>
      </div>

      <ProjectAiPanel
        v-if="aiPanelOpen"
        class="embedded-ide-ai-panel"
        :project-id="project.id"
        :active-file-path="activeFile?.path ?? ''"
        :active-file-language="activeFile?.language ?? ''"
        :selected-text="selectedText"
      />
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
  gap: 10px;
}

.embedded-ide-theme-picker select {
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  cursor: pointer;
}

.embedded-ide-language-server,
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

.embedded-ide-language-server[data-state='ready'] {
  border-color: var(--success);
  color: var(--success);
}

.embedded-ide-language-server[data-state='failed'],
.embedded-ide-language-server[data-state='unavailable'] {
  color: var(--text-dim);
}

.embedded-ide-rails-runtime {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  white-space: nowrap;
}

.embedded-ide-rails-runtime[data-state='enabled'] {
  border-color: var(--warning-text);
  color: var(--warning-text);
}

.embedded-ide-rails-runtime button {
  border: 0;
  padding: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  font-weight: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.embedded-ide-save {
  min-width: 72px;
}

.embedded-ide-ai-toggle[aria-pressed='true'] {
  border-color: var(--accent);
  color: var(--accent);
}

.embedded-ide-error,
.embedded-ide-status {
  margin: 0;
}

.embedded-ide-status {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--surface-1);
}

.embedded-ide-decision {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  font-size: var(--font-sm);
}

.embedded-ide-decision > div {
  display: flex;
  gap: 8px;
}

.embedded-ide-decision button {
  padding: 6px 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  background: var(--surface-0);
  font: inherit;
  cursor: pointer;
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

.embedded-ide-shell-with-ai {
  grid-template-columns: minmax(210px, 260px) minmax(0, 1fr) minmax(260px, 320px);
}

.embedded-ide-ai-panel {
  min-height: 0;
}

.embedded-ide-sidebar {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
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
  grid-template-columns: 15px 17px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  min-height: 31px;
  padding-block: 4px;
  padding-right: 8px;
  border-radius: 5px;
  font-size: var(--font-md);
}

.embedded-ide-tree-item:hover,
.embedded-ide-tree-item:focus-visible,
.embedded-ide-tree-item-active,
.embedded-ide-tree-item-selected {
  outline: none;
  background: var(--accent-soft);
}

.embedded-ide-tree-item svg {
  width: 15px;
  height: 15px;
}

.embedded-ide-tree-spacer {
  width: 15px;
}

.embedded-ide-tree-item-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.embedded-ide-tree-item-dirty {
  color: var(--warning-text);
  font-weight: 700;
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

.embedded-ide-tab-preview button:first-child {
  font-style: italic;
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
  .embedded-ide-header-actions,
  .embedded-ide-decision {
    align-items: stretch;
    flex-direction: column;
  }

  .embedded-ide-shell {
    grid-template-columns: 210px minmax(520px, 1fr);
    overflow-x: auto;
  }
}
</style>
