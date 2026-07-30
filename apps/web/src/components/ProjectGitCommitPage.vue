<script setup lang="ts">
import {
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  DocumentMagnifyingGlassIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';
import {
  computed,
  ref,
} from 'vue';

import type {
  GitFileChange,
  ProjectGitOverview,
} from '@dev-dashboard/contracts';

type CommitFilter = 'all' | 'staged' | 'modified' | 'untracked';
type CommitScope = 'staged' | 'all';
type FileMutation = 'stage' | 'unstage' | 'discard' | 'remove';

const props = defineProps<{
  overview: ProjectGitOverview;
  busy: boolean;
  message: string;
  includeTracked: boolean;
  scope: CommitScope;
}>();

const emit = defineEmits<{
  'update:message': [value: string];
  'update:includeTracked': [value: boolean];
  'update:scope': [value: CommitScope];
  submit: [];
  fileMutation: [payload: { operation: FileMutation; path: string }];
  viewDiff: [path: string];
}>();

const activeFilter = ref<CommitFilter>('all');
const search = ref('');

const conventionalTypes = [
  'feat',
  'fix',
  'refactor',
  'chore',
  'docs',
  'test',
] as const;

const stagedFiles = computed(() =>
  props.overview.files.filter(isStaged),
);

const untrackedFiles = computed(() =>
  props.overview.files.filter((file) => file.status === 'untracked'),
);

const modifiedFiles = computed(() =>
  props.overview.files.filter((file) =>
    !isStaged(file) && file.status !== 'untracked',
  ),
);

const groups = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('pt-BR');
  const definitions = [
    {
      id: 'staged' as const,
      label: 'Staged',
      files: stagedFiles.value,
    },
    {
      id: 'modified' as const,
      label: 'Modificados',
      files: modifiedFiles.value,
    },
    {
      id: 'untracked' as const,
      label: 'Novos',
      files: untrackedFiles.value,
    },
  ];

  return definitions
    .filter((group) =>
      activeFilter.value === 'all' || activeFilter.value === group.id,
    )
    .map((group) => ({
      ...group,
      files: group.files.filter((file) =>
        !query
        || file.path.toLocaleLowerCase('pt-BR').includes(query)
        || file.previousPath?.toLocaleLowerCase('pt-BR').includes(query),
      ),
    }))
    .filter((group) => group.files.length > 0);
});

const selectedType = computed(() => {
  const match = /^(feat|fix|refactor|chore|docs|test)(?:\([^)]*\))?:\s/.exec(
    props.message,
  );
  return match?.[1] ?? '';
});

const readyCount = computed(() =>
  props.scope === 'all'
    ? props.overview.files.length
    : stagedFiles.value.length,
);

const canCommit = computed(() =>
  props.message.trim().length > 0
  && readyCount.value > 0
  && !props.busy,
);

function isStaged(file: GitFileChange): boolean {
  return file.indexStatus !== '.' && file.indexStatus !== '?';
}

function selectType(type: typeof conventionalTypes[number]): void {
  const withoutType = props.message.replace(
    /^(?:feat|fix|refactor|chore|docs|test)(?:\([^)]*\))?:\s*/,
    '',
  );
  emit('update:message', `${type}: ${withoutType}`);
}

function updateMessage(event: Event): void {
  emit('update:message', (event.target as HTMLTextAreaElement).value);
}

function updateIncludeTracked(event: Event): void {
  emit(
    'update:includeTracked',
    (event.target as HTMLInputElement).checked,
  );
}

function toggleStage(file: GitFileChange): void {
  emit('fileMutation', {
    operation: isStaged(file) ? 'unstage' : 'stage',
    path: file.path,
  });
}

function fileState(file: GitFileChange): string {
  if (isStaged(file)) return 'Staged';
  if (file.status === 'untracked') return 'Novo';
  return 'Modificado';
}
</script>

<template>
  <section class="git-commit-page">
    <header class="git-commit-heading">
      <div>
        <span>Commit</span>
        <h2>Preparar e registrar alterações</h2>
        <p>Selecione os arquivos, prepare a mensagem e confirme o commit.</p>
        <div class="git-commit-summary" aria-label="Resumo das alterações">
          <strong>Branch atual: {{ overview.branch ?? 'HEAD' }}</strong>
          <span aria-hidden="true">•</span>
          <span class="staged">{{ stagedFiles.length }} staged</span>
          <span aria-hidden="true">•</span>
          <span class="modified">{{ modifiedFiles.length }} modificados</span>
          <span aria-hidden="true">•</span>
          <span class="untracked">{{ untrackedFiles.length }} novos</span>
        </div>
      </div>

      <ol class="git-commit-steps" aria-label="Etapas do commit">
        <li class="active"><b>1</b><span>Selecionar arquivos</span></li>
        <li :class="{ active: readyCount > 0 }"><b>2</b><span>Preparar mensagem</span></li>
        <li :class="{ active: canCommit }"><b>3</b><span>Confirmar</span></li>
      </ol>
    </header>

    <section class="git-commit-files">
      <div class="git-commit-files-toolbar">
        <div class="git-commit-filter-tabs" role="tablist" aria-label="Filtrar arquivos">
          <button
            v-for="filter in [
              { id: 'all', label: 'Todos', count: overview.files.length },
              { id: 'staged', label: 'Staged', count: stagedFiles.length },
              { id: 'modified', label: 'Modificados', count: modifiedFiles.length },
              { id: 'untracked', label: 'Novos', count: untrackedFiles.length },
            ]"
            :key="filter.id"
            type="button"
            :class="{ active: activeFilter === filter.id }"
            @click="activeFilter = filter.id as CommitFilter"
          >
            {{ filter.label }} <small>{{ filter.count }}</small>
          </button>
        </div>

        <label class="git-commit-search">
          <span class="sr-only">Buscar arquivo alterado</span>
          <input v-model="search" type="search" placeholder="Buscar arquivo alterado…" />
        </label>
      </div>

      <div v-if="overview.files.length === 0" class="git-commit-empty">
        <CheckCircleIcon aria-hidden="true" />
        <div>
          <strong>Working tree limpo</strong>
          <p>Não há alterações para preparar.</p>
        </div>
      </div>

      <div v-else-if="groups.length === 0" class="git-commit-empty">
        Nenhum arquivo corresponde ao filtro.
      </div>

      <div v-else class="git-commit-file-groups">
        <section v-for="group in groups" :key="group.id">
          <header>
            <span :class="group.id" aria-hidden="true" />
            <strong>{{ group.label }} ({{ group.files.length }})</strong>
          </header>
          <ul>
            <li
              v-for="file in group.files"
              :key="`${file.path}-${file.previousPath ?? ''}`"
              class="git-commit-file-row"
            >
              <label class="git-commit-stage-toggle" :title="isStaged(file) ? 'Remover do staged' : 'Adicionar ao staged'">
                <input
                  type="checkbox"
                  :checked="isStaged(file)"
                  :disabled="busy"
                  @change="toggleStage(file)"
                />
                <span class="sr-only">
                  {{ isStaged(file) ? 'Remover do staged' : 'Adicionar ao staged' }}
                </span>
              </label>

              <code>
                <small v-if="file.previousPath">{{ file.previousPath }} →</small>
                {{ file.path }}
              </code>

              <span class="git-commit-file-state" :class="group.id">
                {{ fileState(file) }}
              </span>

              <small class="git-commit-file-code">
                {{ file.indexStatus }}/{{ file.worktreeStatus }}
              </small>

              <div class="git-commit-file-actions">
                <button
                  type="button"
                  class="git-commit-diff-button"
                  @click="emit('viewDiff', file.path)"
                >
                  <DocumentMagnifyingGlassIcon aria-hidden="true" />
                  Ver diferença
                </button>
                <button
                  v-if="group.id === 'modified'"
                  type="button"
                  class="git-commit-danger-button"
                  :disabled="busy"
                  @click="emit('fileMutation', { operation: 'discard', path: file.path })"
                >
                  <ArrowUturnLeftIcon aria-hidden="true" />
                  Desfazer alterações
                </button>
                <button
                  v-if="group.id === 'untracked'"
                  type="button"
                  class="git-commit-danger-button"
                  :disabled="busy"
                  @click="emit('fileMutation', { operation: 'remove', path: file.path })"
                >
                  <TrashIcon aria-hidden="true" />
                  Remover arquivo
                </button>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </section>

    <form class="git-commit-composer" @submit.prevent="emit('submit')">
      <section>
        <h3>Escrever mensagem do commit</h3>
        <div class="git-commit-types" aria-label="Tipo de alteração">
          <button
            v-for="type in conventionalTypes"
            :key="type"
            type="button"
            :class="{ active: selectedType === type }"
            @click="selectType(type)"
          >
            {{ type }}
          </button>
        </div>
        <textarea
          :value="message"
          maxlength="500"
          placeholder="Descreva as alterações"
          @input="updateMessage"
        />
        <small class="git-commit-character-count">{{ message.length }}/500</small>
      </section>

      <aside>
        <span>Branch</span>
        <strong>{{ overview.branch ?? 'HEAD' }}</strong>

        <span>Escopo do commit</span>
        <div class="git-commit-scope">
          <button
            type="button"
            :class="{ active: scope === 'staged' }"
            @click="emit('update:scope', 'staged')"
          >
            <strong>Commit staged</strong>
            <small>{{ stagedFiles.length }} arquivo(s)</small>
          </button>
          <button
            type="button"
            :class="{ active: scope === 'all' }"
            @click="emit('update:scope', 'all')"
          >
            <strong>Salvar tudo</strong>
            <small>{{ overview.files.length }} arquivo(s)</small>
          </button>
        </div>

        <label v-if="scope === 'staged'" class="git-commit-include-tracked">
          <input
            type="checkbox"
            :checked="includeTracked"
            @change="updateIncludeTracked"
          />
          Incluir alterações rastreadas
        </label>

        <p class="git-commit-readiness" :class="{ ready: canCommit }">
          <CheckCircleIcon aria-hidden="true" />
          <span v-if="readyCount > 0">
            Pronto para registrar {{ readyCount }} arquivo(s)
          </span>
          <span v-else>Selecione arquivos para continuar</span>
        </p>

        <button class="primary-button git-commit-submit" :disabled="!canCommit">
          {{ busy ? 'Criando commit…' : 'Criar commit' }}
        </button>
        <small class="git-commit-shortcut">Ctrl/⌘ + Enter para confirmar</small>
      </aside>
    </form>
  </section>
</template>

<style scoped>
.git-commit-page {
  display: grid;
  gap: var(--space-4);
  font-family: var(--font-family);
  font-size: var(--font-md);
}

.git-commit-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
}

.git-commit-heading > div > span,
.git-commit-composer aside > span {
  color: var(--text-muted);
  font-size: var(--font-sm);
  font-weight: var(--font-weight-strong);
}

.git-commit-heading h2 {
  margin: 3px 0 0;
  color: var(--text);
  font-size: var(--font-lg);
  font-weight: var(--font-weight-strong);
}

.git-commit-heading p {
  margin: 4px 0 0;
  color: var(--text-muted);
}

.git-commit-summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: var(--space-3);
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.git-commit-summary strong { color: var(--text); }
.git-commit-summary .staged { color: var(--success-text); }
.git-commit-summary .modified { color: var(--warning-text); }
.git-commit-summary .untracked { color: var(--accent); }

.git-commit-steps {
  display: flex;
  align-items: center;
  gap: 0;
  min-width: min(570px, 46vw);
  margin: 0;
  padding: 0;
  list-style: none;
}

.git-commit-steps li {
  display: flex;
  align-items: center;
  flex: 1;
  gap: 8px;
  color: var(--text-dim);
  font-size: var(--font-sm);
  white-space: nowrap;
}

.git-commit-steps li:not(:last-child)::after {
  height: 1px;
  flex: 1;
  margin: 0 14px;
  background: var(--border);
  content: '';
}

.git-commit-steps b {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--surface-2);
}

.git-commit-steps li.active {
  color: var(--accent);
  font-weight: var(--font-weight-strong);
}

.git-commit-steps li.active b {
  background: var(--accent);
  color: white;
}

.git-commit-files,
.git-commit-composer {
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
}

.git-commit-files {
  overflow: hidden;
}

.git-commit-files-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  border-bottom: 1px solid var(--border);
  padding: var(--space-3) var(--space-4);
}

.git-commit-filter-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
}

.git-commit-filter-tabs button,
.git-commit-types button {
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-muted);
  padding: 8px 12px;
  font: inherit;
}

.git-commit-filter-tabs button.active,
.git-commit-types button.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}

.git-commit-filter-tabs small {
  margin-left: 4px;
  border-radius: 999px;
  background: var(--surface-2);
  padding: 2px 6px;
}

.git-commit-search input {
  width: min(360px, 30vw);
  min-height: 38px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  color: var(--text);
  padding: 8px 12px;
  font: inherit;
}

.git-commit-file-groups {
  max-height: 355px;
  overflow: auto;
}

.git-commit-file-groups section > header {
  display: flex;
  align-items: center;
  gap: 9px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  padding: 9px var(--space-4);
}

.git-commit-file-groups section > header span {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--text-dim);
}

.git-commit-file-groups section > header span.staged { background: var(--success-text); }
.git-commit-file-groups section > header span.modified { background: var(--warning-text); }
.git-commit-file-groups section > header span.untracked { background: var(--accent); }

.git-commit-file-groups ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.git-commit-file-row {
  display: grid;
  grid-template-columns: 28px minmax(220px, 1fr) 96px 52px minmax(260px, auto);
  align-items: center;
  gap: var(--space-3);
  min-height: 52px;
  border-bottom: 1px solid var(--border);
  padding: 7px var(--space-4);
}

.git-commit-file-row:last-child { border-bottom: 0; }

.git-commit-stage-toggle {
  display: grid;
  place-items: center;
}

.git-commit-stage-toggle input {
  width: 17px;
  height: 17px;
  accent-color: var(--accent);
}

.git-commit-file-row code {
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  font-family: var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-commit-file-row code small {
  margin-right: 6px;
  color: var(--text-dim);
}

.git-commit-file-state {
  width: fit-content;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--text-muted);
  padding: 4px 8px;
  font-size: var(--font-xs);
}

.git-commit-file-state.staged {
  background: var(--success-surface);
  color: var(--success-text);
}

.git-commit-file-state.modified {
  background: var(--warning-surface);
  color: var(--warning-text);
}

.git-commit-file-state.untracked {
  background: var(--accent-soft);
  color: var(--accent);
}

.git-commit-file-code {
  color: var(--text-dim);
  font-family: var(--font-mono);
}

.git-commit-file-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
}

.git-commit-file-actions button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  padding: 6px;
  font: inherit;
}

.git-commit-file-actions svg {
  width: 17px;
  height: 17px;
}

.git-commit-diff-button { color: var(--text-muted); }
.git-commit-diff-button:hover { color: var(--accent); }
.git-commit-danger-button { color: var(--danger-text); }
.git-commit-danger-button:hover { background: var(--danger-surface); }

.git-commit-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  min-height: 160px;
  color: var(--text-muted);
}

.git-commit-empty svg {
  width: 28px;
  height: 28px;
  color: var(--success-text);
}

.git-commit-empty p { margin: 4px 0 0; }

.git-commit-composer {
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(330px, 1fr);
  overflow: hidden;
}

.git-commit-composer > section,
.git-commit-composer > aside {
  display: grid;
  align-content: start;
  gap: var(--space-3);
  padding: var(--space-4);
}

.git-commit-composer > aside {
  border-left: 1px solid var(--border);
  background: var(--surface-2);
}

.git-commit-composer h3 {
  margin: 0;
  color: var(--text);
  font-size: var(--font-md);
}

.git-commit-types {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.git-commit-types button {
  border-color: var(--border);
  padding: 5px 10px;
  font-size: var(--font-sm);
}

.git-commit-composer textarea {
  min-height: 128px;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  color: var(--text);
  padding: 12px;
  font: inherit;
  line-height: 1.5;
}

.git-commit-composer textarea:focus {
  outline: 2px solid var(--accent-soft);
  border-color: var(--accent);
}

.git-commit-character-count {
  justify-self: end;
  color: var(--text-dim);
}

.git-commit-composer aside > strong {
  margin-top: -7px;
  color: var(--text);
  font-size: var(--font-lg);
}

.git-commit-scope {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
}

.git-commit-scope button {
  display: grid;
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  color: var(--text);
  padding: 10px;
  text-align: left;
}

.git-commit-scope button.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}

.git-commit-scope small { color: var(--text-muted); }

.git-commit-include-tracked {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-muted);
}

.git-commit-include-tracked input { accent-color: var(--accent); }

.git-commit-readiness {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  border-radius: var(--radius-md);
  background: var(--surface-1);
  color: var(--text-muted);
  padding: 10px;
}

.git-commit-readiness.ready {
  background: var(--success-surface);
  color: var(--success-text);
}

.git-commit-readiness svg {
  width: 18px;
  height: 18px;
}

.git-commit-submit { width: 100%; }
.git-commit-shortcut {
  justify-self: center;
  color: var(--text-dim);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .git-commit-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .git-commit-steps {
    width: 100%;
    min-width: 0;
  }

  .git-commit-file-row {
    grid-template-columns: 28px minmax(180px, 1fr) 88px minmax(220px, auto);
  }

  .git-commit-file-code { display: none; }
}

@media (max-width: 820px) {
  .git-commit-files-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .git-commit-filter-tabs {
    overflow-x: auto;
  }

  .git-commit-search input {
    width: 100%;
  }

  .git-commit-file-row {
    grid-template-columns: 28px minmax(0, 1fr) auto;
  }

  .git-commit-file-state { display: none; }

  .git-commit-file-actions {
    align-items: flex-end;
    flex-direction: column;
  }

  .git-commit-file-actions button {
    font-size: var(--font-sm);
  }

  .git-commit-composer {
    grid-template-columns: 1fr;
  }

  .git-commit-composer > aside {
    border-top: 1px solid var(--border);
    border-left: 0;
  }
}

@media (max-width: 560px) {
  .git-commit-steps li span,
  .git-commit-file-actions button {
    font-size: 0;
  }

  .git-commit-scope {
    grid-template-columns: 1fr;
  }
}
</style>
