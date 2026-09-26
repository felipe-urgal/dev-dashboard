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
        <div class="git-commit-tracked" aria-label="Alterações incluídas no commit">
          <CheckCircleIcon aria-hidden="true" />
          <span>
            <strong>{{ trackedChanges.length }}</strong>
            {{
              trackedChanges.length === 1
                ? 'alteração rastreada'
                : 'alterações rastreadas'
            }}
            incluídas automaticamente
          </span>
        </div>

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
  padding: 16px;
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
  bottom: 26px;
  color: var(--text-dim);
  font-size: 9px;
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

.git-commit-tracked {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 10px;
}

.git-commit-tracked svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  color: var(--success-text);
}

.git-commit-tracked strong {
  color: var(--text);
  font-weight: var(--font-weight-strong);
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
    padding: 10px;
  }

  .git-commit-message-count {
    right: 22px;
    bottom: 20px;
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
