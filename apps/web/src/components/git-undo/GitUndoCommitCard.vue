<script setup lang="ts">
import { ExclamationTriangleIcon } from '@heroicons/vue/24/outline';

import type { GitCommit } from '@dev-dashboard/contracts';

import type { CommitUndoView } from '../../utils/git-undo';
import { formatRelativeTime } from '../../utils/relative-time';
import UiButton from '../ui/UiButton.vue';
import UiTag from '../ui/UiTag.vue';

const toneByPublication = {
  success: 'success',
  warning: 'warning',
  neutral: 'neutral',
} as const;

defineProps<{
  commit: GitCommit | undefined;
  view: CommitUndoView;
  /** Pedido de undo em andamento ou preflight carregando. */
  busy: boolean;
  loading: boolean;
}>();

const emit = defineEmits<{
  undo: [];
  'block-action': [];
  'open-history': [];
}>();

const BLOCK_ACTION_LABELS = {
  files: 'Ver alterações locais',
  sync: 'Ir para Sincronização',
} as const;
</script>

<template>
  <section class="git-undo-commit" aria-label="Desfazer o último commit">
    <header>Desfazer o último commit</header>

    <div class="git-undo-commit-body">
      <div v-if="commit" class="git-undo-commit-info">
        <div class="git-undo-commit-top">
          <code>{{ commit.shortHash }}</code>
          <UiTag :tone="toneByPublication[view.publicationTone]">{{
            view.publicationLabel
          }}</UiTag>
        </div>
        <strong>{{ commit.subject }}</strong>
        <small>
          {{ commit.authorName }} · {{ formatRelativeTime(commit.authoredAt) }}
        </small>
      </div>
      <p v-else class="git-undo-none">Nenhum commit disponível.</p>

      <p class="git-undo-what">
        <strong>O que vai acontecer.</strong> {{ view.what }}
      </p>

      <div v-if="view.block" class="git-undo-block" role="status">
        <ExclamationTriangleIcon aria-hidden="true" />
        <span>
          <strong>{{ view.block.title }}</strong>
          <small>{{ view.block.text }}</small>
        </span>
        <UiButton v-if="view.block.action" @click="emit('block-action')">
          {{ BLOCK_ACTION_LABELS[view.block.action] }}
        </UiButton>
      </div>

      <div class="git-undo-commit-actions">
        <UiButton
          variant="primary"
          class="git-undo-danger"
          :busy="busy"
          :disabled="view.blocked || busy || loading"
          @click="emit('undo')"
        >
          {{
            busy ? 'Processando…' : loading ? 'Verificando…' : view.actionLabel
          }}
        </UiButton>
        <UiButton variant="ghost" @click="emit('open-history')">
          Ver histórico completo
        </UiButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
.git-undo-commit {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.git-undo-commit > header {
  padding: 11px 16px;
  border-bottom: 1px solid var(--border);
  border-radius: 14px 14px 0 0;
  font-weight: 650;
}

.git-undo-commit-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px;
}

.git-undo-commit-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.git-undo-commit-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.git-undo-commit-top code {
  color: var(--accent);
  font-family: var(--font-family-mono);
  font-size: 13px;
}

.git-undo-commit-info strong {
  font-size: 16px;
  letter-spacing: -0.01em;
}

.git-undo-commit-info small {
  color: var(--text-dim);
  font-size: 13px;
}

.git-undo-none {
  margin: 0;
  color: var(--text-dim);
}

.git-undo-what {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text-muted);
  background: var(--surface-0);
  font-size: 13.5px;
  line-height: 1.55;
}

.git-undo-what strong {
  color: var(--text);
}

.git-undo-block {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--warning-text) 35%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--warning-text) 12%, transparent);
  font-size: 13.5px;
}

.git-undo-block > svg {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  color: var(--warning-text);
}

.git-undo-block > span {
  flex: 1;
}

.git-undo-block small {
  display: block;
  color: var(--text-muted);
  font-size: 12.5px;
}

.git-undo-commit-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
</style>
