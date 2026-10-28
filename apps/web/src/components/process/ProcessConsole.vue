<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { MagnifyingGlassIcon } from '@heroicons/vue/24/outline';

import type {
  ProcessLogFilter,
  ProcessLogParser,
} from '../../utils/process-log-lines';
import UiButton from '../ui/UiButton.vue';

const props = withDefaults(
  defineProps<{
    content: string;
    parse: ProcessLogParser;
    /** Filtros por tipo de linha; o primeiro é o padrão. */
    filters: ProcessLogFilter[];
    running: boolean;
    maskedCount: number;
    clearable: boolean;
    clearing: boolean;
    title?: string;
    /** Mostra o alternador de detalhes técnicos (pid, tid). */
    technical?: boolean;
  }>(),
  { title: 'Console', technical: false },
);

const emit = defineEmits<{ clear: [] }>();

const query = ref('');
const activeFilter = ref(props.filters[0]?.id ?? 'all');
/** `mark` esmaece o que não casa com a busca; `hide` remove essas linhas. */
const mode = ref<'mark' | 'hide'>('mark');
const follow = ref(true);
const wrap = ref(false);
const showTechnical = ref(false);
const copied = ref(false);
const scroller = ref<HTMLElement | null>(null);

const lines = computed(() => props.parse(props.content));
const hasTimestamps = computed(() => lines.value.some((line) => line.time));

const normalizedQuery = computed(() => query.value.trim().toLowerCase());

const visibleLines = computed(() => {
  const allowed = props.filters.find(
    (filter) => filter.id === activeFilter.value,
  )?.kinds;

  return lines.value
    .filter((line) => !allowed || allowed.includes(line.kind))
    .map((line) => ({
      ...line,
      hit:
        normalizedQuery.value !== '' &&
        line.text.toLowerCase().includes(normalizedQuery.value),
    }))
    .filter(
      (line) => mode.value === 'mark' || !normalizedQuery.value || line.hit,
    );
});

const errorCount = computed(
  () => lines.value.filter((line) => line.kind === 'err').length,
);
const warningCount = computed(
  () => lines.value.filter((line) => line.kind === 'warn').length,
);

async function scrollToEnd(): Promise<void> {
  await nextTick();
  const element = scroller.value;
  if (element && follow.value) element.scrollTop = element.scrollHeight;
}

watch(() => [props.content, visibleLines.value.length], scrollToEnd, {
  flush: 'post',
});

function handleScroll(): void {
  const element = scroller.value;
  if (!element) return;
  // Rolar para cima pausa o acompanhamento; voltar ao fim o retoma.
  follow.value =
    element.scrollHeight - element.scrollTop - element.clientHeight < 40;
}

function toggleFollow(): void {
  follow.value = !follow.value;
  if (follow.value) void scrollToEnd();
}

async function copyAll(): Promise<void> {
  if (!navigator.clipboard) return;
  try {
    await navigator.clipboard.writeText(
      lines.value.map((line) => line.text).join('\n'),
    );
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    copied.value = false;
  }
}
</script>

<template>
  <section class="process-console" aria-label="Console de execução">
    <div class="process-console-toolbar">
      <strong>{{ title }}</strong>

      <label class="process-console-search">
        <MagnifyingGlassIcon aria-hidden="true" />
        <input
          v-model="query"
          type="search"
          placeholder="Buscar no log"
          aria-label="Buscar no log"
        />
      </label>

      <div
        class="process-console-segment"
        role="group"
        aria-label="Tipo de linha"
      >
        <button
          v-for="filter in filters"
          :key="filter.id"
          type="button"
          :aria-pressed="activeFilter === filter.id"
          @click="activeFilter = filter.id"
        >
          {{ filter.label }}
        </button>
      </div>

      <div
        class="process-console-segment"
        role="group"
        aria-label="Modo da busca"
      >
        <button
          type="button"
          :aria-pressed="mode === 'hide'"
          @click="mode = 'hide'"
        >
          Ocultar
        </button>
        <button
          type="button"
          :aria-pressed="mode === 'mark'"
          @click="mode = 'mark'"
        >
          Destacar
        </button>
      </div>

      <span class="process-console-spacer" />

      <UiButton
        v-if="technical"
        size="sm"
        :aria-pressed="showTechnical"
        @click="showTechnical = !showTechnical"
      >
        Detalhes técnicos
      </UiButton>
      <UiButton size="sm" :aria-pressed="follow" @click="toggleFollow">
        Seguir o final
      </UiButton>
      <UiButton size="sm" :aria-pressed="wrap" @click="wrap = !wrap">
        Quebrar linhas
      </UiButton>
      <UiButton size="sm" :disabled="lines.length === 0" @click="copyAll">
        {{ copied ? 'Copiado' : 'Copiar' }}
      </UiButton>
      <UiButton
        size="sm"
        :disabled="!clearable || clearing"
        @click="emit('clear')"
      >
        {{ clearing ? 'Limpando…' : 'Limpar' }}
      </UiButton>
    </div>

    <div
      ref="scroller"
      class="process-console-lines"
      :class="{ 'process-console-wrap': wrap }"
      role="log"
      @scroll.passive="handleScroll"
    >
      <slot v-if="lines.length === 0" name="empty" />
      <div
        v-for="line in visibleLines"
        :key="line.n"
        class="process-console-line"
        :data-kind="line.kind"
        :data-hit="line.hit && mode === 'mark' ? 'true' : undefined"
        :data-dim="
          normalizedQuery && mode === 'mark' && !line.hit ? 'true' : undefined
        "
      >
        <span class="process-console-number">{{ line.n }}</span>
        <span v-if="hasTimestamps" class="process-console-time">
          {{ line.time }}
        </span>
        <span
          v-if="hasTimestamps"
          class="process-console-level"
          :data-level="line.level"
        >
          {{ line.level }}
        </span>
        <span v-if="showTechnical && line.tech" class="process-console-tech">
          {{ line.tech }}
        </span>
        <span class="process-console-text">
          <template v-if="line.parts">
            <span
              v-for="(part, index) in line.parts"
              :key="index"
              :data-tone="part.tone"
              >{{ part.text }}</span
            >
          </template>
          <template v-else>{{ line.text }}</template>
        </span>
      </div>
    </div>

    <footer class="process-console-footer">
      <span>{{ lines.length }} linhas</span>
      <span>{{ errorCount }} erros · {{ warningCount }} avisos</span>
      <span v-if="maskedCount > 0">{{ maskedCount }} valores mascarados</span>
      <span class="process-console-spacer" />
      <span>
        {{
          running
            ? follow
              ? 'Seguindo o final'
              : 'Rolagem livre'
            : 'Sem processo ativo'
        }}
      </span>
    </footer>
  </section>
</template>

<style scoped>
.process-console {
  display: flex;
  min-height: 0;
  flex: 1 1 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-0);
}

.process-console-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-1);
}

.process-console-toolbar > strong {
  margin: 0 6px 0 4px;
}

.process-console-spacer {
  flex: 1 1 0;
}

.process-console-search {
  display: flex;
  min-width: 220px;
  height: 30px;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  color: var(--text-dim);
}

.process-console-search svg {
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
}

.process-console-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  color: var(--text);
  background: transparent;
  font: inherit;
  font-size: 13px;
  outline: none;
}

.process-console-search:focus-within {
  border-color: var(--accent);
}

.process-console-segment {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: 8px;
}

.process-console-segment button {
  height: 28px;
  padding: 0 11px;
  border: 0;
  color: var(--text-muted);
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.process-console-segment button + button {
  border-left: 1px solid var(--border-strong);
}

.process-console-segment button[aria-pressed='true'] {
  color: var(--accent);
  background: var(--accent-soft);
}

.process-console-toolbar :deep(.ui-button[aria-pressed='true']) {
  border-color: transparent;
  color: var(--accent);
  background: var(--accent-soft);
}

.process-console-lines {
  display: flex;
  min-height: 0;
  flex: 1 1 0;
  flex-direction: column;
  overflow: auto;
  padding: 10px 0;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  line-height: 1.75;
}

.process-console-line {
  display: flex;
  gap: 14px;
  padding: 0 16px;
}

.process-console-line:hover {
  background: var(--surface-1);
}

.process-console-number {
  width: 32px;
  flex: 0 0 auto;
  color: var(--text-dim);
  opacity: 0.6;
  text-align: right;
  user-select: none;
}

.process-console-time {
  width: 92px;
  flex: 0 0 auto;
  color: var(--text-dim);
  opacity: 0.8;
}

.process-console-level {
  width: 46px;
  flex: 0 0 auto;
  color: var(--text-dim);
  font-weight: 600;
}

.process-console-level[data-level='WARN'] {
  color: var(--warning-text);
}

.process-console-level[data-level='ERROR'],
.process-console-level[data-level='FATAL'] {
  color: var(--danger-text);
}

.process-console-tech {
  flex: 0 0 auto;
  color: var(--text-dim);
  opacity: 0.6;
}

.process-console-text [data-tone='accent'] {
  color: var(--accent);
  font-weight: 600;
}

.process-console-text [data-tone='dim'] {
  color: var(--text-dim);
}

.process-console-text [data-tone='ok'] {
  color: var(--success-text);
}

.process-console-text [data-tone='err'] {
  color: var(--danger-text);
}

.process-console-line[data-kind='job'] .process-console-text {
  color: var(--text);
}

.process-console-text {
  flex: 1;
  color: var(--text-muted);
  white-space: pre;
}

.process-console-wrap .process-console-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.process-console-line[data-kind='boot'] .process-console-text,
.process-console-line[data-kind='sql'] .process-console-text {
  color: var(--text-dim);
}

.process-console-line[data-kind='req'] .process-console-text {
  color: var(--text);
}

.process-console-line[data-kind='warn'] .process-console-text {
  color: var(--warning-text);
}

.process-console-line[data-kind='err'] {
  background: color-mix(in srgb, var(--danger-text) 10%, transparent);
}

.process-console-line[data-kind='err'] .process-console-text {
  color: var(--danger-text);
}

.process-console-line[data-hit='true'] {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.process-console-line[data-dim='true'] {
  opacity: 0.35;
}

.process-console-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 16px;
  padding: 8px 16px;
  border-top: 1px solid var(--border);
  color: var(--text-dim);
  background: var(--surface-1);
  font-size: 12px;
}
</style>
