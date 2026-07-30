<script setup lang="ts">
import {
  ArrowPathIcon,
  Bars3BottomLeftIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  ViewColumnsIcon,
} from '@heroicons/vue/24/outline';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';

import type {
  GitDiffFile,
  GitDiffScope,
  GitDiffSnapshot,
  GitFileDiff,
  GitFileStatus,
  ProjectGitOverview,
} from '@dev-dashboard/contracts';

import {
  fetchProjectGit,
  fetchProjectGitDiff,
  fetchProjectGitFileDiff,
} from '../api';
import {
  buildSplitGitDiffRows,
  countGitDiffMatches,
  highlightGitDiffText,
  parseUnifiedGitDiff,
} from '../utils/git-diff-view';
import { gitFileToneFor } from '../utils/status-tones';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{
  projectId: string;
}>();

type DiffViewMode = 'unified' | 'split';
type DiffStatusFilter = 'all' | GitFileStatus;

const scope = ref<GitDiffScope>('combined');
const snapshot = ref<GitDiffSnapshot | null>(null);
const overview = ref<ProjectGitOverview | null>(null);
const selectedPath = ref('');
const fileDiff = ref<GitFileDiff | null>(null);
const fileSearch = ref('');
const diffSearch = ref('');
const statusFilter = ref<DiffStatusFilter>('all');
const viewMode = ref<DiffViewMode>('unified');
const loadingSnapshot = ref(false);
const loadingFile = ref(false);
const snapshotError = ref('');
const fileError = ref('');
const copied = ref(false);
let snapshotController: AbortController | undefined;
let fileController: AbortController | undefined;
let copyTimer: ReturnType<typeof setTimeout> | undefined;

const scopeOptions: Array<{
  value: GitDiffScope;
  label: string;
  description: string;
}> = [
  {
    value: 'combined',
    label: 'Todas',
    description: 'Staged e não staged',
  },
  {
    value: 'index',
    label: 'Staged',
    description: 'Prontas para commit',
  },
  {
    value: 'worktree',
    label: 'Não staged',
    description: 'Fora do índice',
  },
];

const statusLabels: Record<GitFileStatus, string> = {
  added: 'Adicionado',
  modified: 'Modificado',
  deleted: 'Removido',
  renamed: 'Renomeado',
  copied: 'Copiado',
  untracked: 'Não rastreado',
  conflicted: 'Conflito',
  'type-changed': 'Tipo alterado',
};

const statusOptions: Array<{
  value: DiffStatusFilter;
  label: string;
}> = [
  { value: 'all', label: 'Todos os status' },
  { value: 'modified', label: 'Modificados' },
  { value: 'added', label: 'Adicionados' },
  { value: 'deleted', label: 'Removidos' },
  { value: 'renamed', label: 'Renomeados' },
  { value: 'untracked', label: 'Não rastreados' },
  { value: 'conflicted', label: 'Com conflito' },
];

const currentScope = computed(() =>
  scopeOptions.find((option) => option.value === scope.value) ?? scopeOptions[0]!,
);

const branchLabel = computed(() => {
  if (!overview.value) return 'Carregando branch…';
  if (overview.value.detached) return 'HEAD destacado';
  return overview.value.branch ?? 'Repositório sem commits';
});

const filteredFiles = computed(() => {
  const query = fileSearch.value.trim().toLocaleLowerCase('pt-BR');
  return (snapshot.value?.files ?? []).filter((file) => {
    if (statusFilter.value !== 'all' && file.status !== statusFilter.value) {
      return false;
    }
    if (!query) return true;
    return [file.path, file.previousPath ?? '', statusLabels[file.status]]
      .some((value) => value.toLocaleLowerCase('pt-BR').includes(query));
  });
});

const selectedFile = computed(() =>
  snapshot.value?.files.find((file) => file.path === selectedPath.value),
);

const totalAdditions = computed(() =>
  (snapshot.value?.files ?? []).reduce((total, file) => total + file.additions, 0),
);

const totalDeletions = computed(() =>
  (snapshot.value?.files ?? []).reduce((total, file) => total + file.deletions, 0),
);

const binaryCount = computed(() =>
  (snapshot.value?.files ?? []).filter((file) => file.binary).length,
);

const unifiedLines = computed(() =>
  parseUnifiedGitDiff(fileDiff.value?.content ?? ''),
);

const splitRows = computed(() =>
  buildSplitGitDiffRows(unifiedLines.value),
);

const diffMatchCount = computed(() =>
  countGitDiffMatches(fileDiff.value?.content ?? '', diffSearch.value),
);

function fileName(filePath: string): string {
  return filePath.split('/').filter(Boolean).at(-1) ?? filePath;
}

function directoryName(filePath: string): string {
  const parts = filePath.split('/').filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join('/') : 'raiz do projeto';
}

function linePrefix(kind: string): string {
  if (kind === 'addition') return '+';
  if (kind === 'deletion') return '−';
  if (kind === 'context') return ' ';
  return '';
}

function highlighted(text: string): string {
  return highlightGitDiffText(text, diffSearch.value);
}

async function loadOverview(): Promise<void> {
  try {
    overview.value = await fetchProjectGit(props.projectId);
  } catch {
    overview.value = null;
  }
}

async function selectFile(filePath: string): Promise<void> {
  if (!filePath) {
    selectedPath.value = '';
    fileDiff.value = null;
    return;
  }

  fileController?.abort();
  const controller = new AbortController();
  fileController = controller;
  selectedPath.value = filePath;
  fileDiff.value = null;
  fileError.value = '';
  loadingFile.value = true;

  try {
    const result = await fetchProjectGitFileDiff(
      props.projectId,
      filePath,
      scope.value,
      controller.signal,
    );
    if (!controller.signal.aborted && selectedPath.value === filePath) {
      fileDiff.value = result;
    }
  } catch (error) {
    if (!controller.signal.aborted && selectedPath.value === filePath) {
      fileError.value = error instanceof Error
        ? error.message
        : 'Não foi possível carregar o diff deste arquivo.';
    }
  } finally {
    if (!controller.signal.aborted && selectedPath.value === filePath) {
      loadingFile.value = false;
    }
  }
}

async function loadSnapshot(): Promise<void> {
  snapshotController?.abort();
  fileController?.abort();
  const controller = new AbortController();
  snapshotController = controller;
  loadingSnapshot.value = true;
  snapshotError.value = '';
  fileError.value = '';
  fileDiff.value = null;

  try {
    const result = await fetchProjectGitDiff(
      props.projectId,
      scope.value,
      controller.signal,
    );
    if (controller.signal.aborted) return;

    snapshot.value = result;
    const preserved = result.files.find((file) => file.path === selectedPath.value);
    const target = preserved?.path ?? result.files[0]?.path ?? '';
    selectedPath.value = target;
    if (target) await selectFile(target);
  } catch (error) {
    if (!controller.signal.aborted) {
      snapshot.value = null;
      selectedPath.value = '';
      snapshotError.value = error instanceof Error
        ? error.message
        : 'Não foi possível carregar as alterações do projeto.';
    }
  } finally {
    if (!controller.signal.aborted) loadingSnapshot.value = false;
  }
}

async function refresh(): Promise<void> {
  await Promise.all([loadOverview(), loadSnapshot()]);
}

async function copySelectedPath(): Promise<void> {
  if (!selectedPath.value) return;
  try {
    await navigator.clipboard.writeText(selectedPath.value);
    copied.value = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copied.value = false;
    }, 1_800);
  } catch {
    copied.value = false;
  }
}

async function moveSelection(direction: -1 | 1): Promise<void> {
  const files = filteredFiles.value;
  if (files.length === 0) return;
  const currentIndex = files.findIndex((file) => file.path === selectedPath.value);
  const nextIndex = currentIndex < 0
    ? 0
    : Math.min(files.length - 1, Math.max(0, currentIndex + direction));
  const target = files[nextIndex];
  if (!target || target.path === selectedPath.value) return;
  await selectFile(target.path);
  await nextTick();
  document.querySelector<HTMLButtonElement>(
    `[data-git-diff-path="${CSS.escape(target.path)}"]`,
  )?.focus();
}

function handleFileListKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    void moveSelection(1);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    void moveSelection(-1);
  }
}

watch(
  [() => props.projectId, scope],
  () => {
    selectedPath.value = '';
    fileDiff.value = null;
    diffSearch.value = '';
    void refresh();
  },
  { immediate: true },
);

watch(filteredFiles, (files) => {
  if (files.some((file) => file.path === selectedPath.value)) return;
  const first = files[0];
  if (first) void selectFile(first.path);
  else {
    selectedPath.value = '';
    fileDiff.value = null;
  }
});

onBeforeUnmount(() => {
  snapshotController?.abort();
  fileController?.abort();
  if (copyTimer) clearTimeout(copyTimer);
});
</script>

<template>
  <section class="git-diff-page">
    <header class="git-diff-page-heading">
      <div>
        <span class="git-diff-kicker">Revisão de código</span>
        <h2>Alterações da branch</h2>
        <p>
          <strong>{{ branchLabel }}</strong>
          <span aria-hidden="true">·</span>
          {{ currentScope.description }}
        </p>
      </div>

      <div class="git-diff-heading-actions">
        <div class="git-diff-scope-switch" aria-label="Escopo do diff">
          <button
            v-for="option in scopeOptions"
            :key="option.value"
            type="button"
            :class="{ active: scope === option.value }"
            :aria-pressed="scope === option.value"
            @click="scope = option.value"
          >
            {{ option.label }}
          </button>
        </div>

        <button
          class="git-diff-refresh-button"
          type="button"
          :disabled="loadingSnapshot"
          @click="refresh"
        >
          <ArrowPathIcon :class="{ spinning: loadingSnapshot }" aria-hidden="true" />
          {{ loadingSnapshot ? 'Atualizando…' : 'Atualizar' }}
        </button>
      </div>
    </header>

    <div v-if="snapshotError" class="project-error" role="alert">
      {{ snapshotError }}
    </div>

    <div class="git-diff-metrics" aria-label="Resumo das alterações">
      <article>
        <span>Arquivos</span>
        <strong>{{ snapshot?.files.length ?? 0 }}</strong>
        <small>{{ filteredFiles.length }} visível(is)</small>
      </article>
      <article class="is-addition">
        <span>Adições</span>
        <strong>+{{ totalAdditions }}</strong>
        <small>linhas adicionadas</small>
      </article>
      <article class="is-deletion">
        <span>Remoções</span>
        <strong>−{{ totalDeletions }}</strong>
        <small>linhas removidas</small>
      </article>
      <article>
        <span>Binários</span>
        <strong>{{ binaryCount }}</strong>
        <small>sem visualização inline</small>
      </article>
    </div>

    <div class="git-diff-toolbar">
      <label class="git-diff-file-search">
        <MagnifyingGlassIcon aria-hidden="true" />
        <input
          v-model="fileSearch"
          type="search"
          placeholder="Buscar arquivo ou caminho…"
          aria-label="Buscar arquivos alterados"
        />
      </label>

      <label class="git-diff-status-filter">
        <FunnelIcon aria-hidden="true" />
        <select v-model="statusFilter" aria-label="Filtrar arquivos por status">
          <option
            v-for="option in statusOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
    </div>

    <div v-if="loadingSnapshot && !snapshot" class="git-diff-empty">
      <ArrowPathIcon class="spinning" aria-hidden="true" />
      <strong>Carregando alterações</strong>
      <span>Consultando arquivos staged e o working tree.</span>
    </div>

    <div v-else-if="snapshot && snapshot.files.length === 0" class="git-diff-empty">
      <DocumentTextIcon aria-hidden="true" />
      <strong>Nenhuma alteração neste escopo</strong>
      <span>{{ currentScope.description }} não possui arquivos para revisar.</span>
    </div>

    <div v-else-if="snapshot" class="git-diff-workspace">
      <aside class="git-diff-files-pane">
        <header>
          <div>
            <h3>Arquivos alterados</h3>
            <span>{{ filteredFiles.length }} de {{ snapshot.files.length }}</span>
          </div>
          <small>↑ ↓ para navegar</small>
        </header>

        <div
          class="git-diff-file-list"
          role="listbox"
          aria-label="Arquivos alterados"
          @keydown="handleFileListKeydown"
        >
          <button
            v-for="file in filteredFiles"
            :key="`${file.path}-${file.previousPath ?? ''}`"
            type="button"
            role="option"
            :data-git-diff-path="file.path"
            :aria-selected="selectedPath === file.path"
            :class="{ active: selectedPath === file.path }"
            @click="selectFile(file.path)"
          >
            <StatusBadge :tone="gitFileToneFor(file.status)">
              {{ statusLabels[file.status] }}
            </StatusBadge>

            <span class="git-diff-file-copy">
              <strong>{{ fileName(file.path) }}</strong>
              <small v-if="file.previousPath">
                {{ file.previousPath }} → {{ file.path }}
              </small>
              <small v-else>{{ directoryName(file.path) }}</small>
            </span>

            <span class="git-diff-file-stats">
              <template v-if="file.binary">binário</template>
              <template v-else>
                <b>+{{ file.additions }}</b>
                <i>−{{ file.deletions }}</i>
              </template>
            </span>
          </button>

          <div v-if="filteredFiles.length === 0" class="git-diff-list-empty">
            Nenhum arquivo corresponde aos filtros.
          </div>
        </div>
      </aside>

      <main class="git-diff-viewer">
        <template v-if="selectedFile">
          <header class="git-diff-file-header">
            <div class="git-diff-selected-file">
              <StatusBadge :tone="gitFileToneFor(selectedFile.status)">
                {{ statusLabels[selectedFile.status] }}
              </StatusBadge>
              <div>
                <h3>{{ selectedFile.path }}</h3>
                <p v-if="selectedFile.previousPath">
                  Renomeado de {{ selectedFile.previousPath }}
                </p>
                <p v-else>
                  {{ selectedFile.binary ? 'Arquivo binário' : `+${selectedFile.additions} / −${selectedFile.deletions} linhas` }}
                </p>
              </div>
            </div>

            <button
              type="button"
              class="git-diff-copy-button"
              :title="copied ? 'Caminho copiado' : 'Copiar caminho do arquivo'"
              @click="copySelectedPath"
            >
              <ClipboardDocumentIcon aria-hidden="true" />
              {{ copied ? 'Copiado' : 'Copiar caminho' }}
            </button>
          </header>

          <div class="git-diff-viewer-toolbar">
            <div class="git-diff-view-switch" aria-label="Modo de visualização">
              <button
                type="button"
                :class="{ active: viewMode === 'unified' }"
                :aria-pressed="viewMode === 'unified'"
                @click="viewMode = 'unified'"
              >
                <Bars3BottomLeftIcon aria-hidden="true" />
                Unificado
              </button>
              <button
                type="button"
                :class="{ active: viewMode === 'split' }"
                :aria-pressed="viewMode === 'split'"
                @click="viewMode = 'split'"
              >
                <ViewColumnsIcon aria-hidden="true" />
                Lado a lado
              </button>
            </div>

            <label class="git-diff-content-search">
              <MagnifyingGlassIcon aria-hidden="true" />
              <input
                v-model="diffSearch"
                type="search"
                placeholder="Buscar neste diff…"
                aria-label="Buscar dentro do diff"
              />
              <span v-if="diffSearch.trim()">
                {{ diffMatchCount }} ocorrência(s)
              </span>
            </label>
          </div>

          <p v-if="fileError" class="project-error git-diff-file-error" role="alert">
            {{ fileError }}
          </p>

          <div v-else-if="loadingFile" class="git-diff-detail-empty">
            <ArrowPathIcon class="spinning" aria-hidden="true" />
            Carregando {{ selectedPath }}…
          </div>

          <div v-else-if="fileDiff?.binary" class="git-diff-detail-empty">
            <DocumentTextIcon aria-hidden="true" />
            <strong>Diff binário não disponível</strong>
            <span>O arquivo pode ser revisado pelo editor ou ferramenta Git externa.</span>
          </div>

          <template v-else-if="fileDiff">
            <div v-if="fileDiff.masked || fileDiff.truncated" class="git-diff-warnings">
              <p v-if="fileDiff.masked">
                {{ fileDiff.redactionCount }} possível(is) segredo(s) foram mascarados.
              </p>
              <p v-if="fileDiff.truncated">
                O diff foi truncado para manter a interface responsiva.
              </p>
            </div>

            <div v-if="!fileDiff.content.trim()" class="git-diff-detail-empty">
              <DocumentTextIcon aria-hidden="true" />
              <strong>Diff textual vazio</strong>
              <span>O arquivo pode conter apenas mudança de modo ou metadados.</span>
            </div>

            <div
              v-else-if="viewMode === 'unified'"
              class="git-diff-unified"
              role="table"
              aria-label="Diff unificado"
            >
              <div
                v-for="(line, index) in unifiedLines"
                :key="`${index}-${line.oldLine ?? ''}-${line.newLine ?? ''}`"
                class="git-diff-unified-row"
                :class="`is-${line.kind}`"
                role="row"
              >
                <span class="git-diff-line-number" role="cell">{{ line.oldLine ?? '' }}</span>
                <span class="git-diff-line-number" role="cell">{{ line.newLine ?? '' }}</span>
                <span class="git-diff-line-prefix" role="cell">{{ linePrefix(line.kind) }}</span>
                <code role="cell" v-html="highlighted(line.text)" />
              </div>
            </div>

            <div
              v-else
              class="git-diff-split"
              role="table"
              aria-label="Diff lado a lado"
            >
              <template
                v-for="(row, index) in splitRows"
                :key="`${index}-${row.left?.oldLine ?? ''}-${row.right?.newLine ?? ''}`"
              >
                <div v-if="row.kind === 'meta'" class="git-diff-split-meta">
                  <code v-html="highlighted(row.left?.text ?? row.right?.text ?? '')" />
                </div>

                <div v-else class="git-diff-split-row">
                  <div
                    class="git-diff-side-cell"
                    :class="row.left ? `is-${row.left.kind}` : 'is-empty'"
                  >
                    <span class="git-diff-line-number">{{ row.left?.oldLine ?? '' }}</span>
                    <span class="git-diff-line-prefix">{{ row.left ? linePrefix(row.left.kind) : '' }}</span>
                    <code v-if="row.left" v-html="highlighted(row.left.text)" />
                  </div>
                  <div
                    class="git-diff-side-cell"
                    :class="row.right ? `is-${row.right.kind}` : 'is-empty'"
                  >
                    <span class="git-diff-line-number">{{ row.right?.newLine ?? '' }}</span>
                    <span class="git-diff-line-prefix">{{ row.right ? linePrefix(row.right.kind) : '' }}</span>
                    <code v-if="row.right" v-html="highlighted(row.right.text)" />
                  </div>
                </div>
              </template>
            </div>
          </template>
        </template>

        <div v-else class="git-diff-detail-empty">
          <DocumentTextIcon aria-hidden="true" />
          <strong>Selecione um arquivo</strong>
          <span>O conteúdo alterado aparecerá neste painel.</span>
        </div>
      </main>
    </div>
  </section>
</template>

<style scoped src="./ProjectGitDiffPage.css"></style>
