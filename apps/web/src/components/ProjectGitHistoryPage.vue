<script setup lang="ts">
import {
  ArrowPathIcon,
  Bars3BottomLeftIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  MagnifyingGlassIcon,
  ViewColumnsIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';
import {
  computed,
  onBeforeUnmount,
  reactive,
  ref,
  watch,
} from 'vue';

import type {
  GitCommitDetailFile,
  GitCommitDetails,
  GitCommitFileDiff,
  GitCommitHistoryEntry,
  GitCommitHistoryKind,
  GitCommitHistoryPage,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

import type { ProjectGitHistoryScope } from '../api';
import {
  fetchProjectGitCommitDetail,
  fetchProjectGitCommitFileDiff,
  fetchProjectGitCommits,
} from '../api';
import { fetchProjectGitWorkspace } from '../api/git-workspace';
import { gitFileToneFor } from '../utils/status-tones';
import GitFileDiffView from './GitFileDiffView.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{
  projectId: string;
}>();

const PAGE_SIZE = 20;
const VIEW_MODE_KEY = 'dev-dashboard-git-history-view-mode';

type DiffViewMode = 'unified' | 'split';

interface FileState {
  file: GitCommitDetailFile;
  loading: boolean;
  error: string;
  diff: GitCommitFileDiff | null;
}

const history = ref<GitCommitHistoryPage | null>(null);
const workspace = ref<ProjectGitWorkspace | null>(null);
const reference = ref('');
const search = ref('');
const author = ref('');
const kind = ref<GitCommitHistoryKind>('all');
/** Como hoje, a tela abre nos commits que só existem nesta branch. */
const scope = ref<ProjectGitHistoryScope>('exclusive');
const page = ref(1);
const loading = ref(false);
const errorMessage = ref('');

const detail = ref<GitCommitDetails | null>(null);
const detailLoading = ref(false);
const detailError = ref('');
const selectedHash = ref('');
const fileStates = ref<FileState[]>([]);
const selectedFilePath = ref('');
const viewMode = ref<DiffViewMode>(readStoredViewMode());
const copiedHash = ref('');

let historyController: AbortController | undefined;
let detailController: AbortController | undefined;
let copyTimer: ReturnType<typeof setTimeout> | undefined;

const statusLabels: Record<GitCommitDetailFile['status'], string> = {
  added: 'Adicionado',
  modified: 'Modificado',
  deleted: 'Removido',
  renamed: 'Renomeado',
  copied: 'Copiado',
  'type-changed': 'Tipo alterado',
};

const scopeOptions: Array<{ value: ProjectGitHistoryScope; label: string }> = [
  { value: 'exclusive', label: 'Commits exclusivos' },
  { value: 'all', label: 'Todos da referência' },
];

const kindOptions: Array<{ value: GitCommitHistoryKind; label: string }> = [
  { value: 'all', label: 'Todos os commits' },
  { value: 'regular', label: 'Sem merges' },
  { value: 'merge', label: 'Somente merges' },
];

function readStoredViewMode(): DiffViewMode {
  try {
    return window.localStorage.getItem(VIEW_MODE_KEY) === 'split' ? 'split' : 'unified';
  } catch {
    return 'unified';
  }
}

function selectViewMode(mode: DiffViewMode): void {
  viewMode.value = mode;
  try {
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // Preferência visual opcional.
  }
}

const branchGroups = computed(() => {
  const branches = workspace.value?.branches ?? [];
  return [
    { label: 'Branches locais', items: branches.filter((branch) => branch.kind === 'local') },
    { label: 'Origin', items: branches.filter((branch) => branch.kind === 'remote' && branch.remote === 'origin') },
    {
      label: 'Outros remotos',
      items: branches.filter((branch) => branch.kind === 'remote' && branch.remote !== 'origin'),
    },
  ].filter((group) => group.items.length > 0);
});

const authorOptions = computed(() => {
  const names = new Map<string, string>();
  for (const commit of history.value?.commits ?? []) {
    if (!names.has(commit.authorEmail)) names.set(commit.authorEmail, commit.authorName);
  }
  return [...names.entries()].map(([email, name]) => ({ email, name }));
});

/** `%B` traz a mensagem inteira; o assunto já aparece no título do modal. */
const commitBody = computed(() => {
  const body = detail.value?.body ?? '';
  const subject = detail.value?.subject ?? '';
  return (body.startsWith(subject) ? body.slice(subject.length) : body).trim();
});

const totalPages = computed(() => Math.max(1, history.value?.totalPages ?? 1));

/**
 * Repositórios grandes têm centenas de páginas: mostramos uma janela ao redor
 * da atual, com as pontas sempre acessíveis.
 */
const pageWindow = computed<Array<number | 'gap'>>(() => {
  const total = totalPages.value;
  const current = page.value;
  if (total <= 7) return Array.from({ length: total }, (_unused, index) => index + 1);

  const pages = new Set<number>([1, total, current]);
  for (const offset of [-1, 1]) {
    const target = current + offset;
    if (target > 1 && target < total) pages.add(target);
  }
  if (current <= 3) [2, 3, 4].forEach((item) => pages.add(item));
  if (current >= total - 2) [total - 3, total - 2, total - 1].forEach((item) => pages.add(item));

  const ordered = [...pages].filter((item) => item >= 1 && item <= total).sort((left, right) => left - right);
  const result: Array<number | 'gap'> = [];
  let previous = 0;
  for (const item of ordered) {
    if (previous && item - previous > 1) result.push('gap');
    result.push(item);
    previous = item;
  }
  return result;
});

const rangeLabel = computed(() => {
  const total = history.value?.total ?? 0;
  if (total === 0) return 'Nenhum commit encontrado';
  const first = (page.value - 1) * PAGE_SIZE + 1;
  const last = Math.min(total, first + (history.value?.commits.length ?? 0) - 1);
  return `Mostrando ${first} a ${last} de ${total} commits`;
});

interface CommitDay {
  key: string;
  label: string;
  commits: GitCommitHistoryEntry[];
}

const commitDays = computed<CommitDay[]>(() => {
  const days = new Map<string, CommitDay>();
  for (const commit of history.value?.commits ?? []) {
    const date = new Date(commit.authoredAt);
    const key = Number.isNaN(date.getTime())
      ? 'desconhecida'
      : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (!days.has(key)) {
      days.set(key, {
        key,
        label: Number.isNaN(date.getTime())
          ? 'Data desconhecida'
          : date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        commits: [],
      });
    }
    days.get(key)!.commits.push(commit);
  }
  return [...days.values()];
});

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '--:--'
    : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatFullDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Data desconhecida'
    : date.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
}

/** "há 2 horas", "há 1 dia" — a mesma leitura rápida da coluna Tempo. */
function relativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'desconhecido';
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'agora';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} hora${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  if (days < 30) return `há ${days} dia${days === 1 ? '' : 's'}`;
  const months = Math.round(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? 'mês' : 'meses'}`;
  const years = Math.round(months / 12);
  return `há ${years} ano${years === 1 ? '' : 's'}`;
}

function fileName(filePath: string): string {
  return filePath.split('/').filter(Boolean).at(-1) ?? filePath;
}

function directoryName(filePath: string): string {
  const parts = filePath.split('/').filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
}

function authorInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('pt-BR') ?? '')
    .join('') || '?';
}

async function loadWorkspace(): Promise<void> {
  try {
    workspace.value = await fetchProjectGitWorkspace(props.projectId);
  } catch {
    workspace.value = null;
  }
}

async function loadHistory(targetPage = page.value): Promise<void> {
  historyController?.abort();
  const controller = new AbortController();
  historyController = controller;
  loading.value = true;
  errorMessage.value = '';

  try {
    const result = await fetchProjectGitCommits(
      props.projectId,
      {
        ...(reference.value ? { ref: reference.value } : {}),
        page: targetPage,
        pageSize: PAGE_SIZE,
        ...(search.value.trim() ? { search: search.value.trim() } : {}),
        ...(author.value ? { author: author.value } : {}),
        kind: kind.value,
      },
      controller.signal,
      scope.value,
    );
    if (controller.signal.aborted) return;
    history.value = result;
    page.value = result.page;
    if (!reference.value) reference.value = result.branch;
  } catch (error) {
    if (controller.signal.aborted) return;
    history.value = null;
    errorMessage.value = error instanceof Error
      ? error.message
      : 'Não foi possível carregar o histórico do repositório.';
  } finally {
    if (!controller.signal.aborted) loading.value = false;
  }
}

async function openCommit(commit: GitCommitHistoryEntry): Promise<void> {
  detailController?.abort();
  const controller = new AbortController();
  detailController = controller;
  selectedHash.value = commit.hash;
  detail.value = null;
  fileStates.value = [];
  selectedFilePath.value = '';
  detailError.value = '';
  detailLoading.value = true;

  try {
    const result = await fetchProjectGitCommitDetail(props.projectId, commit.hash, controller.signal);
    if (controller.signal.aborted) return;
    detail.value = result;
    fileStates.value = result.files.map((file) => reactive<FileState>({
      file,
      loading: false,
      error: '',
      diff: null,
    }));
    // O diff do primeiro arquivo já aparece: o modal nunca abre vazio.
    const first = fileStates.value[0];
    selectedFilePath.value = first?.file.path ?? '';
    if (first) void loadFileDiff(first);
  } catch (error) {
    if (controller.signal.aborted) return;
    detailError.value = error instanceof Error
      ? error.message
      : 'Não foi possível carregar os detalhes do commit.';
  } finally {
    if (!controller.signal.aborted) detailLoading.value = false;
  }
}

function closeCommit(): void {
  detailController?.abort();
  selectedHash.value = '';
  detail.value = null;
  fileStates.value = [];
  selectedFilePath.value = '';
  detailError.value = '';
}

async function loadFileDiff(state: FileState): Promise<void> {
  if (state.diff || state.loading || !detail.value) return;
  state.loading = true;
  state.error = '';
  try {
    state.diff = await fetchProjectGitCommitFileDiff(
      props.projectId,
      detail.value.hash,
      state.file.path,
    );
  } catch (error) {
    state.error = error instanceof Error
      ? error.message
      : 'Não foi possível carregar o diff deste arquivo.';
  } finally {
    state.loading = false;
  }
}

const selectedFile = computed(() =>
  fileStates.value.find((state) => state.file.path === selectedFilePath.value) ?? null,
);

function selectFile(path: string): void {
  selectedFilePath.value = path;
  const state = fileStates.value.find((item) => item.file.path === path);
  if (state) void loadFileDiff(state);
}

async function copyHash(hash: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(hash);
    copiedHash.value = hash;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copiedHash.value = ''; }, 1_800);
  } catch {
    copiedHash.value = '';
  }
}

function goToPage(target: number): void {
  const next = Math.min(totalPages.value, Math.max(1, target));
  if (next === page.value) return;
  void loadHistory(next);
}

function applyFilters(): void {
  void loadHistory(1);
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && selectedHash.value) closeCommit();
}

watch(
  () => props.projectId,
  () => {
    reference.value = '';
    search.value = '';
    author.value = '';
    kind.value = 'all';
    scope.value = 'exclusive';
    page.value = 1;
    closeCommit();
    void loadWorkspace();
    void loadHistory(1);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  historyController?.abort();
  detailController?.abort();
  if (copyTimer) clearTimeout(copyTimer);
});
</script>

<template>
  <section class="git-history-page" @keydown="handleKeydown">
    <div class="git-history-toolbar">
      <label class="git-history-reference">
        <select v-model="reference" aria-label="Referência do histórico" @change="applyFilters">
          <optgroup v-for="group in branchGroups" :key="group.label" :label="group.label">
            <option v-for="branch in group.items" :key="branch.name" :value="branch.name">
              {{ branch.current ? `✓ ${branch.name}` : branch.name }}
            </option>
          </optgroup>
          <option v-if="branchGroups.length === 0" :value="reference">{{ reference || 'HEAD' }}</option>
        </select>
      </label>

      <span class="git-history-count">{{ history?.total ?? 0 }} commits</span>

      <label class="git-history-search">
        <MagnifyingGlassIcon aria-hidden="true" />
        <input
          v-model="search"
          type="search"
          placeholder="Buscar commits por mensagem ou hash…"
          aria-label="Buscar commits"
          @keyup.enter="applyFilters"
          @search="applyFilters"
        />
      </label>

      <label class="git-history-filter">
        <select v-model="scope" aria-label="Escopo do histórico" @change="applyFilters">
          <option v-for="option in scopeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="git-history-filter">
        <select v-model="author" aria-label="Filtrar por autor" @change="applyFilters">
          <option value="">Todos os autores</option>
          <option v-for="item in authorOptions" :key="item.email" :value="item.email">
            {{ item.name }}
          </option>
        </select>
      </label>

      <label class="git-history-filter">
        <select v-model="kind" aria-label="Filtrar por tipo de commit" @change="applyFilters">
          <option v-for="option in kindOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <button class="git-history-refresh" type="button" :disabled="loading" @click="loadHistory()">
        <ArrowPathIcon :class="{ spinning: loading }" aria-hidden="true" />
        {{ loading ? 'Atualizando…' : 'Atualizar' }}
      </button>
    </div>

    <p v-if="errorMessage" class="project-error" role="alert">{{ errorMessage }}</p>

    <div v-if="loading && !history" class="git-history-empty">
      <ArrowPathIcon class="spinning" aria-hidden="true" />
      Carregando commits…
    </div>

    <div v-else-if="(history?.commits.length ?? 0) === 0" class="git-history-empty">
      <DocumentTextIcon aria-hidden="true" />
      <strong>Nenhum commit encontrado</strong>
      <span>Ajuste a referência ou os filtros aplicados.</span>
    </div>

    <template v-else>
      <div class="git-history-table-wrapper">
        <table class="git-history-table" data-git-action-feedback="off">
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Commit</th>
            <th scope="col">Autor</th>
            <th scope="col">Tempo</th>
            <th scope="col"><span class="visually-hidden">Abrir</span></th>
          </tr>
        </thead>
        <tbody v-for="day in commitDays" :key="day.key">
          <tr class="git-history-day">
            <th colspan="5" scope="colgroup">
              {{ day.label }}
              <span>{{ day.commits.length }} commit{{ day.commits.length === 1 ? '' : 's' }}</span>
            </th>
          </tr>
          <tr
            v-for="commit in day.commits"
            :key="commit.hash"
            class="git-history-row"
            :class="{ active: selectedHash === commit.hash }"
            tabindex="0"
            role="button"
            :aria-label="`Abrir commit ${commit.shortHash}`"
            @click="openCommit(commit)"
            @keydown.enter="openCommit(commit)"
            @keydown.space.prevent="openCommit(commit)"
          >
            <td class="git-history-time">{{ formatTime(commit.authoredAt) }}</td>
            <td class="git-history-subject">
              <span class="git-history-subject-inner">
                <code>{{ commit.shortHash }}</code>
                <span class="git-history-subject-text">{{ commit.subject }}</span>
                <em v-if="commit.parentCount >= 2">merge</em>
              </span>
            </td>
            <td class="git-history-author">
              <span class="git-history-avatar" aria-hidden="true">{{ authorInitials(commit.authorName) }}</span>
              <span class="git-history-author-name" :title="commit.authorEmail">{{ commit.authorName }}</span>
            </td>
            <td class="git-history-relative" :title="formatFullDate(commit.authoredAt)">
              {{ relativeTime(commit.authoredAt) }}
            </td>
            <td class="git-history-chevron" aria-hidden="true">›</td>
          </tr>
        </tbody>
        </table>
      </div>

      <nav class="git-history-pagination" aria-label="Paginação do histórico">
        <span>{{ rangeLabel }}</span>
        <div>
          <button type="button" :disabled="page <= 1 || loading" @click="goToPage(page - 1)">Anterior</button>
          <template v-for="(target, index) in pageWindow" :key="`${target}-${index}`">
            <span v-if="target === 'gap'" class="git-history-pagination-gap" aria-hidden="true">…</span>
            <button
              v-else
              type="button"
              :class="{ active: target === page }"
              :aria-current="target === page ? 'page' : undefined"
              :disabled="loading"
              @click="goToPage(target)"
            >
              {{ target }}
            </button>
          </template>
          <button type="button" :disabled="page >= totalPages || loading" @click="goToPage(page + 1)">Próxima</button>
        </div>
      </nav>
    </template>

    <Teleport to="body">
      <div
        v-if="selectedHash"
        class="git-history-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Detalhes do commit"
        data-git-action-feedback="off"
        @click.self="closeCommit"
      >
      <article class="git-history-modal">
        <header class="git-history-modal-head">
          <div class="git-history-modal-title">
            <div class="git-history-modal-hash">
              <code>{{ detail?.shortHash ?? selectedHash.slice(0, 7) }}</code>
              <button
                type="button"
                class="git-history-copy"
                :title="copiedHash === (detail?.hash ?? selectedHash) ? 'Hash copiado' : 'Copiar hash'"
                :aria-label="`Copiar hash ${detail?.shortHash ?? selectedHash.slice(0, 7)}`"
                @click="copyHash(detail?.hash ?? selectedHash)"
              >
                <ClipboardDocumentIcon aria-hidden="true" />
              </button>
            </div>
            <h3>{{ detail?.subject ?? 'Carregando commit…' }}</h3>
            <p v-if="detail">
              {{ detail.authorName }} &lt;{{ detail.authorEmail }}&gt; · {{ formatFullDate(detail.authoredAt) }}
            </p>
          </div>

          <button type="button" class="git-history-close" aria-label="Fechar detalhes" @click="closeCommit">
            <XMarkIcon aria-hidden="true" />
          </button>
        </header>

        <div class="git-history-modal-body">
          <p v-if="detailError" class="project-error" role="alert">{{ detailError }}</p>

          <div v-else-if="detailLoading" class="git-history-empty">
            <ArrowPathIcon class="spinning" aria-hidden="true" />
            Carregando detalhes…
          </div>

          <template v-else-if="detail">
            <pre v-if="commitBody" class="git-history-commit-body">{{ commitBody }}</pre>

            <div v-if="detail.masked" class="git-history-notice">
              {{ detail.redactionCount }} possível(is) segredo(s) foram mascarados.
            </div>

            <header class="git-history-files-head">
              <strong>Arquivos alterados ({{ detail.files.length }})</strong>
              <span class="git-history-delta">
                <b class="is-addition">+{{ detail.additions }}</b>
                <b class="is-deletion">−{{ detail.deletions }}</b>
              </span>
              <div class="git-diff-view-switch" aria-label="Modo de visualização">
                <button
                  type="button"
                  :class="{ active: viewMode === 'unified' }"
                  :aria-pressed="viewMode === 'unified'"
                  @click="selectViewMode('unified')"
                >
                  <Bars3BottomLeftIcon aria-hidden="true" />
                  Unificado
                </button>
                <button
                  type="button"
                  :class="{ active: viewMode === 'split' }"
                  :aria-pressed="viewMode === 'split'"
                  @click="selectViewMode('split')"
                >
                  <ViewColumnsIcon aria-hidden="true" />
                  Lado a lado
                </button>
              </div>
            </header>

            <p v-if="detail.files.length === 0" class="git-history-empty">
              Este commit não alterou arquivos.
            </p>

            <div v-else class="git-history-diff-layout">
              <label class="git-history-file-select">
                <span class="visually-hidden">Arquivo do commit</span>
                <select
                  :value="selectedFilePath"
                  @change="selectFile(($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="state in fileStates" :key="state.file.path" :value="state.file.path">
                    {{ state.file.path }} (+{{ state.file.additions }} −{{ state.file.deletions }})
                  </option>
                </select>
              </label>

              <nav class="git-history-file-list" aria-label="Arquivos do commit">
                <button
                  v-for="state in fileStates"
                  :key="state.file.path"
                  type="button"
                  :class="{ active: state.file.path === selectedFilePath }"
                  :aria-current="state.file.path === selectedFilePath ? 'true' : undefined"
                  @click="selectFile(state.file.path)"
                >
                  <span class="git-history-file-name" :title="state.file.path">
                    {{ fileName(state.file.path) }}
                  </span>
                  <span class="git-history-file-dir">{{ directoryName(state.file.path) }}</span>
                  <span v-if="state.file.binary" class="git-history-file-counts">binário</span>
                  <span v-else class="git-history-file-counts git-history-delta">
                    <b class="is-addition">+{{ state.file.additions }}</b>
                    <b class="is-deletion">−{{ state.file.deletions }}</b>
                  </span>
                </button>
              </nav>

              <section v-if="selectedFile" class="git-history-diff-pane">
                <header class="git-history-diff-pane-head">
                  <span class="git-history-file-path" :title="selectedFile.file.path">
                    {{ selectedFile.file.path }}
                    <small v-if="selectedFile.file.previousPath">
                      de {{ selectedFile.file.previousPath }}
                    </small>
                  </span>
                  <StatusBadge :tone="gitFileToneFor(selectedFile.file.status)">
                    {{ statusLabels[selectedFile.file.status] }}
                  </StatusBadge>
                </header>

                <div class="git-history-file-body">
                  <p v-if="selectedFile.error" class="project-error" role="alert">
                    {{ selectedFile.error }}
                  </p>

                  <div v-else-if="selectedFile.loading" class="git-history-empty">
                    <ArrowPathIcon class="spinning" aria-hidden="true" />
                    Carregando diff…
                  </div>

                  <div v-else-if="selectedFile.diff?.binary" class="git-history-empty">
                    Diff binário não disponível.
                  </div>

                  <template v-else-if="selectedFile.diff">
                    <div v-if="selectedFile.diff.truncated" class="git-history-notice">
                      O diff foi truncado para manter a interface responsiva.
                    </div>
                    <GitFileDiffView
                      :content="selectedFile.diff.content"
                      :path="selectedFile.file.path"
                      :view-mode="viewMode"
                    />
                  </template>
                </div>
              </section>
            </div>

            <footer class="git-history-legend">
              <span><i class="is-addition">+</i> Adicionado</span>
              <span><i class="is-deletion">−</i> Removido</span>
              <span><i class="is-context">@</i> Contexto</span>
            </footer>
          </template>
        </div>
      </article>
      </div>
    </Teleport>
  </section>
</template>

<style scoped src="./ProjectGitHistoryPage.css"></style>
<style src="./ProjectGitHistoryModal.css"></style>
