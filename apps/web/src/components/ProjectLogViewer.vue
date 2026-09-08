<script setup lang="ts">
import { ClipboardDocumentIcon } from '@heroicons/vue/24/outline';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

const ANSI_CSI_PATTERN = new RegExp('\\u001B\\[[0-?]*[ -/]*[@-~]', 'g');
const ANSI_OSC_PATTERN = new RegExp(
  '\\u001B\\][^\\u0007]*(?:\\u0007|\\u001B\\\\)',
  'g',
);

function stripAnsi(value: string): string {
  return value.replace(ANSI_OSC_PATTERN, '').replace(ANSI_CSI_PATTERN, '');
}

const props = withDefaults(
  defineProps<{
    content: string;
    title?: string;
    running?: boolean;
    maskedCount?: number;
    truncated?: boolean;
    emptyLabel?: string;
    wrap?: boolean;
    follow?: boolean;
    embedded?: boolean;
    stripAnsi?: boolean;
  }>(),
  {
    title: 'Log',
    running: false,
    maskedCount: 0,
    truncated: false,
    emptyLabel: 'Nenhuma saída registrada.',
    wrap: true,
    follow: true,
    embedded: false,
    stripAnsi: true,
  },
);

const output = ref<HTMLElement | null>(null);
const autoFollow = ref(true);
const copyMessage = ref('');
let copyMessageTimer: number | undefined;

const normalizedContent = computed(() =>
  props.stripAnsi ? stripAnsi(props.content) : props.content,
);
const displayedContent = computed(
  () => normalizedContent.value || props.emptyLabel,
);
const lineCount = computed(() =>
  normalizedContent.value ? normalizedContent.value.split(/\r?\n/).length : 0,
);

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 32;
}

function handleScroll(): void {
  if (!props.follow) return;
  const element = output.value;
  if (element) autoFollow.value = isNearBottom(element);
}

async function scrollToEnd(force = false): Promise<void> {
  if (!props.follow || (!force && !autoFollow.value)) return;
  await nextTick();
  const element = output.value;
  if (element) element.scrollTop = element.scrollHeight;
}

function resumeAutoFollow(): void {
  autoFollow.value = true;
  void scrollToEnd(true);
}

async function copyAll(): Promise<void> {
  if (!normalizedContent.value || !navigator.clipboard) return;

  window.clearTimeout(copyMessageTimer);
  try {
    await navigator.clipboard.writeText(normalizedContent.value);
    copyMessage.value = 'Copiado';
  } catch {
    copyMessage.value = 'Falha ao copiar';
  }
  copyMessageTimer = window.setTimeout(() => (copyMessage.value = ''), 1_500);
}

watch(
  () => props.content,
  (nextContent, previousContent) => {
    if (nextContent !== previousContent) void scrollToEnd();
  },
  { flush: 'post' },
);

onMounted(() => void scrollToEnd(true));
onBeforeUnmount(() => window.clearTimeout(copyMessageTimer));
</script>

<template>
  <section
    class="project-log-viewer"
    :class="{
      'project-log-viewer--embedded': embedded,
      'project-log-viewer--nowrap': !wrap,
    }"
    :aria-label="title"
  >
    <header class="project-log-viewer-header">
      <div class="project-log-viewer-heading">
        <span
          class="project-log-viewer-status"
          :class="{ 'is-running': running }"
          aria-hidden="true"
        ></span>
        <strong>{{ title }}</strong>
        <span>{{ running ? 'Ao vivo' : `${lineCount} linhas` }}</span>
      </div>

      <div class="project-log-viewer-actions">
        <span
          v-if="copyMessage"
          class="project-log-viewer-copy-status"
          role="status"
        >
          {{ copyMessage }}
        </span>
        <button
          type="button"
          class="project-log-viewer-button"
          :disabled="!normalizedContent"
          aria-label="Copiar todo o log"
          @click="copyAll"
        >
          <ClipboardDocumentIcon aria-hidden="true" />
          Copiar tudo
        </button>
        <slot name="actions" />
      </div>
    </header>

    <div
      v-if="maskedCount || truncated || (running && autoFollow)"
      class="project-log-viewer-meta"
    >
      <span v-if="maskedCount">
        {{ maskedCount }} segredo{{ maskedCount === 1 ? '' : 's' }} ocultado{{
          maskedCount === 1 ? '' : 's'
        }}
      </span>
      <span v-if="truncated">O início do log foi truncado</span>
      <span v-if="running && autoFollow">Acompanhando o final</span>
    </div>

    <button
      v-if="follow && !autoFollow"
      type="button"
      class="project-log-viewer-follow"
      @click="resumeAutoFollow"
    >
      Voltar ao final
    </button>

    <div
      ref="output"
      class="project-log-viewer-output"
      tabindex="0"
      aria-label="Conteúdo do log. Selecione o texto para copiar."
      @scroll.passive="handleScroll"
    >
      <slot>
        <pre>{{ displayedContent }}</pre>
      </slot>
    </div>
  </section>
</template>

<style scoped>
.project-log-viewer {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: 1px solid #30363d;
  border-radius: var(--radius-md);
  color: #e6edf3;
  background: #0d1117;
  color-scheme: dark;
}

.project-log-viewer--embedded {
  border: 0;
  border-radius: 0;
}

.project-log-viewer-header,
.project-log-viewer-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 40px;
  padding: 7px 12px;
  border-bottom: 1px solid #30363d;
  background: #161b22;
}

.project-log-viewer-heading,
.project-log-viewer-actions {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.project-log-viewer-heading {
  font-size: var(--font-sm);
}

.project-log-viewer-heading > span:last-child,
.project-log-viewer-copy-status {
  color: #8b949e;
  font-size: var(--font-xs);
}

.project-log-viewer-status {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #6e7681;
}

.project-log-viewer-status.is-running {
  background: #3fb950;
  box-shadow: 0 0 0 3px rgb(63 185 80 / 16%);
}

.project-log-viewer-button,
.project-log-viewer-follow {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: 6px;
  padding: 4px 9px;
  border: 1px solid #484f58;
  border-radius: var(--radius-sm);
  color: #c9d1d9;
  background: #21262d;
  font: inherit;
  font-size: var(--font-xs);
  cursor: pointer;
}

.project-log-viewer-button svg {
  width: 14px;
}

.project-log-viewer-button:hover:not(:disabled),
.project-log-viewer-follow:hover {
  border-color: #8b949e;
  color: #fff;
}

.project-log-viewer-button:focus-visible,
.project-log-viewer-follow:focus-visible,
.project-log-viewer-output:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: calc(var(--focus-ring-offset) * -1);
}

.project-log-viewer-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.project-log-viewer-meta {
  min-height: 32px;
  justify-content: flex-start;
  flex-wrap: wrap;
  border-bottom-color: #30363d;
  background: #0d1117;
}

.project-log-viewer-meta span {
  padding: 3px 6px;
  border: 1px solid #30363d;
  border-radius: 999px;
  color: #8b949e;
  font-size: 10px;
}

.project-log-viewer-follow {
  position: absolute;
  z-index: 1;
  right: 12px;
  bottom: 12px;
}

.project-log-viewer-output {
  min-height: 140px;
  max-height: min(52vh, 520px);
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  user-select: text;
}

.project-log-viewer-output pre {
  min-width: 100%;
  width: max-content;
  margin: 0;
  padding: 14px 16px 18px;
  color: #e6edf3;
  background: #0d1117;
  font-family: var(--font-family-code);
  font-size: 12px;
  line-height: 1.6;
  tab-size: 2;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.project-log-viewer--nowrap .project-log-viewer-output pre {
  white-space: pre;
  overflow-wrap: normal;
}

@media (max-width: 720px) {
  .project-log-viewer-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .project-log-viewer-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
