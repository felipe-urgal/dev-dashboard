<script setup lang="ts">
import type { GitCommitHistoryEntry } from '@dev-dashboard/contracts';

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
  <tr
    class="git-history-row"
    :class="{ active }"
    tabindex="0"
    role="button"
    :aria-label="`Abrir commit ${commit.shortHash}`"
    @click="emit('open')"
    @keydown.enter="emit('open')"
    @keydown.space.prevent="emit('open')"
  >
    <td class="git-history-time">{{ formatTime(commit.authoredAt) }}</td>
    <td class="git-history-subject">
      <span class="git-history-subject-inner">
        <code>{{ commit.shortHash }}</code>
        <span class="git-history-subject-text">{{ commit.subject }}</span>
        <em v-if="commit.parentCount >= 2">merge</em>
      </span>
    </td>
    <td class="git-history-author">
      <span class="git-history-avatar" aria-hidden="true">{{
        authorInitials(commit.authorName)
      }}</span>
      <span class="git-history-author-name" :title="commit.authorEmail">{{
        commit.authorName
      }}</span>
    </td>
    <td class="git-history-relative" :title="formatFullDate(commit.authoredAt)">
      {{ relativeTime(commit.authoredAt) }}
    </td>
    <td class="git-history-chevron" aria-hidden="true">›</td>
  </tr>
</template>
