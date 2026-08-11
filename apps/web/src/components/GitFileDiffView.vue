<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue';

import type { GitPullRequestReviewFinding } from '@dev-dashboard/contracts';

import './GitFileDiffView.css';
import type { GitUnifiedDiffLine } from '../utils/git-diff-view';
import {
  annotateGitDiffWordChanges,
  buildSplitGitDiffRows,
  parseUnifiedGitDiff,
  renderGitDiffLineHtml,
  splitGitDiffHunks,
} from '../utils/git-diff-view';
import { findingKey } from '../utils/git-review-findings';
import GitCodeReviewFindingCard from './GitCodeReviewFindingCard.vue';

const props = withDefaults(
  defineProps<{
    content: string;
    path: string;
    viewMode: 'unified' | 'split';
    query?: string;
    findings?: GitPullRequestReviewFinding[];
    resolvedKeys?: string[];
    selectedKeys?: string[];
  }>(),
  {
    findings: () => [],
    resolvedKeys: () => [],
    selectedKeys: () => [],
  },
);

const emit = defineEmits<{
  'toggle-finding-selection': [finding: GitPullRequestReviewFinding];
  'resolve-finding': [finding: GitPullRequestReviewFinding];
  'ignore-finding': [finding: GitPullRequestReviewFinding];
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
let mediaQuery: MediaQueryList | null = null;

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

const findingsByLine = computed(() => {
  const map = new Map<number, GitPullRequestReviewFinding[]>();
  for (const finding of props.findings) {
    if (finding.line == null) continue;
    const forLine = map.get(finding.line) ?? [];
    forLine.push(finding);
    map.set(finding.line, forLine);
  }
  return map;
});

function findingsFor(
  line: number | null | undefined,
): GitPullRequestReviewFinding[] {
  if (line == null) return [];
  return findingsByLine.value.get(line) ?? [];
}

function isFindingResolved(finding: GitPullRequestReviewFinding): boolean {
  return props.resolvedKeys.includes(findingKey(finding));
}

function isFindingSelected(finding: GitPullRequestReviewFinding): boolean {
  return props.selectedKeys.includes(findingKey(finding));
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
  reviewWorkspace?.classList.add('is-diff-enhanced');

  mediaQuery = window.matchMedia('(max-width: 760px)');
  updateNarrowMode();
  mediaQuery.addEventListener('change', updateNarrowMode);
});

onBeforeUnmount(() => {
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
          <template
            v-for="(line, lineIndex) in hunk.lines"
            :key="`u-${hunkIndex}-${lineIndex}`"
          >
            <div
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
            <div
              v-for="finding in findingsFor(line.newLine)"
              :key="findingKey(finding)"
              class="git-diff-inline-comments"
            >
              <GitCodeReviewFindingCard
                :finding="finding"
                :resolved="isFindingResolved(finding)"
                :selected="isFindingSelected(finding)"
                @toggle-selection="emit('toggle-finding-selection', finding)"
                @resolve="emit('resolve-finding', finding)"
                @ignore="emit('ignore-finding', finding)"
              />
            </div>
          </template>
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

            <template v-else>
              <div class="git-diff-split-row" role="row">
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
              <div
                v-for="finding in findingsFor(row.right?.newLine)"
                :key="findingKey(finding)"
                class="git-diff-inline-comments"
              >
                <GitCodeReviewFindingCard
                  :finding="finding"
                  :resolved="isFindingResolved(finding)"
                  :selected="isFindingSelected(finding)"
                  @toggle-selection="emit('toggle-finding-selection', finding)"
                  @resolve="emit('resolve-finding', finding)"
                  @ignore="emit('ignore-finding', finding)"
                />
              </div>
            </template>
          </template>
        </template>
      </template>
    </div>
  </div>
</template>
