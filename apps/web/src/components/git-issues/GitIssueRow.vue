<script setup lang="ts">
import { ref } from 'vue';
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ExclamationCircleIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/vue/24/outline';

import type { GithubIssue } from '../../api/github-issues';
import { formatRelativeTime } from '../../utils/relative-time';
import UiButton from '../ui/UiButton.vue';
import UiTag from '../ui/UiTag.vue';

defineProps<{ issue: GithubIssue; disabled: boolean }>();

const emit = defineEmits<{ edit: []; close: []; reopen: []; remove: [] }>();

const expanded = ref(false);
</script>

<template>
  <article class="git-issue-row" :data-state="issue.state">
    <div class="git-issue-main">
      <button
        type="button"
        class="git-issue-toggle"
        :aria-expanded="expanded"
        :aria-label="`${expanded ? 'Recolher' : 'Expandir'} issue #${issue.number}`"
        @click="expanded = !expanded"
      >
        <ChevronRightIcon
          class="git-issue-chevron"
          :data-open="expanded"
          aria-hidden="true"
        />
        <CheckCircleIcon
          v-if="issue.state === 'closed'"
          class="git-issue-state"
          aria-label="Fechada"
        />
        <ExclamationCircleIcon
          v-else
          class="git-issue-state"
          aria-label="Aberta"
        />
      </button>

      <div class="git-issue-info">
        <div class="git-issue-heading">
          <strong>{{ issue.title }}</strong>
          <UiTag v-for="label in issue.labels" :key="label">{{ label }}</UiTag>
        </div>
        <div class="git-issue-meta">
          <code>#{{ issue.number }}</code>
          <span v-if="issue.author">por {{ issue.author }}</span>
          <span v-if="issue.updatedAt"
            >· atualizada {{ formatRelativeTime(issue.updatedAt) }}</span
          >
        </div>
      </div>

      <UiButton :disabled="disabled" @click="emit('edit')">
        <PencilSquareIcon aria-hidden="true" />
        Editar
      </UiButton>
      <UiButton
        v-if="issue.state === 'open'"
        :disabled="disabled"
        @click="emit('close')"
      >
        Fechar
      </UiButton>
      <UiButton v-else :disabled="disabled" @click="emit('reopen')">
        Reabrir
      </UiButton>
      <UiButton
        icon
        variant="ghost"
        class="git-issue-remove"
        :disabled="disabled"
        :aria-label="`Remover issue #${issue.number}`"
        title="Remover issue"
        @click="emit('remove')"
      >
        <TrashIcon aria-hidden="true" />
      </UiButton>
      <a
        class="git-issue-link"
        :href="issue.url"
        target="_blank"
        rel="noopener noreferrer"
        :aria-label="`Abrir issue #${issue.number} no GitHub`"
        title="Abrir no GitHub"
      >
        <ArrowTopRightOnSquareIcon aria-hidden="true" />
      </a>
    </div>

    <div v-if="expanded" class="git-issue-body">
      <p v-if="issue.body.trim()">{{ issue.body }}</p>
      <p v-else class="git-issue-body-empty">Sem descrição.</p>
    </div>
  </article>
</template>

<style scoped>
.git-issue-row {
  border-top: 1px solid var(--border);
}

.git-issue-row:first-child {
  border-top: 0;
}

.git-issue-main {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
}

.git-issue-toggle {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 0;
  border-radius: 8px;
  color: var(--text-dim);
  background: transparent;
  cursor: pointer;
}

.git-issue-toggle:hover {
  background: var(--surface-2);
}

.git-issue-toggle svg {
  width: 16px;
  height: 16px;
}

.git-issue-chevron {
  transition: transform 150ms ease;
}

.git-issue-chevron[data-open='true'] {
  transform: rotate(90deg);
}

.git-issue-state {
  width: 18px !important;
  height: 18px !important;
}

.git-issue-row[data-state='open'] .git-issue-state {
  color: var(--success-text);
}

.git-issue-row[data-state='closed'] .git-issue-state {
  color: var(--accent);
}

.git-issue-info {
  min-width: 0;
  flex: 1;
}

.git-issue-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.git-issue-heading strong {
  font-weight: 650;
}

.git-issue-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 3px;
  color: var(--text-dim);
  font-size: 12.5px;
}

.git-issue-meta code {
  color: var(--text-muted);
  font-family: var(--font-family-mono);
}

.git-issue-remove:hover:not(:disabled) {
  color: var(--danger-text, #f85149);
}

.git-issue-link {
  display: inline-flex;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: var(--text-dim);
}

.git-issue-link:hover {
  color: var(--text);
  background: var(--surface-2);
}

.git-issue-link svg {
  width: 16px;
  height: 16px;
}

.git-issue-body {
  padding: 0 16px 14px 62px;
}

.git-issue-body p {
  max-height: 280px;
  margin: 0;
  overflow: auto;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  background: var(--surface-0);
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.git-issue-body .git-issue-body-empty {
  color: var(--text-dim);
}
</style>
