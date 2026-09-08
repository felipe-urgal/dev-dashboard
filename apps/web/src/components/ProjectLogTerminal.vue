<script setup lang="ts">
import ProjectLogViewer from './ProjectLogViewer.vue';

withDefaults(
  defineProps<{
    content: string;
    running?: boolean;
    maskedCount?: number;
    clearable?: boolean;
    clearing?: boolean;
  }>(),
  { running: false, maskedCount: 0, clearable: true, clearing: false },
);

const emit = defineEmits<{ clear: [] }>();
</script>

<template>
  <ProjectLogViewer
    class="project-log-terminal"
    :content="content"
    title="Log do servidor"
    :running="running"
    :masked-count="maskedCount"
    :wrap="false"
    embedded
  >
    <template #actions>
      <button
        type="button"
        class="project-log-terminal-clear"
        :disabled="!clearable || clearing"
        @click="emit('clear')"
      >
        {{ clearing ? 'Limpando…' : 'Limpar' }}
      </button>
    </template>
  </ProjectLogViewer>
</template>

<style scoped>
.project-log-terminal {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  flex-direction: column;
}

.project-log-terminal :deep(.project-log-viewer-output) {
  height: 100%;
  max-height: none;
  flex: 1 1 auto;
}

.project-log-terminal-clear {
  min-height: 28px;
  padding: 4px 9px;
  border: 1px solid #484f58;
  border-radius: var(--radius-sm);
  color: #c9d1d9;
  background: #21262d;
  font: inherit;
  font-size: var(--font-xs);
  cursor: pointer;
}

.project-log-terminal-clear:hover:not(:disabled) {
  border-color: #8b949e;
  color: #fff;
}

.project-log-terminal-clear:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
