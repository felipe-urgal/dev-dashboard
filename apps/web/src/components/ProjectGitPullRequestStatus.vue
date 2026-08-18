<script setup lang="ts">
import type { GitOpenPullRequest } from '@dev-dashboard/contracts';

defineProps<{
  branchPublished: boolean;
  checkingExisting: boolean;
  existingPullRequest: GitOpenPullRequest | null;
  lookupUnavailable: boolean;
  targetRemote: string;
  mutationBusy: boolean;
}>();

const emit = defineEmits<{
  'toggle-merge': [];
  'toggle-close': [];
}>();
</script>

<template>
  <div v-if="!branchPublished" class="git-pr-warning">
    A branch atual ainda não possui upstream. Publique a branch antes de abrir a
    Pull Request.
  </div>

  <div v-else-if="checkingExisting" class="git-pr-checking" aria-live="polite">
    Verificando se já existe uma Pull Request aberta para este destino…
  </div>

  <div
    v-else-if="existingPullRequest"
    class="git-pr-existing"
    aria-live="polite"
  >
    <div>
      <span>PR #{{ existingPullRequest.number }} já está aberta</span>
      <strong>{{ existingPullRequest.title }}</strong>
      <small>
        {{ existingPullRequest.sourceBranch }} → {{ targetRemote }}/{{
          existingPullRequest.baseBranch
        }}
      </small>
    </div>

    <div class="git-pr-gh-actions">
      <button
        type="button"
        :disabled="mutationBusy"
        @click="emit('toggle-merge')"
      >
        Mesclar com gh
      </button>
      <button
        type="button"
        class="danger-button"
        :disabled="mutationBusy"
        @click="emit('toggle-close')"
      >
        Fechar com gh
      </button>
    </div>
  </div>

  <div v-else-if="lookupUnavailable" class="git-pr-lookup-note">
    Não foi possível verificar automaticamente se já existe uma Pull Request
    aberta. Você ainda pode continuar, mas vale conferir o repositório antes de
    criar outra.
  </div>
</template>

<style scoped>
.git-pr-warning,
.git-pr-checking,
.git-pr-lookup-note,
.git-pr-existing {
  padding: var(--space-3);
}

.git-pr-warning {
  border: 1px solid color-mix(in srgb, var(--warning-text) 30%, var(--border));
  border-radius: var(--radius-md);
  background: var(--warning-surface);
  color: var(--warning-text);
}

.git-pr-checking,
.git-pr-lookup-note {
  background: var(--surface-2);
  color: var(--text-muted);
}

.git-pr-existing {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  border: 1px solid color-mix(in srgb, var(--success-text) 30%, var(--border));
  border-radius: var(--radius-md);
  background: var(--success-surface);
  color: var(--success-text);
}

.git-pr-existing > div:first-child {
  display: grid;
  gap: 4px;
}

.git-pr-existing strong {
  color: var(--text);
}

.git-pr-existing small {
  color: var(--text-muted);
}

.git-pr-gh-actions {
  display: flex;
  flex: none;
  gap: var(--space-2);
}

.git-pr-gh-actions button {
  min-height: 36px;
  border: 1px solid var(--border);
  background: var(--surface-1);
  color: var(--text);
  padding: 6px 12px;
  font: inherit;
  font-weight: 600;
}

@media (max-width: 800px) {
  .git-pr-existing {
    align-items: stretch;
    flex-direction: column;
  }

  .git-pr-gh-actions,
  .git-pr-gh-actions button {
    width: 100%;
  }
}
</style>