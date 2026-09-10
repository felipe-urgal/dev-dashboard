<script setup lang="ts">
import {
  ArrowPathRoundedSquareIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentTextIcon,
  ShareIcon,
} from '@heroicons/vue/24/outline';
import { computed } from 'vue';

import type { ProjectGitOverview } from '@dev-dashboard/contracts';

export type CommitMode = 'create' | 'amend';

const props = defineProps<{
  overview: ProjectGitOverview;
  busy: boolean;
  message: string;
  mode: CommitMode;
  pushBranch: string | null;
}>();

const emit = defineEmits<{
  'update:message': [value: string];
  'update:mode': [value: CommitMode];
  submit: [];
  push: [branch: string];
  'open-history': [];
}>();

const trackedChanges = computed(() =>
  props.overview.files.filter((file) => file.status !== 'untracked'),
);
const untrackedChanges = computed(() =>
  props.overview.files.filter((file) => file.status === 'untracked'),
);
const recentCommits = computed(() => props.overview.recentCommits.slice(0, 5));

const canSubmit = computed(
  () =>
    props.message.trim().length > 0 &&
    !props.busy &&
    (props.mode === 'amend'
      ? Boolean(props.overview.latestCommit)
      : trackedChanges.value.length > 0),
);

const branchState = computed(() => {
  if (!props.overview.upstream) {
    return { label: 'Sem remoto configurado', tone: 'neutral' };
  }
  if (props.overview.ahead > 0 && props.overview.behind > 0) {
    return { label: 'Divergente do remoto', tone: 'warning' };
  }
  if (props.overview.behind > 0) {
    return {
      label: `${props.overview.behind} ${props.overview.behind === 1 ? 'commit atrás' : 'commits atrás'}`,
      tone: 'warning',
    };
  }
  if (props.overview.ahead > 0) {
    return {
      label: `${props.overview.ahead} ${props.overview.ahead === 1 ? 'commit à frente' : 'commits à frente'}`,
      tone: 'accent',
    };
  }
  return { label: 'Em dia com o origin', tone: 'success' };
});

const changeSummary = computed(() => {
  const tracked = trackedChanges.value.length;
  const untracked = untrackedChanges.value.length;
  if (untracked === 0) {
    return `${tracked} ${tracked === 1 ? 'alteração rastreada' : 'alterações rastreadas'}`;
  }
  return `${tracked} ${tracked === 1 ? 'alteração rastreada' : 'alterações rastreadas'} · ${untracked} ${untracked === 1 ? 'não rastreada' : 'não rastreadas'}`;
});

function selectMode(mode: CommitMode): void {
  emit('update:mode', mode);
  emit(
    'update:message',
    mode === 'amend' ? (props.overview.latestCommit?.subject ?? '') : '',
  );
}

function updateMessage(event: Event): void {
  emit('update:message', (event.target as HTMLTextAreaElement).value);
}

function formatCommitDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
</script>

<template>
  <section class="git-commit-page">
    <div class="git-commit-summary" aria-label="Resumo do commit">
      <article class="git-commit-summary-card">
        <div class="git-commit-summary-icon" aria-hidden="true">
          <ShareIcon />
        </div>
        <div>
          <span>Branch atual</span>
          <div class="git-commit-summary-value-line">
            <strong>{{ overview.branch ?? 'HEAD' }}</strong>
            <small class="git-commit-state" :class="`is-${branchState.tone}`">
              {{ branchState.label }}
            </small>
          </div>
          <small>Branch onde o commit será criado</small>
        </div>
      </article>

      <article class="git-commit-summary-card">
        <div class="git-commit-summary-icon" aria-hidden="true">
          <DocumentTextIcon />
        </div>
        <div>
          <span>Alterações rastreadas</span>
          <strong>{{ trackedChanges.length }}</strong>
          <small>{{ changeSummary }}</small>
        </div>
      </article>

      <article class="git-commit-summary-card">
        <div class="git-commit-summary-icon" aria-hidden="true">
          <ClockIcon />
        </div>
        <div>
          <span>Último commit</span>
          <strong>{{ overview.latestCommit?.shortHash ?? 'Nenhum' }}</strong>
          <small v-if="overview.latestCommit">
            {{ overview.latestCommit.subject }}
          </small>
          <small v-else>Nenhum commit disponível</small>
        </div>
      </article>
    </div>

    <form class="git-commit-card" @submit.prevent="emit('submit')">
      <div
        class="git-commit-mode"
        role="radiogroup"
        aria-label="Operação de commit"
      >
        <button
          type="button"
          role="radio"
          :aria-checked="mode === 'create'"
          :class="{ active: mode === 'create' }"
          :disabled="busy"
          @click="selectMode('create')"
        >
          <CheckCircleIcon aria-hidden="true" />
          <span>
            <strong>Novo commit</strong>
            <small>git commit -a</small>
          </span>
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="mode === 'amend'"
          :class="{ active: mode === 'amend' }"
          :disabled="busy || !overview.latestCommit"
          @click="selectMode('amend')"
        >
          <ArrowPathRoundedSquareIcon aria-hidden="true" />
          <span>
            <strong>Alterar último commit</strong>
            <small>git commit --amend</small>
          </span>
        </button>
      </div>

      <section
        v-if="pushBranch"
        class="git-push-notice"
        aria-label="Novo commit aguardando envio"
      >
        <ArrowUpTrayIcon aria-hidden="true" />
        <div>
          <strong>Novo commit pronto para enviar</strong>
          <p>
            Envie os commits novos de <code>{{ pushBranch }}</code> para
            <code>origin/{{ pushBranch }}</code
            >. Se já existir uma Pull Request, ela será atualizada
            automaticamente pelo GitHub.
          </p>
        </div>
        <button
          type="button"
          :disabled="busy"
          @click="emit('push', pushBranch)"
        >
          Push
        </button>
      </section>

      <header class="git-commit-heading">
        <div>
          <h2>
            {{
              mode === 'create' ? 'Criar novo commit' : 'Alterar último commit'
            }}
          </h2>
          <p v-if="mode === 'create'">
            Salve todas as alterações rastreadas no repositório local.
          </p>
          <p v-else>
            Atualize a mensagem e inclua as alterações atuais no último commit.
          </p>
        </div>
        <span class="git-commit-context">
          Branch <strong>{{ overview.branch ?? 'HEAD' }}</strong>
          <span aria-hidden="true">·</span>
          <template v-if="mode === 'create'">
            {{ trackedChanges.length }}
            {{
              trackedChanges.length === 1
                ? 'alteração rastreada'
                : 'alterações rastreadas'
            }}
          </template>
          <template v-else-if="overview.latestCommit">
            {{ overview.latestCommit.shortHash }}
          </template>
        </span>
      </header>

      <label class="git-commit-message">
        <span>Mensagem do commit</span>
        <textarea
          :value="message"
          maxlength="500"
          :placeholder="
            mode === 'create'
              ? 'Descreva as alterações'
              : 'Atualize a mensagem do último commit'
          "
          :disabled="busy"
          @input="updateMessage"
        />
        <small class="git-commit-message-count">{{ message.length }}/500</small>
      </label>

      <div class="git-commit-footer">
        <div>
          <p v-if="mode === 'create'">
            Inclui automaticamente todas as alterações rastreadas.
          </p>
          <p v-else>
            Adiciona todas as alterações atuais e substitui o último commit.
          </p>
          <small v-if="mode === 'create' && untrackedChanges.length > 0">
            Arquivos não rastreados não entram neste commit automaticamente.
          </small>
        </div>

        <button type="submit" class="git-commit-submit" :disabled="!canSubmit">
          {{
            busy
              ? 'Processando…'
              : mode === 'create'
                ? 'Criar commit'
                : 'Alterar commit'
          }}
        </button>
      </div>
    </form>

    <section
      class="git-commit-history"
      aria-labelledby="git-commit-history-title"
    >
      <header>
        <div>
          <h2 id="git-commit-history-title">Últimos commits</h2>
          <p>Histórico recente já carregado do repositório.</p>
        </div>
        <button
          type="button"
          class="git-commit-history-button"
          @click="emit('open-history')"
        >
          Ver histórico completo
        </button>
      </header>

      <div v-if="recentCommits.length > 0" class="git-commit-history-table">
        <div class="git-commit-history-head" aria-hidden="true">
          <span>Hash</span>
          <span>Mensagem</span>
          <span>Autor</span>
          <span>Data</span>
        </div>
        <div
          v-for="commit in recentCommits"
          :key="commit.hash"
          class="git-commit-history-row"
        >
          <code>{{ commit.shortHash }}</code>
          <strong>{{ commit.subject }}</strong>
          <span>{{ commit.authorName }}</span>
          <time :datetime="commit.authoredAt">{{
            formatCommitDate(commit.authoredAt)
          }}</time>
        </div>
      </div>
      <p v-else class="git-commit-history-empty">
        Nenhum commit recente disponível.
      </p>
    </section>
  </section>
</template>

<style scoped>
.git-commit-page {
  display: grid;
  min-width: 0;
  gap: 18px;
  padding: var(--space-5);
}

.git-commit-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.git-commit-summary-card {
  display: flex;
  min-width: 0;
  min-height: 108px;
  align-items: center;
  gap: 16px;
  border: 1px solid var(--border);
  background: var(--surface-1);
  padding: 16px 18px;
}

.git-commit-summary-icon {
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent);
}

.git-commit-summary-icon svg {
  width: 22px;
  height: 22px;
}

.git-commit-summary-card > div:last-child {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.git-commit-summary-card span,
.git-commit-summary-card small {
  color: var(--text-muted);
}

.git-commit-summary-card strong {
  overflow: hidden;
  color: var(--text);
  font-size: var(--font-lg);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-commit-summary-card > div:last-child > strong {
  font-size: var(--font-xl);
}

.git-commit-summary-value-line {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.git-commit-state {
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: var(--font-xs);
  font-weight: 700;
  white-space: nowrap;
}

.git-commit-state.is-success {
  background: var(--success-surface);
  color: var(--success-text);
}

.git-commit-state.is-warning {
  background: var(--warning-surface);
  color: var(--warning-text);
}

.git-commit-state.is-accent {
  background: var(--accent-soft);
  color: var(--accent);
}

.git-commit-state.is-neutral {
  background: var(--surface-2);
  color: var(--text-muted);
}

.git-commit-card,
.git-commit-history {
  display: grid;
  overflow: hidden;
  border: 1px solid var(--border);
  background: var(--surface-1);
}

.git-commit-card {
  gap: 0;
  width: 100%;
  margin: 0;
}

.git-commit-mode {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-bottom: 1px solid var(--border);
}

.git-commit-mode button {
  display: flex;
  min-height: 58px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 0;
  border-right: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
  color: var(--text-muted);
  padding: 10px 16px;
  font: inherit;
}

.git-commit-mode button:last-child {
  border-right: 0;
}

.git-commit-mode button:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text);
}

.git-commit-mode button.active {
  box-shadow: inset 0 -2px 0 var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}

.git-commit-mode button > span {
  display: grid;
  gap: 2px;
  text-align: left;
}

.git-commit-mode button strong {
  color: inherit;
}

.git-commit-mode button small {
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: var(--font-xs);
  font-weight: 500;
}

.git-commit-mode svg {
  width: 19px;
  height: 19px;
  flex: 0 0 auto;
}

.git-push-notice {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  margin: 18px 18px 0;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: var(--accent-soft);
  padding: 12px 14px;
}

.git-push-notice > svg {
  width: 22px;
  height: 22px;
  color: var(--accent);
}

.git-push-notice p {
  margin: 3px 0 0;
  color: var(--text-muted);
}

.git-push-notice button {
  min-height: 38px;
  border-color: var(--accent);
  background: var(--surface-1);
  color: var(--accent);
  padding: 0 14px;
  font-weight: 700;
  white-space: nowrap;
}

.git-commit-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 24px;
  padding: 20px 20px 0;
}

.git-commit-heading > div {
  display: grid;
  gap: 4px;
}

.git-commit-heading h2,
.git-commit-heading p {
  margin: 0;
}

.git-commit-heading h2 {
  color: var(--text);
  font-size: var(--font-lg);
}

.git-commit-heading p {
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.git-commit-context {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: var(--font-sm);
  white-space: nowrap;
}

.git-commit-context strong {
  color: var(--text);
}

.git-commit-message {
  position: relative;
  display: grid;
  gap: 8px;
  padding: 20px;
  color: var(--text-muted);
}

.git-commit-message > span {
  color: var(--text);
  font-weight: 600;
}

.git-commit-message textarea {
  min-height: 120px;
  resize: vertical;
  border: 1px solid var(--border);
  background: var(--surface-1);
  color: var(--text);
  padding: 14px 16px 28px;
  font: inherit;
  line-height: 1.5;
}

.git-commit-message textarea:focus {
  outline: 2px solid var(--accent-soft);
  border-color: var(--accent);
}

.git-commit-message-count {
  position: absolute;
  right: 32px;
  bottom: 28px;
  color: var(--text-dim);
  font-size: var(--font-xs);
}

.git-commit-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  border-top: 1px solid var(--border);
  padding: 14px 20px;
}

.git-commit-footer > div {
  display: grid;
  gap: 3px;
}

.git-commit-footer p,
.git-commit-footer small {
  margin: 0;
  color: var(--text-dim);
}

.git-commit-submit {
  min-width: 142px;
  min-height: 42px;
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
  font-weight: 700;
}

.git-commit-submit:hover:not(:disabled) {
  filter: brightness(0.96);
}

.git-commit-submit:disabled {
  border-color: var(--border);
  background: var(--surface-2);
  color: var(--text-dim);
}

.git-commit-history > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--border);
  padding: 14px 16px;
}

.git-commit-history h2,
.git-commit-history p {
  margin: 0;
}

.git-commit-history h2 {
  color: var(--text);
  font-size: var(--font-lg);
}

.git-commit-history header p {
  margin-top: 3px;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.git-commit-history-button {
  min-height: 36px;
  border-color: var(--border);
  background: var(--surface-2);
  color: var(--text);
  padding: 0 12px;
  font-weight: 600;
}

.git-commit-history-button:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.git-commit-history-table {
  display: grid;
  min-width: 0;
}

.git-commit-history-head,
.git-commit-history-row {
  display: grid;
  grid-template-columns: 110px minmax(220px, 1.5fr) minmax(140px, 0.7fr) 130px;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
}

.git-commit-history-head {
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: 700;
}

.git-commit-history-row {
  border-top: 1px solid var(--border);
  color: var(--text-muted);
}

.git-commit-history-head + .git-commit-history-row {
  border-top: 0;
}

.git-commit-history-row code {
  width: fit-content;
  border-radius: 5px;
  background: var(--accent-soft);
  color: var(--accent);
  padding: 3px 7px;
}

.git-commit-history-row strong {
  overflow: hidden;
  color: var(--text);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-commit-history-row time {
  white-space: nowrap;
}

.git-commit-history-empty {
  padding: 20px;
  color: var(--text-muted);
}

@media (max-width: 920px) {
  .git-commit-summary {
    grid-template-columns: 1fr;
  }

  .git-commit-history {
    overflow-x: auto;
  }

  .git-commit-history-table {
    min-width: 720px;
  }
}

@media (max-width: 720px) {
  .git-commit-page {
    padding: 16px;
  }

  .git-commit-mode {
    grid-template-columns: 1fr;
  }

  .git-commit-mode button {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .git-commit-mode button:last-child {
    border-bottom: 0;
  }

  .git-push-notice {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .git-push-notice button {
    grid-column: 1 / -1;
    width: 100%;
  }

  .git-commit-heading,
  .git-commit-footer,
  .git-commit-history > header {
    align-items: stretch;
    flex-direction: column;
  }

  .git-commit-context {
    white-space: normal;
  }

  .git-commit-submit,
  .git-commit-history-button {
    width: 100%;
  }
}
</style>
