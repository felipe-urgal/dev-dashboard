<script setup lang="ts">
import {
  computed,
  ref,
  watch,
} from 'vue';

import {
  ArrowPathIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
} from '@heroicons/vue/24/outline';

import type { Project } from '@dev-dashboard/contracts';

import {
  fetchProjectReadme,
  type ProjectReadme,
} from '../project-readme-api';

interface HeadingBlock {
  id: string;
  type: 'heading';
  level: number;
  text: string;
}

interface ParagraphBlock {
  id: string;
  type: 'paragraph';
  text: string;
}

interface CodeBlock {
  id: string;
  type: 'code';
  language: string;
  content: string;
}

interface ListBlock {
  id: string;
  type: 'list';
  ordered: boolean;
  items: string[];
}

interface QuoteBlock {
  id: string;
  type: 'quote';
  text: string;
}

interface DividerBlock {
  id: string;
  type: 'divider';
}

type MarkdownBlock =
  | HeadingBlock
  | ParagraphBlock
  | CodeBlock
  | ListBlock
  | QuoteBlock
  | DividerBlock;

const props = defineProps<{
  project: Project;
}>();

const loading = ref(false);
const errorMessage = ref('');
const readme = ref<ProjectReadme | null>(null);
const copiedBlockId = ref('');

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$)/g, '$1$2')
    .trim();
}

function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;
  let codeLines: string[] = [];
  let codeLanguage = '';
  let insideCode = false;
  let sequence = 0;

  const nextId = (prefix: string) => `${prefix}-${sequence++}`;

  const flushParagraph = () => {
    const text = cleanInlineMarkdown(paragraph.join(' '));
    paragraph = [];

    if (text) {
      blocks.push({
        id: nextId('paragraph'),
        type: 'paragraph',
        text,
      });
    }
  };

  const flushList = () => {
    if (!listItems.length) return;

    blocks.push({
      id: nextId('list'),
      type: 'list',
      ordered: listOrdered,
      items: listItems.map(cleanInlineMarkdown),
    });
    listItems = [];
  };

  for (const line of lines) {
    const fence = line.match(/^\s*```\s*([^\s`]*)\s*$/);

    if (fence) {
      if (insideCode) {
        blocks.push({
          id: nextId('code'),
          type: 'code',
          language: codeLanguage,
          content: codeLines.join('\n'),
        });
        codeLines = [];
        codeLanguage = '';
        insideCode = false;
      } else {
        flushParagraph();
        flushList();
        codeLanguage = fence[1] ?? '';
        insideCode = true;
      }
      continue;
    }

    if (insideCode) {
      codeLines.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        id: nextId('heading'),
        type: 'heading',
        level: heading[1]?.length ?? 1,
        text: cleanInlineMarkdown(heading[2] ?? ''),
      });
      continue;
    }

    if (/^\s*(?:---+|___+|\*\*\*+)\s*$/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push({ id: nextId('divider'), type: 'divider' });
      continue;
    }

    const unorderedItem = line.match(/^\s*[-*+]\s+(.+)$/);
    const orderedItem = line.match(/^\s*\d+[.)]\s+(.+)$/);
    const listMatch = unorderedItem ?? orderedItem;

    if (listMatch) {
      flushParagraph();
      const ordered = Boolean(orderedItem);

      if (listItems.length && listOrdered !== ordered) {
        flushList();
      }

      listOrdered = ordered;
      listItems.push(listMatch[1] ?? '');
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push({
        id: nextId('quote'),
        type: 'quote',
        text: cleanInlineMarkdown(quote[1] ?? ''),
      });
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    paragraph.push(line.trim());
  }

  if (insideCode) {
    blocks.push({
      id: nextId('code'),
      type: 'code',
      language: codeLanguage,
      content: codeLines.join('\n'),
    });
  }

  flushParagraph();
  flushList();

  return blocks;
}

const blocks = computed(() =>
  readme.value ? parseMarkdown(readme.value.content) : [],
);

async function loadReadme(): Promise<void> {
  const projectId = props.project.id;
  loading.value = true;
  errorMessage.value = '';
  readme.value = null;

  try {
    const result = await fetchProjectReadme(projectId);

    if (props.project.id === projectId) {
      readme.value = result;
    }
  } catch (error) {
    if (props.project.id === projectId) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o README do projeto.';
    }
  } finally {
    if (props.project.id === projectId) {
      loading.value = false;
    }
  }
}

async function copyCode(block: CodeBlock): Promise<void> {
  try {
    await navigator.clipboard.writeText(block.content);
    copiedBlockId.value = block.id;
    window.setTimeout(() => {
      if (copiedBlockId.value === block.id) {
        copiedBlockId.value = '';
      }
    }, 1_500);
  } catch {
    copiedBlockId.value = '';
  }
}

watch(
  () => props.project.id,
  () => {
    void loadReadme();
  },
  { immediate: true },
);
</script>

<template>
  <section class="readme-panel" aria-labelledby="project-readme-title">
    <header class="readme-panel-header">
      <div class="readme-panel-title">
        <DocumentTextIcon aria-hidden="true" />
        <div>
          <strong id="project-readme-title">
            {{ readme?.filename ?? 'README.md' }}
          </strong>
          <span>Documentação principal do projeto</span>
        </div>
      </div>

      <button
        type="button"
        class="readme-refresh-button"
        :disabled="loading"
        @click="loadReadme"
      >
        <ArrowPathIcon aria-hidden="true" />
        {{ loading ? 'Atualizando...' : 'Atualizar' }}
      </button>
    </header>

    <div v-if="loading" class="readme-state" aria-live="polite">
      <span class="readme-loading-icon">•••</span>
      <strong>Carregando README</strong>
      <p>Lendo a documentação na raiz do projeto.</p>
    </div>

    <div v-else-if="errorMessage" class="readme-state readme-state-error">
      <span class="readme-loading-icon">!</span>
      <strong>Não foi possível abrir o README</strong>
      <p>{{ errorMessage }}</p>
      <button type="button" class="secondary-button" @click="loadReadme">
        Tentar novamente
      </button>
    </div>

    <div v-else-if="!readme" class="readme-state">
      <DocumentTextIcon class="readme-empty-icon" aria-hidden="true" />
      <strong>README não encontrado</strong>
      <p>
        Adicione um arquivo README.md na raiz do projeto para exibir a
        documentação nesta página.
      </p>
    </div>

    <article v-else class="readme-document">
      <template v-for="block in blocks" :key="block.id">
        <component
          :is="`h${Math.min(block.level, 4)}`"
          v-if="block.type === 'heading'"
          class="readme-heading"
        >
          {{ block.text }}
        </component>

        <p v-else-if="block.type === 'paragraph'">
          {{ block.text }}
        </p>

        <ol v-else-if="block.type === 'list' && block.ordered">
          <li v-for="item in block.items" :key="item">{{ item }}</li>
        </ol>

        <ul v-else-if="block.type === 'list'">
          <li v-for="item in block.items" :key="item">{{ item }}</li>
        </ul>

        <blockquote v-else-if="block.type === 'quote'">
          {{ block.text }}
        </blockquote>

        <hr v-else-if="block.type === 'divider'" />

        <div v-else-if="block.type === 'code'" class="readme-code-block">
          <div class="readme-code-toolbar">
            <span>{{ block.language || 'texto' }}</span>
            <button type="button" @click="copyCode(block)">
              <CheckIcon
                v-if="copiedBlockId === block.id"
                aria-hidden="true"
              />
              <ClipboardDocumentIcon v-else aria-hidden="true" />
              {{ copiedBlockId === block.id ? 'Copiado' : 'Copiar' }}
            </button>
          </div>
          <pre><code>{{ block.content }}</code></pre>
        </div>
      </template>
    </article>
  </section>
</template>

<style scoped>
.readme-panel {
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-1);
  box-shadow: 0 18px 45px rgb(0 0 0 / 4%);
}

.readme-panel-header {
  display: flex;
  min-height: 66px;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border);
}

.readme-panel-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.readme-panel-title > svg {
  width: 21px;
  height: 21px;
  flex: 0 0 auto;
  color: var(--accent);
}

.readme-panel-title > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.readme-panel-title strong {
  overflow: hidden;
  color: var(--text);
  font-size: var(--font-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.readme-panel-title span {
  color: var(--text-dim);
  font-size: var(--font-xs);
}

.readme-refresh-button {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 7px;
  padding: 7px 11px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  background: var(--surface-2);
  font-size: var(--font-xs);
  font-weight: var(--font-weight-strong);
}

.readme-refresh-button:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text);
}

.readme-refresh-button svg {
  width: 15px;
  height: 15px;
}

.readme-state {
  display: grid;
  min-height: 420px;
  place-items: center;
  align-content: center;
  gap: 8px;
  padding: 48px;
  color: var(--text-muted);
  text-align: center;
}

.readme-state strong {
  color: var(--text);
}

.readme-state p {
  max-width: 520px;
  margin: 0;
  font-size: var(--font-sm);
  line-height: 1.7;
}

.readme-state-error {
  color: var(--danger-text);
}

.readme-empty-icon {
  width: 34px;
  height: 34px;
  color: var(--text-dim);
}

.readme-loading-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2);
  letter-spacing: 2px;
}

.readme-document {
  max-width: 920px;
  min-height: 520px;
  padding: clamp(28px, 4vw, 52px);
  color: var(--text-muted);
  font-size: var(--font-sm);
  line-height: 1.75;
}

.readme-document .readme-heading {
  margin: 1.55em 0 0.55em;
  color: var(--text);
  line-height: 1.25;
  letter-spacing: -0.02em;
}

.readme-document .readme-heading:first-child {
  margin-top: 0;
}

.readme-document h1 {
  font-size: clamp(28px, 3vw, 38px);
}

.readme-document h2 {
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
  font-size: 22px;
}

.readme-document h3 {
  font-size: 18px;
}

.readme-document h4 {
  font-size: 15px;
}

.readme-document p {
  margin: 0 0 1em;
}

.readme-document ul,
.readme-document ol {
  display: grid;
  gap: 6px;
  margin: 0 0 1.25em;
  padding-left: 24px;
}

.readme-document blockquote {
  margin: 1.25em 0;
  padding: 10px 16px;
  border-left: 3px solid var(--accent);
  color: var(--text-muted);
  background: var(--surface-2);
}

.readme-document hr {
  margin: 30px 0;
  border: 0;
  border-top: 1px solid var(--border);
}

.readme-code-block {
  overflow: hidden;
  margin: 18px 0 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-2);
}

.readme-code-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.readme-code-toolbar button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 7px;
  border: 0;
  border-radius: 5px;
  color: var(--text-muted);
  background: transparent;
  font-size: 10px;
  font-weight: var(--font-weight-strong);
  text-transform: none;
  letter-spacing: normal;
}

.readme-code-toolbar button:hover {
  color: var(--text);
  background: var(--surface-3);
}

.readme-code-toolbar svg {
  width: 13px;
  height: 13px;
}

.readme-code-block pre {
  overflow: auto;
  margin: 0;
  padding: 16px;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.65;
}

@media (max-width: 720px) {
  .readme-panel-header {
    align-items: flex-start;
  }

  .readme-panel-title span {
    display: none;
  }

  .readme-document {
    padding: 24px 20px;
  }
}
</style>
