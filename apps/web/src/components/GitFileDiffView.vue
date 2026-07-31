<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';

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

const lines = shallowRef<GitUnifiedDiffLine[]>([]);

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

  lines.value = parsed.map((line) => (
    line.kind === 'addition' || line.kind === 'deletion' || line.kind === 'context'
      ? { ...line, syntax: syntax.syntaxRangesFor(line.text, language) }
      : line
  ));
}

watch(
  () => [props.content, props.path] as const,
  ([content, path]) => { void prepare(content, path); },
  { immediate: true },
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
</script>

<template>
  <div
    :class="viewMode === 'split' ? 'git-diff-split' : 'git-diff-unified'"
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

    <template v-for="(hunk, hunkIndex) in groups.hunks" :key="`hunk-${hunkIndex}`">
      <div class="git-diff-hunk-head" role="row">
        <code role="cell">{{ hunk.header.text }}</code>
      </div>

      <template v-if="viewMode === 'unified'">
        <div
          v-for="(line, lineIndex) in hunk.lines"
          :key="`u-${hunkIndex}-${lineIndex}`"
          class="git-diff-unified-row"
          :class="`is-${line.kind}`"
          role="row"
        >
          <span class="git-diff-line-number" role="cell">{{ line.oldLine ?? '' }}</span>
          <span class="git-diff-line-number" role="cell">{{ line.newLine ?? '' }}</span>
          <span class="git-diff-line-prefix" role="cell">{{ linePrefix(line.kind) }}</span>
          <code role="cell" v-html="highlighted(line)"></code>
        </div>
      </template>

      <template v-else>
        <template
          v-for="(row, rowIndex) in splitRows(hunk.lines)"
          :key="`s-${hunkIndex}-${rowIndex}`"
        >
          <div v-if="row.kind === 'meta'" class="git-diff-split-meta" role="row">
            <code role="cell" v-html="highlighted(row.left ?? row.right!)"></code>
          </div>

          <div v-else class="git-diff-split-row" role="row">
            <div
              class="git-diff-side-cell"
              :class="row.left ? `is-${row.left.kind}` : 'is-empty'"
            >
              <span class="git-diff-line-number" role="cell">{{ row.left?.oldLine ?? '' }}</span>
              <span class="git-diff-line-prefix" role="cell">{{ row.left ? linePrefix(row.left.kind) : '' }}</span>
              <code v-if="row.left" role="cell" v-html="highlighted(row.left)"></code>
              <code v-else role="cell"></code>
            </div>
            <div
              class="git-diff-side-cell"
              :class="row.right ? `is-${row.right.kind}` : 'is-empty'"
            >
              <span class="git-diff-line-number" role="cell">{{ row.right?.newLine ?? '' }}</span>
              <span class="git-diff-line-prefix" role="cell">{{ row.right ? linePrefix(row.right.kind) : '' }}</span>
              <code v-if="row.right" role="cell" v-html="highlighted(row.right)"></code>
              <code v-else role="cell"></code>
            </div>
          </div>
        </template>
      </template>
    </template>
  </div>
</template>
