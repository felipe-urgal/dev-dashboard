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

<style scoped src="./ProjectReadmePanel.css"></style>
