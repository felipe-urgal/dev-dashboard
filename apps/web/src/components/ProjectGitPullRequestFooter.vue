<script setup lang="ts">
import { ArrowTopRightOnSquareIcon } from '@heroicons/vue/24/outline';

defineProps<{
  existingNumber?: number | undefined;
  existingUrl?: string | undefined;
  generatedUrl?: string | undefined;
  checkingExisting: boolean;
  opening: boolean;
  canOpen: boolean;
  mutationBusy: boolean;
  existingPullRequest: boolean;
}>();

const emit = defineEmits<{
  open: [];
  cancel: [];
  'toggle-create': [];
}>();
</script>

<template>
  <div class="git-pr-footer">
    <button type="button" class="git-pr-cancel" @click="emit('cancel')">
      Cancelar
    </button>

    <a
      v-if="existingPullRequest && existingUrl"
      class="git-pr-existing-action"
      :href="existingUrl"
      target="_blank"
      rel="noopener noreferrer"
    >
      Ver PR #{{ existingNumber }}
      <ArrowTopRightOnSquareIcon aria-hidden="true" />
    </a>

    <a
      v-else-if="generatedUrl"
      class="git-pr-fallback-link"
      :href="generatedUrl"
      target="_blank"
      rel="noopener noreferrer"
    >
      Continuar no provedor
      <ArrowTopRightOnSquareIcon aria-hidden="true" />
    </a>

    <template v-else>
      <button
        type="button"
        class="git-pr-gh-action"
        :disabled="!canOpen || mutationBusy"
        @click="emit('toggle-create')"
      >
        Criar direto com gh
      </button>
      <button
        type="button"
        class="git-pr-primary"
        :disabled="!canOpen"
        @click="emit('open')"
      >
        <ArrowTopRightOnSquareIcon aria-hidden="true" />
        {{
          checkingExisting
            ? 'Verificando PR…'
            : opening
              ? 'Preparando…'
              : 'Criar Pull Request'
        }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.git-pr-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
}

.git-pr-footer button,
.git-pr-fallback-link,
.git-pr-existing-action {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  padding: 8px 14px;
  font: inherit;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.git-pr-primary,
.git-pr-fallback-link,
.git-pr-existing-action {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}

.git-pr-cancel {
  margin-right: auto;
}

.git-pr-gh-action {
  border-color: transparent;
}

.git-pr-gh-action:hover:not(:disabled),
.git-pr-cancel:hover:not(:disabled) {
  color: var(--text);
}

.git-pr-footer button svg,
.git-pr-fallback-link svg,
.git-pr-existing-action svg {
  width: 16px;
  height: 16px;
}

.git-pr-footer button:disabled {
  border-color: var(--border);
  background: var(--surface-2);
  color: var(--text-dim);
}

@media (max-width: 720px) {
  .git-pr-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .git-pr-cancel {
    margin-right: 0;
  }

  .git-pr-footer button,
  .git-pr-fallback-link,
  .git-pr-existing-action {
    width: 100%;
  }
}
</style>
