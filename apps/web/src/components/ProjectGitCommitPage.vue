<script setup lang="ts">
import {
  ArrowPathRoundedSquareIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
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

const commitChanges = computed(() =>
  props.overview.files.filter((file) => file.status !== 'untracked'),
);

const untrackedChanges = computed(() =>
  props.overview.files.filter((file) => file.status === 'untracked'),
);

const stagedChanges = computed(() =>
  props.overview.files.filter(
    (file) => file.indexStatus !== '.' && file.indexStatus !== '?',
  ),
);

const hasConflicts = computed(() =>
  props.overview.files.some((file) => file.status === 'conflicted'),
);

const messageChanged = computed(() => {
  const latest = props.overview.latestCommit?.subject;
  const message = props.message.trim();
  return Boolean(latest && message && message !== latest);
});

const canCreate = computed(
  () =>
    props.message.trim().length > 0 &&
    !props.busy &&
    !hasConflicts.value &&
    commitChanges.value.length > 0,
);

const canAmend = computed(
  () =>
    !props.busy &&
    !hasConflicts.value &&
    Boolean(props.overview.latestCommit) &&
    (stagedChanges.value.length > 0 || messageChanged.value),
);

const amendTitle = computed(() => {
  if (hasConflicts.value) return 'Resolva os conflitos antes de usar amend.';
  if (!props.overview.latestCommit) return 'Não existe commit anterior.';
  if (canAmend.value) return 'Alterar o último commit.';
  return 'Faça stage de alterações ou mude a mensagem para habilitar o amend.';
});

function updateMessage(event: Event): void {
  emit('update:message', (event.target as HTMLTextAreaElement).value);
}

function submitCreate(): void {
  if (!canCreate.value) return;
  emit('update:mode', 'create');
  emit('submit');
}

function submitAmend(): void {
  if (!canAmend.value) return;
  emit('update:mode', 'amend');
  emit('submit');
}
</script>

<template>
  <section class="git-commit-page">
    <form class="git-commit-card" @submit.prevent>
      <section
        v-if="pushBranch"
        class="git-push-notice"
        aria-label="Novo commit aguardando envio"
      >
        <ArrowUpTrayIcon aria-hidden="true" />
        <div>
          <strong>Commits locais aguardando envio</strong>
          <p>
            Envie os commits de <code>{{ pushBranch }}</code> para
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

      <label class="git-commit-message">
        <textarea
          :value="message"
          maxlength="500"
          placeholder="Descreva as alterações"
          aria-label="Mensagem do commit"
          :disabled="busy"
          @input="updateMessage"
        />
        <small class="git-commit-message-count">{{ message.length }}/500</small>
      </label>

      <div class="git-commit-scope" aria-label="Escopo das operações de commit">
        <div
          v-if="hasConflicts"
          class="git-commit-scope-item is-conflict"
          role="alert"
        >
          <span class="git-commit-scope-dot" aria-hidden="true">!</span>
          <span>Resolva os conflitos antes de criar ou alterar commits</span>
        </div>
        <div class="git-commit-scope-item">
          <CheckCircleIcon aria-hidden="true" />
          <span>
            <strong>{{ commitChanges.length }}</strong>
            {{
              commitChanges.length === 1
                ? 'alteração entra'
                : 'alterações entram'
            }}
            no commit normal
          </span>
        </div>

        <div
          v-if="untrackedChanges.length > 0"
          class="git-commit-scope-item is-excluded"
        >
          <span class="git-commit-scope-dot" aria-hidden="true">•</span>
          <span>
            <strong>{{ untrackedChanges.length }}</strong>
            {{
              untrackedChanges.length === 1
                ? 'arquivo não rastreado fica'
                : 'arquivos não rastreados ficam'
            }}
            de fora
          </span>
        </div>

        <div class="git-commit-scope-item is-amend">
          <ArrowPathRoundedSquareIcon aria-hidden="true" />
          <span>
            <strong>{{ stagedChanges.length }}</strong>
            {{
              stagedChanges.length === 1
                ? 'alteração staged disponível'
                : 'alterações staged disponíveis'
            }}
            para amend
          </span>
        </div>
      </div>

      <div class="git-commit-footer">
        <p class="git-commit-amend-hint">
          Amend inclui somente o que já está staged. Alterações não staged e
          arquivos novos permanecem fora.
        </p>

        <div class="git-commit-actions">
          <button
            type="button"
            class="git-commit-amend"
            :disabled="!canAmend"
            :title="amendTitle"
            @click="submitAmend"
          >
            <ArrowPathRoundedSquareIcon aria-hidden="true" />
            Amend último commit
          </button>
          <button
            type="button"
            class="git-commit-submit"
            :disabled="!canCreate"
            @click="submitCreate"
          >
            <CheckCircleIcon aria-hidden="true" />
            {{ busy ? 'Processando…' : 'Criar commit' }}
          </button>
        </div>
      </div>
    </form>
  </section>
</template>

<style scoped>
.git-commit-page {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: calc(100vh - var(--app-topbar-height, 72px));
  flex-direction: column;
  background: var(--surface-1);
}

.git-commit-card {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  margin: 0;
  overflow: hidden;
  background: var(--surface-1);
}

.git-push-notice {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
  background: color-mix(in srgb, var(--accent-soft) 66%, var(--surface-1));
}

.git-push-notice > svg {
  width: 18px;
  height: 18px;
  color: var(--accent);
}

.git-push-notice p {
  margin: 2px 0 0;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.45;
}

.git-push-notice strong {
  color: var(--text);
  font-size: 11px;
}

.git-push-notice button {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  color: var(--accent);
  background: var(--surface-1);
  font: inherit;
  font-size: 10px;
  font-weight: var(--font-weight-strong);
  white-space: nowrap;
}

.git-commit-message {
  position: relative;
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  padding: 16px 16px 10px;
}

.git-commit-message textarea {
  width: 100%;
  min-height: 220px;
  flex: 1 1 auto;
  resize: none;
  box-sizing: border-box;
  padding: 16px 18px 32px;
  border: 0;
  outline: 0;
  color: var(--text);
  background: var(--surface-0);
  font: inherit;
  font-size: 13px;
  line-height: 1.55;
}

.git-commit-message textarea::placeholder {
  color: var(--text-dim);
}

.git-commit-message textarea:focus {
  box-shadow: inset 0 0 0 1px var(--accent);
}

.git-commit-message-count {
  position: absolute;
  right: 30px;
  bottom: 20px;
  color: var(--text-dim);
  font-size: 9px;
}

.git-commit-scope {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 7px;
  padding: 0 16px 12px;
}

.git-commit-scope-item {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: 6px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: 10px;
}

.git-commit-scope-item svg {
  width: 14px;
  height: 14px;
  color: var(--success-text);
}

.git-commit-scope-item.is-amend svg {
  color: var(--accent);
}

.git-commit-scope-item.is-excluded {
  color: var(--text-dim);
}

.git-commit-scope-item.is-conflict {
  border-color: color-mix(in srgb, var(--warning-text) 35%, var(--border));
  color: var(--warning-text);
}

.git-commit-scope-dot {
  color: var(--warning-text);
  font-size: 16px;
  line-height: 1;
}

.git-commit-scope-item strong {
  color: var(--text);
  font-weight: var(--font-weight-strong);
}

.git-commit-footer {
  display: flex;
  min-height: 58px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 9px 12px 9px 14px;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-1) 96%, var(--surface-2) 4%);
}

.git-commit-amend-hint {
  max-width: 520px;
  margin: 0;
  color: var(--text-dim);
  font-size: 9px;
  line-height: 1.45;
}

.git-commit-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.git-commit-actions button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: 10px;
  font-weight: var(--font-weight-strong);
}

.git-commit-actions svg {
  width: 15px;
  height: 15px;
}

.git-commit-amend {
  border: 1px solid var(--border);
  color: var(--text-muted);
  background: transparent;
}

.git-commit-amend:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text);
  background: var(--surface-2);
}

.git-commit-submit {
  min-width: 126px;
  border: 1px solid var(--accent);
  color: #fff;
  background: var(--accent);
}

.git-commit-submit:hover:not(:disabled) {
  background: var(--accent-strong);
}

.git-commit-actions button:disabled {
  border-color: var(--border);
  color: var(--text-dim);
  background: var(--surface-2);
  cursor: not-allowed;
}

@media (max-width: 720px) {
  .git-push-notice {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .git-push-notice button {
    grid-column: 1 / -1;
    width: 100%;
  }

  .git-commit-message {
    padding: 10px 10px 8px;
  }

  .git-commit-message-count {
    right: 22px;
    bottom: 18px;
  }

  .git-commit-scope {
    padding: 0 10px 10px;
  }

  .git-commit-scope-item {
    width: 100%;
  }

  .git-commit-footer {
    align-items: stretch;
    flex-direction: column;
    padding: 10px;
  }

  .git-commit-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .git-commit-actions button {
    width: 100%;
  }
}
</style>
