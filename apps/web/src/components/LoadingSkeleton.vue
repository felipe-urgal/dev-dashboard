<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

interface Props {
  label?: string;
  rows?: number;
  delayMs?: number;
}

const props = withDefaults(defineProps<Props>(), {
  label: 'Carregando conteúdo…',
  rows: 3,
  delayMs: 150,
});

const visible = ref(props.delayMs === 0);
let delayTimer: ReturnType<typeof setTimeout> | undefined;

onMounted(() => {
  if (visible.value) return;
  delayTimer = setTimeout(() => {
    visible.value = true;
  }, props.delayMs);
});

onBeforeUnmount(() => {
  if (delayTimer) clearTimeout(delayTimer);
});
</script>

<template>
  <div class="loading-skeleton" aria-busy="true">
    <p class="sr-only" role="status" aria-live="polite">{{ label }}</p>

    <ul v-if="visible" class="loading-skeleton-list" aria-hidden="true">
      <li v-for="row in rows" :key="row" class="loading-skeleton-row">
        <span class="loading-skeleton-block loading-skeleton-avatar" />
        <span class="loading-skeleton-copy">
          <span class="loading-skeleton-block loading-skeleton-title" />
          <span class="loading-skeleton-block loading-skeleton-detail" />
        </span>
        <span class="loading-skeleton-block loading-skeleton-meta" />
      </li>
    </ul>
  </div>
</template>

<style scoped>
.loading-skeleton-list {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.loading-skeleton-row {
  display: flex;
  min-height: 82px;
  align-items: center;
  gap: var(--space-4);
  padding: 14px;
  border: 1px solid var(--border);
  background: var(--surface-1);
}

.loading-skeleton-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 9px;
}

.loading-skeleton-block {
  display: block;
  background: linear-gradient(
    90deg,
    var(--surface-2) 25%,
    var(--border) 50%,
    var(--surface-2) 75%
  );
  background-size: 200% 100%;
  animation: loading-skeleton-shimmer 1.4s ease-in-out infinite;
}

.loading-skeleton-avatar {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  border-radius: var(--radius-sm);
}

.loading-skeleton-title {
  width: min(230px, 55%);
  height: 13px;
  border-radius: 999px;
}

.loading-skeleton-detail {
  width: min(380px, 78%);
  height: 10px;
  border-radius: 999px;
}

.loading-skeleton-meta {
  width: 92px;
  height: 22px;
  flex: 0 0 auto;
  border-radius: 999px;
}

@keyframes loading-skeleton-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading-skeleton-block {
    background: var(--surface-2);
    animation: none;
  }
}

@media (max-width: 680px) {
  .loading-skeleton-row {
    align-items: flex-start;
  }
  .loading-skeleton-meta {
    width: 56px;
  }
}
</style>
