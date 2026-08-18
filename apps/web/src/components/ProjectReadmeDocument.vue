<script setup lang="ts">
import { CheckIcon, ClipboardDocumentIcon } from '@heroicons/vue/24/outline';

import type {
  CodeBlock,
  MarkdownBlock,
  TableAlignment,
} from '../utils/project-readme-markdown';
import { renderInlineMarkdown } from '../utils/project-readme-markdown';

defineProps<{
  blocks: readonly MarkdownBlock[];
  copiedBlockId: string;
}>();

const emit = defineEmits<{
  'copy-code': [block: CodeBlock];
}>();

function tableAlignmentClass(
  alignment: TableAlignment | undefined,
): string | undefined {
  return alignment ? `readme-table-align-${alignment}` : undefined;
}
</script>

<template>
  <article class="readme-document">
    <template v-for="block in blocks" :key="block.id">
      <component
        :is="`h${Math.min(block.level, 4)}`"
        v-if="block.type === 'heading'"
        class="readme-heading"
      >
        <span v-html="renderInlineMarkdown(block.text)"></span>
      </component>

      <p
        v-else-if="block.type === 'paragraph'"
        v-html="renderInlineMarkdown(block.text)"
      />

      <ol v-else-if="block.type === 'list' && block.ordered">
        <li
          v-for="(item, itemIndex) in block.items"
          :key="itemIndex"
          v-html="renderInlineMarkdown(item)"
        />
      </ol>

      <ul v-else-if="block.type === 'list'">
        <li
          v-for="(item, itemIndex) in block.items"
          :key="itemIndex"
          v-html="renderInlineMarkdown(item)"
        />
      </ul>

      <blockquote
        v-else-if="block.type === 'quote'"
        v-html="renderInlineMarkdown(block.text)"
      />

      <hr v-else-if="block.type === 'divider'" />

      <div v-else-if="block.type === 'table'" class="readme-table-scroll">
        <table class="readme-table">
          <thead>
            <tr>
              <th
                v-for="(header, columnIndex) in block.headers"
                :key="columnIndex"
                :class="tableAlignmentClass(block.alignments[columnIndex])"
                scope="col"
                v-html="renderInlineMarkdown(header)"
              />
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIndex) in block.rows" :key="rowIndex">
              <td
                v-for="(cell, columnIndex) in row"
                :key="columnIndex"
                :class="tableAlignmentClass(block.alignments[columnIndex])"
                v-html="renderInlineMarkdown(cell)"
              />
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="block.type === 'code'" class="readme-code-block">
        <div class="readme-code-toolbar">
          <span>{{ block.language || 'texto' }}</span>
          <button type="button" @click="emit('copy-code', block)">
            <CheckIcon v-if="copiedBlockId === block.id" aria-hidden="true" />
            <ClipboardDocumentIcon v-else aria-hidden="true" />
            {{ copiedBlockId === block.id ? 'Copiado' : 'Copiar' }}
          </button>
        </div>
        <pre><code>{{ block.content }}</code></pre>
      </div>
    </template>
  </article>
</template>

<style scoped src="./ProjectReadmePanel.css"></style>

<style scoped>
.readme-document :deep(.readme-inline-link) {
  color: var(--accent);
  font-weight: var(--font-weight-strong);
  text-decoration: none;
}

.readme-document :deep(.readme-inline-link:hover) {
  text-decoration: underline;
}

.readme-document :deep(.readme-inline-code) {
  padding: 2px 5px;
  border-radius: 5px;
  color: var(--text);
  background: var(--surface-3);
  font-family: var(--font-mono);
  font-size: 0.9em;
}

.readme-table-scroll {
  overflow-x: auto;
  margin: 18px 0 24px;
  border: 1px solid var(--border);
}

.readme-table {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
  color: var(--text-muted);
  font-size: var(--font-sm);
  line-height: 1.5;
}

.readme-table th,
.readme-table td {
  padding: 9px 12px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}

.readme-table th:last-child,
.readme-table td:last-child {
  border-right: 0;
}

.readme-table tbody tr:last-child td {
  border-bottom: 0;
}

.readme-table th {
  color: var(--text);
  background: var(--surface-2);
  font-weight: var(--font-weight-strong);
}

.readme-table tbody tr:nth-child(even) {
  background: color-mix(in srgb, var(--surface-2) 52%, transparent);
}

.readme-table-align-center {
  text-align: center !important;
}

.readme-table-align-right {
  text-align: right !important;
}

.readme-table-align-left {
  text-align: left !important;
}
</style>
