<script setup lang="ts">
import { ShareIcon } from '@heroicons/vue/24/outline';

withDefaults(
  defineProps<{
    name: string;
    /** Na barra global o nome já está no seletor de projeto. */
    showName?: boolean;
    branch: string;
    /** `undefined` enquanto o estado do Git não carregou. */
    clean?: boolean | undefined;
  }>(),
  { showName: true },
);
</script>

<template>
  <div class="project-identity" aria-current="page">
    <h2 v-if="showName">{{ name }}</h2>
    <span
      v-if="branch"
      class="project-identity-branch"
      :class="{
        'project-identity-branch-dirty': clean === false,
        'project-identity-branch-clean': clean === true,
      }"
      :title="
        clean === undefined
          ? undefined
          : clean
            ? 'Branch sem alterações'
            : 'Branch com alterações não commitadas'
      "
      aria-label="Branch atual"
    >
      <ShareIcon aria-hidden="true" />
      {{ branch }}
    </span>
  </div>
</template>

<style scoped>
.project-identity {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

h2 {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: 16px;
  letter-spacing: -0.02em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-identity-branch {
  display: inline-flex;
  min-height: 26px;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-2);
  font-family: var(--font-family-mono);
  font-size: 12px;
}

.project-identity-branch svg {
  width: 13px;
  height: 13px;
}

.project-identity-branch-dirty {
  color: var(--warning-text);
  background: var(--warning-surface);
}

.project-identity-branch-clean {
  color: var(--success-text);
  background: var(--success-surface);
}
</style>
