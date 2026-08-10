<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue';

import './GitFileDiffView.css';
import type { GitUnifiedDiffLine } from '../utils/git-diff-view';
import {
  annotateGitDiffWordChanges,
  buildSplitGitDiffRows,
  parseUnifiedGitDiff,
  renderGitDiffLineHtml,
  splitGitDiffHunks,
} from '../utils/git-diff-view';

const props = defineProps<{
  content: string;
  path: string;
  viewMode: 'unified' | 'split';
  query?: string;
}>();

type SyntaxModule = typeof import('../utils/git-diff-syntax');

let syntaxModule: Promise<SyntaxModule | null> | undefined;

function loadSyntaxModule(): Promise<SyntaxModule | null> {
  syntaxModule ??= import('../utils/git-diff-syntax').catch(() => null);
  return syntaxModule;
}

const root = ref<HTMLElement | null>(null);
const lines = shallowRef<GitUnifiedDiffLine[]>([]);
const selectedViewMode = ref<'unified' | 'split'>(props.viewMode);
const isReviewContext = ref(false);
const isNarrow = ref(false);
const isExpanded = ref(false);
const filesCollapsed = ref(false);
let reviewWorkspace: HTMLElement | null = null;
let reviewContainer: HTMLElement | null = null;
let mediaQuery: MediaQueryList | null = null;
let focusedLineTimer: ReturnType<typeof setTimeout> | undefined;

const effectiveViewMode = computed<'unified' | 'split'>(() =>
  isReviewContext.value && isNarrow.value ? 'unified' : selectedViewMode.value,
);

function detectionSample(parsed: readonly GitUnifiedDiffLine[]): string {
  return parsed
    .filter((line) => line.kind === 'context' || line.kind === 'addition')
    .slice(0, 80)
    .map((line) => line.text)
    .join('\n');
}

/**
 * O realce de sintaxe e o diff de palavras são calculados uma vez por conteúdo:
 * mudar de unificado para lado a lado não recalcula nada.
 */
async function prepare(content: string, path: string): Promise<void> {
  const parsed = annotateGitDiffWordChanges(parseUnifiedGitDiff(content));
  lines.value = parsed;

  const syntax = await loadSyntaxModule();
  if (!syntax || props.content !== content) return;

  const language = syntax.detectLanguage(path, detectionSample(parsed));
  if (!language) return;

  lines.value = parsed.map((line) =>
    line.kind === 'addition' ||
    line.kind === 'deletion' ||
    line.kind === 'context'
      ? { ...line, syntax: syntax.syntaxRangesFor(line.text, language) }
      : line,
  );
}

watch(
  () => [props.content, props.path] as const,
  ([content, path]) => {
    void prepare(content, path);
  },
  { immediate: true },
);

watch(
  () => props.viewMode,
  (mode) => {
    if (!isReviewContext.value) selectedViewMode.value = mode;
  },
);

const groups = computed(() => splitGitDiffHunks(lines.value));

function linePrefix(kind: string): string {
  if (kind === 'addition') return '+';
  if (kind === 'deletion') return '−';
  if (kind === 'context') return ' ';
  return '';
}

function highlighted(line: GitUnifiedDiffLine): string {
  return renderGitDiffLineHtml(line.text, {
    ...(line.words ? { words: line.words } : {}),
    ...(line.syntax ? { syntax: line.syntax } : {}),
    ...(props.query ? { query: props.query } : {}),
  });
}

function splitRows(hunkLines: readonly GitUnifiedDiffLine[]) {
  return buildSplitGitDiffRows(hunkLines);
}

function selectViewMode(mode: 'unified' | 'split'): void {
  if (mode === 'split' && isNarrow.value) return;
  selectedViewMode.value = mode;
}

function toggleFiles(): void {
  filesCollapsed.value = !filesCollapsed.value;
  reviewWorkspace?.classList.toggle('is-files-collapsed', filesCollapsed.value);
}

function toggleExpanded(): void {
  isExpanded.value = !isExpanded.value;
  reviewWorkspace?.classList.toggle('is-diff-expanded', isExpanded.value);
}

function updateNarrowMode(event?: MediaQueryListEvent): void {
  isNarrow.value = event?.matches ?? mediaQuery?.matches ?? false;
}

function clearFocusedLine(): void {
  if (focusedLineTimer) clearTimeout(focusedLineTimer);
  focusedLineTimer = undefined;
  root.value
    ?.querySelectorAll('.is-review-focus')
    .forEach((element) => element.classList.remove('is-review-focus'));
}

function focusReviewLine(lineNumber: number): void {
  clearFocusedLine();
  const expected = String(lineNumber);
  let target: HTMLElement | null = null;

  if (effectiveViewMode.value === 'unified') {
    for (const row of root.value?.querySelectorAll<HTMLElement>(
      '.git-diff-unified-row',
    ) ?? []) {
      const numbers = row.querySelectorAll<HTMLElement>(
        '.git-diff-line-number',
      );
      if (numbers[1]?.textContent?.trim() === expected) {
        target = row;
        break;
      }
    }
  } else {
    for (const row of root.value?.querySelectorAll<HTMLElement>(
      '.git-diff-split-row',
    ) ?? []) {
      const number = row.querySelector<HTMLElement>(
        '.git-diff-side-cell:nth-child(2) .git-diff-line-number',
      );
      if (number?.textContent?.trim() === expected) {
        target = row;
        break;
      }
    }
  }

  if (!target) return;
  target.classList.add('is-review-focus');
  target.scrollIntoView({
    block: 'center',
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth',
  });
  focusedLineTimer = setTimeout(
    () => target?.classList.remove('is-review-focus'),
    1_800,
  );
}

function handleReviewAction(event: Event): void {
  const source = event.target;
  if (!(source instanceof Element)) return;
  const button = source.closest<HTMLButtonElement>(
    '.git-code-review-finding-actions button',
  );
  if (!button || !button.textContent?.includes('Ver no diff')) return;

  const finding = button.closest<HTMLElement>('.git-code-review-finding');
  const lineLabel = finding?.querySelector<HTMLElement>(
    '.git-code-review-finding-copy > small',
  )?.textContent;
  const line = lineLabel?.match(/\b(\d+)\b/)?.[1];
  if (!line) return;

  event.preventDefault();
  event.stopPropagation();
  focusReviewLine(Number(line));
}

onMounted(() => {
  const diffPanel = root.value?.closest<HTMLElement>(
    '.git-code-review-diff-panel',
  );
  if (!diffPanel) return;

  isReviewContext.value = true;
  selectedViewMode.value = 'unified';
  reviewWorkspace = diffPanel.closest<HTMLElement>(
    '.git-code-review-workspace',
  );
  reviewContainer = diffPanel.closest<HTMLElement>(
    '.git-code-review-file-review',
  );
  reviewWorkspace?.classList.add('is-diff-enhanced');
  reviewContainer?.addEventListener('click', handleReviewAction, true);

  mediaQuery = window.matchMedia('(max-width: 760px)');
  updateNarrowMode();
  mediaQuery.addEventListener('change', updateNarrowMode);
});

onBeforeUnmount(() => {
  clearFocusedLine();
  reviewContainer?.removeEventListener('click', handleReviewAction, true);
  mediaQuery?.removeEventListener('change', updateNarrowMode);
  reviewWorkspace?.classList.remove(
    'is-diff-enhanced',
    'is-files-collapsed',
    'is-diff-expanded',
  );
});
</script>

<template>
  <div ref="root" class="git-file-diff-view">
    <div v-if="isReviewContext" class="git-file-diff-toolbar">
      <div class="git-file-diff-view-modes" aria-label="Modo de visualização">
        <button
          type="button"
          :class="{ active: effectiveViewMode === 'unified' }"
          :aria-pressed="effectiveViewMode === 'unified'"
          @click="selectViewMode('unified')"
        >
          Unificado
        </button>
        <button
          type="button"
          :class="{ active: effectiveViewMode === 'split' }"
          :aria-pressed="effectiveViewMode === 'split'"
          :disabled="isNarrow"
          :title="isNarrow ? 'Lado a lado requer mais largura' : undefined"
          @click="selectViewMode('split')"
        >
          Lado a lado
        </button>
      </div>
      <div class="git-file-diff-layout-actions">
        <button
          type="button"
          :aria-pressed="filesCollapsed"
          @click="toggleFiles"
        >
          {{ filesCollapsed ? 'Mostrar arquivos' : 'Ocultar arquivos' }}
        </button>
        <button
          type="button"
          :aria-pressed="isExpanded"
          @click="toggleExpanded"
        >
          {{ isExpanded ? 'Restaurar' : 'Expandir diff' }}
        </button>
      </div>
    </div>

    <div
      :class="
        effectiveViewMode === 'split' ? 'git-diff-split' : 'git-diff-unified'
      "
      role="table"
      :aria-label="`Diff de ${path}`"
    >
      <div
        v-for="(line, index) in groups.leading"
        :key="`leading-${index}`"
        class="git-diff-unified-row is-meta"
        role="row"
      >
        <span class="git-diff-line-number" role="cell"></span>
        <span class="git-diff-line-number" role="cell"></span>
        <span class="git-diff-line-prefix" role="cell"></span>
        <code role="cell" v-html="highlighted(line)"></code>
      </div>

      <template
        v-for="(hunk, hunkIndex) in groups.hunks"
        :key="`hunk-${hunkIndex}`"
      >
        <div class="git-diff-hunk-head" role="row">
          <code role="cell">{{ hunk.header.text }}</code>
        </div>

        <template v-if="effectiveViewMode === 'unified'">
          <div
            v-for="(line, lineIndex) in hunk.lines"
            :key="`u-${hunkIndex}-${lineIndex}`"
            class="git-diff-unified-row"
            :class="`is-${line.kind}`"
            role="row"
          >
            <span class="git-diff-line-number" role="cell">{{
              line.oldLine ?? ''
            }}</span>
            <span class="git-diff-line-number" role="cell">{{
              line.newLine ?? ''
            }}</span>
            <span class="git-diff-line-prefix" role="cell">{{
              linePrefix(line.kind)
            }}</span>
            <code role="cell" v-html="highlighted(line)"></code>
          </div>
        </template>

        <template v-else>
          <template
            v-for="(row, rowIndex) in splitRows(hunk.lines)"
            :key="`s-${hunkIndex}-${rowIndex}`"
          >
            <div
              v-if="row.kind === 'meta'"
              class="git-diff-split-meta"
              role="row"
            >
              <code
                role="cell"
                v-html="highlighted(row.left ?? row.right!)"
              ></code>
            </div>

            <div v-else class="git-diff-split-row" role="row">
              <div
                class="git-diff-side-cell"
                :class="row.left ? `is-${row.left.kind}` : 'is-empty'"
              >
                <span class="git-diff-line-number" role="cell">{{
                  row.left?.oldLine ?? ''
                }}</span>
                <span class="git-diff-line-prefix" role="cell">{{
                  row.left ? linePrefix(row.left.kind) : ''
                }}</span>
                <code
                  v-if="row.left"
                  role="cell"
                  v-html="highlighted(row.left)"
                ></code>
                <code v-else role="cell"></code>
              </div>
              <div
                class="git-diff-side-cell"
                :class="row.right ? `is-${row.right.kind}` : 'is-empty'"
              >
                <span class="git-diff-line-number" role="cell">{{
                  row.right?.newLine ?? ''
                }}</span>
                <span class="git-diff-line-prefix" role="cell">{{
                  row.right ? linePrefix(row.right.kind) : ''
                }}</span>
                <code
                  v-if="row.right"
                  role="cell"
                  v-html="highlighted(row.right)"
                ></code>
                <code v-else role="cell"></code>
              </div>
            </div>
          </template>
        </template>
      </template>
    </div>
  </div>
</template>
