<script setup lang="ts">
import type { GitCommit } from '@dev-dashboard/contracts';

import { formatRelativeTime } from '../../utils/relative-time';
import UiButton from '../ui/UiButton.vue';

defineProps<{
  canCreate: boolean;
  canAmend: boolean;
  busy: boolean;
  trackedCount: number;
  stagedCount: number;
  amendTitle: string;
  latest: GitCommit | undefined;
}>();

const emit = defineEmits<{
  create: [];
  amend: [];
  'use-last-message': [];
  'open-history': [];
}>();
</script>

<template>
  <div class="git-commit-actions">
    <div class="git-commit-actions-row">
      <div class="git-commit-action">
        <UiButton
          variant="primary"
          class="git-commit-submit"
          :busy="busy"
          :disabled="!canCreate"
          @click="emit('create')"
        >
          {{ busy ? 'Processando…' : 'Criar commit' }}
          <kbd v-if="!busy">Ctrl ↵</kbd>
        </UiButton>
        <small>
          Inclui as <strong>{{ trackedCount }}</strong>
          {{
            trackedCount === 1 ? 'alteração rastreada' : 'alterações rastreadas'
          }}
          (staged ou não). Arquivos não rastreados ficam de fora.
        </small>
      </div>

      <div class="git-commit-action">
        <UiButton
          class="git-commit-amend"
          :disabled="!canAmend"
          :title="canAmend ? 'Alterar o último commit.' : amendTitle"
          @click="emit('amend')"
        >
          Alterar último commit (amend)
        </UiButton>
        <small>
          Inclui só o que já está <strong>staged</strong> ({{ stagedCount }})
          e/ou a nova mensagem.
        </small>
      </div>
    </div>

    <div v-if="latest" class="git-commit-last">
      <span class="git-commit-last-label">Último commit</span>
      <code>{{ latest.shortHash }}</code>
      <span class="git-commit-last-subject" :title="latest.subject">{{
        latest.subject
      }}</span>
      <span class="git-commit-last-label">{{
        formatRelativeTime(latest.authoredAt)
      }}</span>
      <UiButton size="sm" @click="emit('use-last-message')">
        Usar a mensagem dele
      </UiButton>
      <UiButton size="sm" variant="ghost" @click="emit('open-history')">
        Histórico
      </UiButton>
    </div>
  </div>
</template>

<style scoped>
.git-commit-actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 14px 16px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}

.git-commit-action {
  display: flex;
  min-width: 230px;
  flex: 1;
  flex-direction: column;
  gap: 8px;
}

.git-commit-action small {
  color: var(--text-dim);
  font-size: 12px;
  line-height: 1.4;
}

.git-commit-action kbd {
  padding: 0 5px;
  border: 1px solid color-mix(in srgb, currentcolor 40%, transparent);
  border-radius: 5px;
  font-family: var(--font-family-mono);
  font-size: 11px;
}

.git-commit-last {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  font-size: 13px;
}

.git-commit-last code {
  color: var(--accent);
  font-family: var(--font-family-mono);
  font-size: 12px;
}

.git-commit-last-subject {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-commit-last-label {
  color: var(--text-dim);
}
</style>
