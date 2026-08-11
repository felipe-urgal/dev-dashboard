<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';

import type { GitPullRequestReviewFinding } from '@dev-dashboard/contracts';

import './git-code-review-inline-comments.css';
import './GitFileFullView.css';
import {
  parseUnifiedGitDiff,
  renderGitDiffLineHtml,
} from '../utils/git-diff-view';
import { findingKey } from '../utils/git-review-findings';
import GitCodeReviewFindingCard from './GitCodeReviewFindingCard.vue';

const props = withDefaults(
  defineProps<{
    content: string;
    diff: string;
    path: string;
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

interface FullFileLine {
  number: number;
  text: string;
  changed: boolean;
  html: string;
}

const rawLines = shallowRef<string[]>([]);
const highlightedLines = shallowRef<string[] | null>(null);

const changedLines = computed<ReadonlySet<number>>(() => {
  const set = new Set<number>();
  for (const line of parseUnifiedGitDiff(props.diff)) {
    if (line.kind === 'addition' && line.newLine != null) set.add(line.newLine);
  }
  return set;
});

function contentLines(content: string): string[] {
  const lines = content.split('\n');
  // Um arquivo bem formado termina com \n; isso não deve virar uma linha extra vazia.
  if (lines.length > 1 && lines.at(-1) === '') lines.pop();
  return lines;
}

async function prepare(content: string, path: string): Promise<void> {
  const lines = contentLines(content);
  rawLines.value = lines;
  highlightedLines.value = null;

  const syntax = await loadSyntaxModule();
  if (!syntax || props.content !== content) return;

  const language = syntax.detectLanguage(path, lines.slice(0, 80).join('\n'));
  if (!language) return;

  highlightedLines.value = lines.map((line) =>
    renderGitDiffLineHtml(line, {
      syntax: syntax.syntaxRangesFor(line, language),
    }),
  );
}

watch(
  () => [props.content, props.path] as const,
  ([content, path]) => {
    void prepare(content, path);
  },
  { immediate: true },
);

const lines = computed<FullFileLine[]>(() =>
  rawLines.value.map((text, index) => {
    const number = index + 1;
    return {
      number,
      text,
      changed: changedLines.value.has(number),
      html:
        highlightedLines.value?.[index] ??
        renderGitDiffLineHtml(text, {
          ...(props.query ? { query: props.query } : {}),
        }),
    };
  }),
);

function findingsFor(line: number): GitPullRequestReviewFinding[] {
  return props.findings.filter((finding) => finding.line === line);
}

function isFindingResolved(finding: GitPullRequestReviewFinding): boolean {
  return props.resolvedKeys.includes(findingKey(finding));
}

function isFindingSelected(finding: GitPullRequestReviewFinding): boolean {
  return props.selectedKeys.includes(findingKey(finding));
}
</script>

<template>
  <div class="git-full-file-view" role="table" :aria-label="`Arquivo ${path}`">
    <template v-for="line in lines" :key="line.number">
      <div
        class="git-full-file-row"
        :class="{ 'is-changed': line.changed }"
        role="row"
      >
        <span class="git-full-file-line-number" role="cell">{{
          line.number
        }}</span>
        <code role="cell" v-html="line.html"></code>
      </div>
      <div
        v-for="finding in findingsFor(line.number)"
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
  </div>
</template>
