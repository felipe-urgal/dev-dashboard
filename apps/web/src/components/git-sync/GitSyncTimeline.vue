<script setup lang="ts">
import { ref } from 'vue';
import {
  CheckIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

import {
  formatDuration,
  type TimelineResult,
} from '../../utils/git-sync-status';
import UiButton from '../ui/UiButton.vue';

defineProps<{
  timeline: TimelineResult;
  /** Mensagem final da API (sucesso) ou o erro, quando não há passos. */
  message: string;
  error: string;
  lastSyncLabel: string;
  canClear: boolean;
}>();

const emit = defineEmits<{ clear: [] }>();

const open = ref<Record<string, boolean>>({});
</script>

<template>
  <section class="git-timeline" aria-label="Atividade da sincronização">
    <header>
      <strong>Atividade</strong>
      <span class="git-timeline-spacer" />
      <UiButton size="sm" :disabled="!canClear" @click="emit('clear')">
        Limpar
      </UiButton>
    </header>

    <p v-if="timeline.steps.length === 0 && !message && !error" class="muted">
      Nenhuma sincronização nesta sessão. Última execução:
      {{ lastSyncLabel }}.
    </p>

    <ol v-if="timeline.steps.length > 0" role="log" aria-live="polite">
      <li v-for="step in timeline.steps" :key="step.id">
        <span class="git-timeline-icon" :data-status="step.status">
          <CheckIcon v-if="step.status === 'success'" aria-hidden="true" />
          <XMarkIcon v-else-if="step.status === 'error'" aria-hidden="true" />
          <ExclamationTriangleIcon
            v-else-if="step.status === 'warning'"
            aria-hidden="true"
          />
          <span v-else class="git-timeline-dot" aria-hidden="true" />
        </span>
        <div class="git-timeline-text">
          <span>{{ step.label }}</span>
          <small v-if="step.status !== 'success'">{{ step.message }}</small>
          <code v-if="open[step.id] && step.command">$ {{ step.command }}</code>
        </div>
        <button
          v-if="step.command"
          type="button"
          class="git-timeline-toggle"
          :aria-expanded="Boolean(open[step.id])"
          @click="open[step.id] = !open[step.id]"
        >
          comando
        </button>
        <time>{{ formatDuration(step.durationMs) }}</time>
      </li>
    </ol>

    <p
      v-if="timeline.outcome === 'success' || (!timeline.outcome && message)"
      class="git-timeline-result"
      data-tone="ok"
    >
      <CheckIcon aria-hidden="true" />
      Concluída<template v-if="timeline.totalMs !== null">
        em {{ formatDuration(timeline.totalMs) }}</template
      >: {{ message || 'main atualizada.' }}
    </p>
    <p
      v-else-if="timeline.outcome === 'error' || error"
      class="git-timeline-result"
      data-tone="err"
      role="alert"
    >
      <XMarkIcon aria-hidden="true" />
      {{ error || 'A sincronização falhou.' }}
    </p>
  </section>
</template>

<style scoped>
.git-timeline {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-1);
}

.git-timeline > header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
}

.git-timeline-spacer {
  flex: 1 1 0;
}

.muted {
  margin: 0;
  padding: 14px 16px;
  color: var(--text-dim);
  font-size: 13px;
}

ol {
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 11px 16px;
  border-top: 1px solid var(--border);
}

li:first-child {
  border-top: 0;
}

.git-timeline-icon {
  display: grid;
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  margin-top: 1px;
  place-items: center;
  border-radius: 50%;
  color: var(--text-muted);
  background: var(--surface-3);
}

.git-timeline-icon svg {
  width: 13px;
  height: 13px;
  stroke-width: 2.5;
}

.git-timeline-icon[data-status='success'] {
  color: var(--success-text);
  background: color-mix(in srgb, var(--success-text) 22%, transparent);
}

.git-timeline-icon[data-status='error'] {
  color: var(--danger-text);
  background: color-mix(in srgb, var(--danger-text) 22%, transparent);
}

.git-timeline-icon[data-status='warning'] {
  color: var(--warning-text);
  background: color-mix(in srgb, var(--warning-text) 22%, transparent);
}

.git-timeline-icon[data-status='running'] {
  color: var(--accent);
  background: var(--accent-soft);
}

.git-timeline-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentcolor;
  animation: git-timeline-pulse 1s ease-in-out infinite;
}

@keyframes git-timeline-pulse {
  50% {
    opacity: 0.3;
  }
}

.git-timeline-text {
  min-width: 0;
  flex: 1;
}

.git-timeline-text small {
  display: block;
  color: var(--text-dim);
  font-size: 12px;
}

.git-timeline-text code {
  display: block;
  margin-top: 6px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-muted);
  background: var(--surface-0);
  font-family: var(--font-family-mono);
  font-size: 12px;
}

.git-timeline-toggle {
  padding: 0;
  border: 0;
  color: var(--text-dim);
  background: transparent;
  font: inherit;
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
}

time {
  min-width: 52px;
  color: var(--text-dim);
  font-family: var(--font-family-mono);
  font-size: 12px;
  text-align: right;
}

.git-timeline-result {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  font-size: 13.5px;
}

.git-timeline-result svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.git-timeline-result[data-tone='ok'] {
  color: var(--success-text);
  background: color-mix(in srgb, var(--success-text) 10%, transparent);
}

.git-timeline-result[data-tone='err'] {
  color: var(--danger-text);
  background: color-mix(in srgb, var(--danger-text) 10%, transparent);
}
</style>
