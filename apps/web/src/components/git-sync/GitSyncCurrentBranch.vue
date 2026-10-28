<script setup lang="ts">
import type { SyncTone } from '../../utils/git-sync-status';
import UiButton from '../ui/UiButton.vue';
import UiTag from '../ui/UiTag.vue';

defineProps<{
  name: string;
  remote: string | undefined;
  label: string;
  tone: SyncTone;
  canUpdate: boolean;
  busy: boolean;
}>();

const emit = defineEmits<{ update: [] }>();

const toneByState = {
  success: 'success',
  warning: 'warning',
  pending: 'accent',
  loading: 'neutral',
  idle: 'neutral',
} as const;
</script>

<template>
  <section class="git-current" aria-label="Atualização da branch atual">
    <UiTag mono>{{ name }}</UiTag>
    <span class="git-current-arrow" aria-hidden="true">←</span>
    <code>{{ remote ?? 'sem remoto' }}</code>
    <UiTag :tone="toneByState[tone]">{{ label }}</UiTag>
    <span class="git-current-spacer" />
    <UiButton :busy="busy" :disabled="!canUpdate" @click="emit('update')">
      {{ busy ? 'Atualizando…' : 'Atualizar local' }}
    </UiButton>
  </section>
</template>

<style scoped>
.git-current {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.git-current code {
  color: var(--text-muted);
  font-family: var(--font-family-mono);
  font-size: 13px;
  font-weight: 600;
}

.git-current-arrow {
  color: var(--text-dim);
}

.git-current-spacer {
  flex: 1 1 0;
}
</style>
