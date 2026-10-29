<script setup lang="ts">
import { ChevronRightIcon } from '@heroicons/vue/24/outline';

import type { GitCommitHistoryEntry } from '@dev-dashboard/contracts';

import UiTag from './ui/UiTag.vue';

defineProps<{
  commit: GitCommitHistoryEntry;
  active: boolean;
  formatTime: (value: string) => string;
  formatFullDate: (value: string) => string;
  relativeTime: (value: string) => string;
  authorInitials: (value: string) => string;
}>();

const emit = defineEmits<{
  open: [];
}>();
</script>

<template>
  <div
    class="git-hist-row"
    :data-active="active || undefined"
    tabindex="0"
    role="button"
    :aria-label="`Abrir commit ${commit.shortHash}`"
    @click="emit('open')"
    @keydown.enter="emit('open')"
    @keydown.space.prevent="emit('open')"
  >
    <span class="git-hist-avatar" aria-hidden="true">{{
      authorInitials(commit.authorName)
    }}</span>

    <div class="git-hist-info">
      <div class="git-hist-subject">
        <strong :title="commit.subject">{{ commit.subject }}</strong>
        <UiTag v-if="commit.parentCount >= 2">merge</UiTag>
      </div>
      <div class="git-hist-meta">
        <code>{{ commit.shortHash }}</code>
        <span :title="commit.authorEmail">{{ commit.authorName }}</span>
        <span :title="formatFullDate(commit.authoredAt)">
          · {{ formatTime(commit.authoredAt) }} ·
          {{ relativeTime(commit.authoredAt) }}
        </span>
      </div>
    </div>

    <ChevronRightIcon class="git-hist-chevron" aria-hidden="true" />
  </div>
</template>

<style scoped>
.git-hist-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  cursor: pointer;
}

.git-hist-row:first-of-type {
  border-top: 0;
}

.git-hist-row:hover,
.git-hist-row[data-active] {
  background: var(--surface-2);
}

.git-hist-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.git-hist-avatar {
  display: inline-flex;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--accent);
  background: var(--accent-soft);
  font-size: 11px;
  font-weight: 700;
}

.git-hist-info {
  min-width: 0;
  flex: 1;
}

.git-hist-subject {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.git-hist-subject strong {
  overflow: hidden;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.git-hist-meta {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
  color: var(--text-dim);
  font-size: 12.5px;
}

.git-hist-meta code {
  color: var(--accent);
  font-family: var(--font-family-mono);
}

.git-hist-chevron {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  color: var(--text-dim);
}
</style>
