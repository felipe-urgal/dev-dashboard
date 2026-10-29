<script setup lang="ts">
import { computed, ref } from 'vue';

import UiButton from '../ui/UiButton.vue';
import UiTag from '../ui/UiTag.vue';

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface ProductionHistoryItem {
  id: string;
  revision: string;
  subject?: string | undefined;
  statusLabel: string;
  tone: Tone;
  when: string;
  duration: string;
}

const props = defineProps<{
  items: readonly ProductionHistoryItem[];
  title?: string;
  subtitle?: string;
}>();

const PREVIEW = 6;
const expanded = ref(false);

const visible = computed(() =>
  expanded.value ? props.items : props.items.slice(0, PREVIEW),
);

function tagTone(
  tone: Tone,
): 'neutral' | 'accent' | 'warning' | 'success' | 'danger' {
  return tone === 'info' ? 'accent' : tone;
}
</script>

<template>
  <section class="prod-history" :aria-label="title ?? 'Últimos deployments'">
    <header>
      <h4>{{ title ?? 'Últimos deployments' }}</h4>
      <p v-if="subtitle">{{ subtitle }}</p>
    </header>

    <ul v-if="items.length > 0">
      <li v-for="item in visible" :key="item.id">
        <div class="prod-history-main">
          <UiTag :tone="tagTone(item.tone)">{{ item.statusLabel }}</UiTag>
          <code :title="item.revision">{{ item.revision.slice(0, 8) }}</code>
        </div>
        <p
          v-if="item.subject"
          class="prod-history-subject"
          :title="item.subject"
        >
          {{ item.subject }}
        </p>
        <small>{{ item.when }} · {{ item.duration }}</small>
      </li>
    </ul>
    <p v-else class="prod-history-empty">Nenhum deployment registrado ainda.</p>

    <UiButton
      v-if="items.length > PREVIEW"
      size="sm"
      @click="expanded = !expanded"
    >
      {{ expanded ? 'Ver menos' : `Ver mais (${items.length - PREVIEW})` }}
    </UiButton>
  </section>
</template>

<style scoped>
.prod-history {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.prod-history h4 {
  margin: 0;
  font-size: 15px;
}

.prod-history header p {
  margin: 2px 0 0;
  color: var(--text-dim);
  font-size: 12.5px;
}

.prod-history ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.prod-history li {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 0;
  border-top: 1px solid var(--border);
}

.prod-history li:first-child {
  border-top: 0;
  padding-top: 2px;
}

.prod-history-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.prod-history-main code {
  color: var(--accent);
  font-family: var(--font-family-mono);
  font-size: 12px;
}

.prod-history-subject {
  margin: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prod-history small {
  color: var(--text-dim);
  font-size: 12px;
}

.prod-history-empty {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
