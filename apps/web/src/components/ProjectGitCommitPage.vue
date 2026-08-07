<script setup lang="ts">
import {
  ArrowUpTrayIcon,
  ArrowPathRoundedSquareIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
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
  forcePushBranch: string | null;
}>();

const emit = defineEmits<{
  'update:message': [value: string];
  'update:mode': [value: CommitMode];
  submit: [];
  push: [branch: string];
  'force-push': [];
}>();

const trackedChanges = computed(() =>
  props.overview.files.filter((file) => file.status !== 'untracked'),
);

const canSubmit = computed(
  () =>
    props.message.trim().length > 0 &&
    !props.busy &&
    (props.mode === 'amend'
      ? Boolean(props.overview.latestCommit)
      : trackedChanges.value.length > 0),
);

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
</script>

<template>
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
        Novo commit
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
        Alterar último commit
      </button>
    </div>

    <div class="git-commit-divider" />

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
          <code>origin/{{ pushBranch }}</code>. Se já existir uma Pull Request,
          ela será atualizada automaticamente pelo GitHub.
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

    <section
      v-if="forcePushBranch"
      class="git-force-push-notice"
      aria-label="Atualização da branch remota"
    >
      <ExclamationTriangleIcon aria-hidden="true" />
      <div>
        <strong>O último commit foi reescrito</strong>
        <p>
          Para atualizar <code>origin/{{ forcePushBranch }}</code
          >, use o reenvio seguro. A operação será recusada se a branch remota
          tiver mudado depois da confirmação.
        </p>
      </div>
      <button type="button" :disabled="busy" @click="emit('force-push')">
        Reenviar com lease
      </button>
    </section>

    <div class="git-commit-context">
      <span
        >Branch <strong>{{ overview.branch ?? 'HEAD' }}</strong></span
      >
      <span aria-hidden="true" />
      <span v-if="mode === 'create'">
        {{ trackedChanges.length }}
        {{
          trackedChanges.length === 1
            ? 'alteração rastreada'
            : 'alterações rastreadas'
        }}
      </span>
      <span v-else-if="overview.latestCommit">
        Último commit <strong>{{ overview.latestCommit.shortHash }}</strong>
      </span>
    </div>

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
    </label>

    <div class="git-commit-footer">
      <p v-if="mode === 'create'">
        Inclui automaticamente todas as alterações rastreadas.
      </p>
      <p v-else>
        Adiciona todas as alterações atuais e substitui o último commit.
      </p>

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
</template>

<style scoped>
.git-commit-card {
  width: 100%;
  margin: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  padding: 20px;
  box-shadow: var(--shadow-1);
}

.git-commit-mode {
  display: inline-grid;
  grid-template-columns: 1fr 1.25fr;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.git-commit-mode button {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: 0;
  border-right: 1px solid var(--border);
  border-radius: 0;
  background: var(--surface-1);
  color: var(--text-muted);
  padding: 0 16px;
  font: inherit;
  font-weight: 600;
}

.git-commit-mode button:last-child {
  border-right: 0;
}

.git-commit-mode button:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text);
}

.git-commit-mode button.active {
  background: var(--accent-soft);
  color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}

.git-commit-mode svg {
  width: 18px;
  height: 18px;
}

.git-commit-divider {
  height: 1px;
  margin: 20px 0;
  background: var(--border);
}

.git-push-notice,
.git-force-push-notice {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: 20px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
}

.git-push-notice {
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: var(--accent-soft);
}

.git-force-push-notice {
  border: 1px solid color-mix(in srgb, var(--warning-text) 45%, var(--border));
  background: var(--warning-surface);
}

.git-push-notice > svg,
.git-force-push-notice > svg {
  width: 22px;
  height: 22px;
}

.git-push-notice > svg {
  color: var(--accent);
}

.git-force-push-notice > svg {
  color: var(--warning-text);
}

.git-push-notice p,
.git-force-push-notice p {
  margin: 3px 0 0;
  color: var(--text-muted);
}

.git-push-notice button,
.git-force-push-notice button {
  min-height: 38px;
  padding: 0 14px;
  background: var(--surface-1);
  font-weight: 700;
  white-space: nowrap;
}

.git-push-notice button {
  border-color: var(--accent);
  color: var(--accent);
}

.git-force-push-notice button {
  border-color: var(--warning-text);
  color: var(--warning-text);
}

.git-commit-context {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: var(--text-muted);
}

.git-commit-context > span[aria-hidden='true'] {
  width: 1px;
  height: 20px;
  background: var(--border);
}

.git-commit-context strong {
  color: var(--text);
}

.git-commit-message {
  display: grid;
  gap: var(--space-2);
  margin-top: 20px;
  color: var(--text-muted);
}

.git-commit-message > span {
  font-weight: 500;
}

.git-commit-message textarea {
  min-height: 112px;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-1);
  color: var(--text);
  padding: 14px 16px;
  font: inherit;
  line-height: 1.5;
}

.git-commit-message textarea:focus {
  outline: 2px solid var(--accent-soft);
  border-color: var(--accent);
}

.git-commit-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-top: 10px;
}

.git-commit-footer p {
  margin: 0;
  color: var(--text-dim);
}

.git-commit-submit {
  min-width: 142px;
  min-height: 44px;
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

@media (max-width: 720px) {
  .git-commit-card {
    padding: 16px;
  }

  .git-commit-mode {
    display: grid;
    width: 100%;
    grid-template-columns: 1fr;
  }

  .git-commit-mode button {
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }

  .git-commit-mode button:last-child {
    border-bottom: 0;
  }

  .git-push-notice,
  .git-force-push-notice {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .git-push-notice button,
  .git-force-push-notice button {
    grid-column: 1 / -1;
    width: 100%;
  }

  .git-commit-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .git-commit-submit {
    width: 100%;
  }
}
</style>
