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

const trackedChanges = computed(() =>
  props.overview.files.filter((file) => file.status !== 'untracked'),
);

const canCreate = computed(
  () =>
    props.message.trim().length > 0 &&
    !props.busy &&
    trackedChanges.value.length > 0,
);

const canAmend = computed(
  () => !props.busy && Boolean(props.overview.latestCommit),
);

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
  if (!props.message.trim()) {
    emit('update:message', props.overview.latestCommit?.subject ?? '');
  }
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

      <div class="git-commit-footer">
        <label class="git-commit-tracked">
          <input type="checkbox" checked disabled />
          <span>Incluir todas as alterações rastreadas</span>
        </label>

        <div class="git-commit-actions">
          <button
            type="button"
            class="git-commit-amend"
            :disabled="!canAmend"
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
  display: grid;
  min-width: 0;
  padding: var(--space-5);
}

.git-commit-card {
  display: grid;
  overflow: hidden;
  width: 100%;
  margin: 0;
  border: 1px solid var(--border);
  background: var(--surface-1);
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

.git-commit-message {
  position: relative;
  display: grid;
  padding: 24px;
}

.git-commit-message textarea {
  min-height: 140px;
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
  right: 36px;
  bottom: 32px;
  color: var(--text-dim);
  font-size: var(--font-xs);
}

.git-commit-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  border-top: 1px solid var(--border);
  padding: 14px 24px;
}

.git-commit-tracked {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: var(--text-muted);
  font-size: var(--font-sm);
}

.git-commit-tracked input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--accent);
  opacity: 1;
}

.git-commit-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.git-commit-actions button {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  font-weight: 700;
}

.git-commit-actions svg {
  width: 18px;
  height: 18px;
}

.git-commit-amend {
  border-color: var(--border);
  background: var(--surface-1);
  color: var(--text-muted);
}

.git-commit-amend:hover:not(:disabled) {
  border-color: var(--text-muted);
  color: var(--text);
}

.git-commit-submit {
  min-width: 142px;
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}

.git-commit-submit:hover:not(:disabled) {
  filter: brightness(0.96);
}

.git-commit-actions button:disabled {
  border-color: var(--border);
  background: var(--surface-2);
  color: var(--text-dim);
}

@media (max-width: 720px) {
  .git-commit-page {
    padding: 16px;
  }

  .git-push-notice {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .git-push-notice button {
    grid-column: 1 / -1;
    width: 100%;
  }

  .git-commit-message {
    padding: 16px;
  }

  .git-commit-message-count {
    right: 28px;
    bottom: 24px;
  }

  .git-commit-footer {
    align-items: stretch;
    flex-direction: column;
    padding: 14px 16px 16px;
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
