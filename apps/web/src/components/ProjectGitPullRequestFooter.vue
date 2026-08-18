<script setup lang="ts">
import { ArrowTopRightOnSquareIcon } from '@heroicons/vue/24/outline';

defineProps<{
  existingNumber?: number;
  existingUrl?: string;
  generatedUrl?: string;
  checkingExisting: boolean;
  opening: boolean;
  canOpen: boolean;
  mutationBusy: boolean;
  existingPullRequest: boolean;
}>();

const emit = defineEmits<{
  open: [];
  'toggle-create': [];
}>();
</script>

<template>
  <div class="git-pr-footer">
    <p>
      O dashboard não armazena credenciais do GitHub/GitLab; ele abre a tela
      oficial de criação já preenchida.
    </p>
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
      Abrir página da Pull Request
      <ArrowTopRightOnSquareIcon aria-hidden="true" />
    </a>
    <button v-else type="button" :disabled="!canOpen" @click="emit('open')">
      <ArrowTopRightOnSquareIcon aria-hidden="true" />
      {{
        checkingExisting
          ? 'Verificando PR…'
          : opening
            ? 'Preparando…'
            : 'Abrir Pull Request'
      }}
    </button>
    <button
      v-if="!existingPullRequest && !generatedUrl"
      type="button"
      :disabled="!canOpen || mutationBusy"
      @click="emit('toggle-create')"
    >
      Criar direto com gh
    </button>
  </div>
</template>

<style scoped>
.git-pr-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--space-3);
}
.git-pr-footer p {
  min-width: 0;
}
.git-pr-footer button,
.git-pr-fallback-link,
.git-pr-existing-action {
  display: inline-flex;
  min-width: 190px;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid var(--accent);
  background: var(--accent);
  color: #fff;
  padding: 9px 14px;
  font: inherit;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
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
</style>
