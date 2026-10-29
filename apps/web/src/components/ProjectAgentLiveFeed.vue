<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

import type { AgentLiveEvent } from '../api/agent-runtime';

const props = defineProps<{
  events: AgentLiveEvent[];
  running: boolean;
}>();

const list = ref<HTMLElement | null>(null);

const KIND_LABEL: Record<AgentLiveEvent['kind'], string> = {
  text: 'Claude',
  tool: 'Ferramenta',
  result: 'Resultado',
  error: 'Aviso',
};

function time(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('pt-BR', { hour12: false });
}

// Acompanha o fim do feed, a não ser que a pessoa tenha rolado para cima para ler.
watch(
  () => props.events.length,
  async () => {
    const element = list.value;
    if (!element) return;
    const nearBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    await nextTick();
    if (nearBottom) element.scrollTop = element.scrollHeight;
  },
);
</script>

<template>
  <section class="live-feed" aria-label="Atividade ao vivo">
    <header>
      <strong>Atividade ao vivo</strong>
      <span v-if="running" class="live-feed-pulse" aria-label="Em execução">
        Em execução
      </span>
    </header>
    <ol v-if="events.length > 0" ref="list" class="live-feed-list">
      <li v-for="event in events" :key="event.seq" :data-kind="event.kind">
        <span class="live-feed-kind">
          {{ event.tool ? event.tool : KIND_LABEL[event.kind] }}
        </span>
        <span class="live-feed-text">{{ event.text }}</span>
        <time>{{ time(event.at) }}</time>
      </li>
    </ol>
    <p v-else class="live-feed-empty">
      {{
        running
          ? 'Aguardando o primeiro sinal do Claude…'
          : 'Sem atividade registrada nesta execução.'
      }}
    </p>
  </section>
</template>

<style scoped>
.live-feed {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-0);
}

.live-feed header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}

.live-feed-pulse {
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
}

.live-feed-pulse::before {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  border-radius: 50%;
  background: var(--accent);
  content: '';
  animation: live-feed-blink 1.2s ease-in-out infinite;
}

@keyframes live-feed-blink {
  50% {
    opacity: 0.25;
  }
}

.live-feed-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 280px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.live-feed-list li {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: baseline;
  font-size: 12.5px;
  line-height: 1.45;
}

.live-feed-kind {
  overflow: hidden;
  color: var(--text-muted);
  font-family: var(--font-family-mono);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

li[data-kind='tool'] .live-feed-kind {
  color: var(--accent);
}

li[data-kind='error'] .live-feed-kind,
li[data-kind='error'] .live-feed-text {
  color: var(--danger-text);
}

.live-feed-text {
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

li[data-kind='tool'] .live-feed-text {
  font-family: var(--font-family-mono);
  font-size: 12px;
}

.live-feed-list time {
  color: var(--text-dim);
  font-size: 11px;
}

.live-feed-empty {
  margin: 0;
  color: var(--text-muted);
  font-size: 12.5px;
}
</style>
