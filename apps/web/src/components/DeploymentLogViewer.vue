<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';

import type { DeploymentLog } from '@dev-dashboard/contracts';

interface Props {
  log: DeploymentLog;
  active?: boolean;
  open?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  active: false,
  open: false,
});

const output = ref<HTMLElement | null>(null);
const autoFollow = ref(true);

const ANSI_CSI_PATTERN = new RegExp('\\u001B\\[[0-?]*[ -/]*[@-~]', 'g');
const ANSI_OSC_PATTERN = new RegExp(
  '\\u001B\\][^\\u0007]*(?:\\u0007|\\u001B\\\\)',
  'g',
);

function stripAnsi(value: string): string {
  return value.replace(ANSI_OSC_PATTERN, '').replace(ANSI_CSI_PATTERN, '');
}

const content = computed(
  () => stripAnsi(props.log.content || '') || 'Nenhuma saída registrada.',
);
const lineCount = computed(() => content.value.split('\n').length);

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 32;
}

function handleScroll(): void {
  const element = output.value;
  if (!element) return;
  autoFollow.value = isNearBottom(element);
}

async function scrollToEnd(force = false): Promise<void> {
  if (!force && !autoFollow.value) return;
  await nextTick();
  const element = output.value;
  if (!element) return;
  element.scrollTop = element.scrollHeight;
}

function resumeAutoFollow(): void {
  autoFollow.value = true;
  void scrollToEnd(true);
}

function handleToggle(event: Event): void {
  const details = event.currentTarget as HTMLDetailsElement;
  if (details.open && autoFollow.value) void scrollToEnd(true);
}

watch(
  () => content.value,
  (nextContent, previousContent) => {
    if (nextContent === previousContent) return;
    void scrollToEnd();
  },
  { flush: 'post' },
);

onMounted(() => {
  if (props.open) void scrollToEnd(true);
});
</script>

<template>
  <details class="deployment-log" :open="open" @toggle="handleToggle">
    <summary>
      <span class="deployment-log-title">
        <span
          class="deployment-log-status-dot"
          :class="{ 'is-active': active }"
          aria-hidden="true"
        ></span>
        Log do deployment
      </span>
      <span class="deployment-log-summary-meta">
        {{ active ? 'Ao vivo' : `${lineCount} linhas` }}
      </span>
    </summary>

    <div class="deployment-log-toolbar">
      <div class="deployment-log-meta">
        <span v-if="log.masked">Conteúdo sensível mascarado</span>
        <span v-if="log.truncated">Log limitado à cauda disponível</span>
        <span v-if="active && autoFollow">Acompanhando o final</span>
      </div>
      <button
        v-if="!autoFollow"
        class="deployment-log-follow"
        type="button"
        @click="resumeAutoFollow"
      >
        Voltar ao final
      </button>
    </div>

    <pre
      ref="output"
      tabindex="0"
      aria-label="Saída do log do deployment"
      @scroll.passive="handleScroll"
      >{{ content }}</pre>
  </details>
</template>

<style scoped>
.deployment-log {
  margin-top: 14px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--code-surface);
}

.deployment-log[open] {
  border-color: color-mix(in srgb, var(--border-strong) 72%, var(--border));
}

.deployment-log summary {
  display: flex;
  min-height: var(--control-height-md);
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  color: var(--text);
  background: var(--surface-2);
  font-size: var(--font-sm);
  font-weight: var(--font-weight-strong);
  cursor: pointer;
  user-select: none;
}

.deployment-log summary:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: calc(var(--focus-ring-offset) * -1);
}

.deployment-log-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.deployment-log-status-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: var(--text-dim);
}

.deployment-log-status-dot.is-active {
  background: var(--info-text);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--info-text) 18%, transparent);
}

.deployment-log-summary-meta {
  color: var(--text-muted);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-body);
}

.deployment-log-toolbar {
  display: flex;
  min-height: var(--control-height-md);
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 12px;
  border-top: 1px solid var(--border);
  background: var(--surface-1);
}

.deployment-log-meta {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
}

.deployment-log-meta span {
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-muted);
  background: var(--surface-0);
  font-size: 9px;
  line-height: 1.2;
}

.deployment-log-follow {
  min-height: var(--control-height-sm);
  flex: 0 0 auto;
  padding: 5px 9px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--accent);
  background: var(--surface-0);
  font: inherit;
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
  cursor: pointer;
}

.deployment-log-follow:hover {
  background: var(--accent-soft);
}

.deployment-log-follow:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.deployment-log pre {
  width: 100%;
  min-height: 180px;
  max-height: min(52vh, 520px);
  margin: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 14px 16px 18px;
  border: 0;
  border-top: 1px solid var(--border);
  color: var(--code-text);
  background: var(--code-surface);
  font-family: var(--font-family-code);
  font-size: 11px;
  line-height: 1.6;
  tab-size: 2;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  scrollbar-gutter: stable;
}

.deployment-log pre:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: calc(var(--focus-ring-offset) * -1);
}

@media (max-width: 720px) {
  .deployment-log summary,
  .deployment-log-toolbar {
    align-items: flex-start;
  }

  .deployment-log-toolbar {
    flex-direction: column;
  }

  .deployment-log pre {
    max-height: 60vh;
    padding-inline: 12px;
    font-size: 10px;
  }
}
</style>
