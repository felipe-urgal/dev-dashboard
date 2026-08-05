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

import type { Project, ProjectFileEntry } from '@dev-dashboard/contracts';

import {
  fetchProjectFileContent,
  fetchProjectMarkdownFiles,
} from '../api';

type TableAlignment = 'left' | 'center' | 'right' | null;

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

interface TableBlock {
  id: string;
  type: 'table';
  headers: string[];
  alignments: TableAlignment[];
  rows: string[][];
}

type MarkdownBlock =
  | HeadingBlock
  | ParagraphBlock
  | CodeBlock
  | ListBlock
  | QuoteBlock
  | DividerBlock
  | TableBlock;

const props = defineProps<{
  project: Project;
}>();

const loading = ref(false);
const errorMessage = ref('');
const files = ref<ProjectFileEntry[]>([]);
const filesTruncated = ref(false);
const selectedPath = ref('');
const content = ref('');
const copiedBlockId = ref('');

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeLinkTarget(value: string): string | null {
  const target = value.trim().replace(/^<|>$/g, '');
  if (!target || /[\u0000-\u001f\u007f]/.test(target)) return null;

  const scheme = target.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme && !['http', 'https', 'mailto'].includes(scheme)) return null;

  return target;
}

function resolveProjectPath(target: string): string | null {
  const rawPath = target.split(/[?#]/, 1)[0] ?? '';
  if (!rawPath) return null;

  let decodedPath = rawPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    // Mantém o caminho original quando a codificação do link for inválida.
  }

  const normalizedPath = decodedPath.replace(/\\/g, '/');
  const segments = normalizedPath.startsWith('/')
    ? []
    : selectedPath.value.split('/').slice(0, -1);

  for (const segment of normalizedPath.replace(/^\/+/, '').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (!segments.length) return null;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }

  return segments.join('/') || null;
}

function linkHref(target: string): string {
  if (/^(?:https?:\/\/|mailto:)/i.test(target) || target.startsWith('#')) {
    return target;
  }

  const projectPath = resolveProjectPath(target);
  if (!projectPath) return '#';

  return `/projects/${encodeURIComponent(props.project.id)}/editor?file=${encodeURIComponent(projectPath)}`;
}

function renderInlineMarkdown(value: string): string {
  const pattern = /!\[([^\]]*)\]\(\s*(?:<[^>]+>|[^)]+)\s*\)|\[([^\]]+)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\s*\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/g;
  let result = '';
  let cursor = 0;

  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    result += escapeHtml(value.slice(cursor, index));

    if (match[1] !== undefined) {
      result += escapeHtml(match[1]);
    } else if (match[2] !== undefined) {
      const label = escapeHtml(match[2]);
      const target = safeLinkTarget(match[3] ?? '');
      if (!target) {
        result += label;
      } else {
        const external = /^(?:https?:\/\/|mailto:)/i.test(target);
        const attributes = external
          ? ' target="_blank" rel="noreferrer noopener"'
          : '';
        result += `<a class="readme-inline-link" href="${escapeHtml(linkHref(target))}"${attributes}>${label}</a>`;
      }
    } else if (match[4] !== undefined) {
      result += `<code class="readme-inline-code">${escapeHtml(match[4])}</code>`;
    } else if (match[5] !== undefined || match[6] !== undefined) {
      result += `<strong>${escapeHtml(match[5] ?? match[6] ?? '')}</strong>`;
    } else {
      result += `<em>${escapeHtml(match[7] ?? match[8] ?? '')}</em>`;
    }

    cursor = index + match[0].length;
  }

  result += escapeHtml(value.slice(cursor));
  return result;
}

function splitTableRow(value: string): string[] {
  let row = value.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);

  const cells: string[] = [];
  let cell = '';
  let escaped = false;
  let insideCode = false;

  for (const character of row) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '`') {
      insideCode = !insideCode;
      cell += character;
    } else if (character === '|' && !insideCode) {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += character;
    }
  }

  if (escaped) cell += '\\';
  cells.push(cell.trim());
  return cells;
}

function parseTableDelimiter(value: string): TableAlignment[] | null {
  if (!value.includes('|')) return null;
  const cells = splitTableRow(value);
  if (!cells.length || cells.some((cell) => !/^:?-{3,}:?$/.test(cell))) {
    return null;
  }

  return cells.map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}

function normalizeTableRow(cells: string[], width: number): string[] {
  return Array.from({ length: width }, (_, index) => cells[index] ?? '');
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
    const text = paragraph.join(' ').trim();
    paragraph = [];
    if (text) blocks.push({ id: nextId('paragraph'), type: 'paragraph', text });
  };

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push({
      id: nextId('list'),
      type: 'list',
      ordered: listOrdered,
      items: listItems,
    });
    listItems = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
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

    const alignments = parseTableDelimiter(lines[index + 1] ?? '');
    if (line.includes('|') && alignments) {
      flushParagraph();
      flushList();
      const headerCells = splitTableRow(line);
      const width = Math.max(headerCells.length, alignments.length);
      const rows: string[][] = [];
      let rowIndex = index + 2;

      while (rowIndex < lines.length) {
        const rowLine = lines[rowIndex] ?? '';
        if (!rowLine.trim() || !rowLine.includes('|')) break;
        rows.push(normalizeTableRow(splitTableRow(rowLine), width));
        rowIndex += 1;
      }

      blocks.push({
        id: nextId('table'),
        type: 'table',
        headers: normalizeTableRow(headerCells, width),
        alignments: Array.from(
          { length: width },
          (_, column) => alignments[column] ?? null,
        ),
        rows,
      });
      index = rowIndex - 1;
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
        text: heading[2] ?? '',
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
      if (listItems.length && listOrdered !== ordered) flushList();
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
        text: quote[1] ?? '',
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

const blocks = computed(() => (content.value ? parseMarkdown(content.value) : []));

const selectedFile = computed(
  () => files.value.find((file) => file.path === selectedPath.value) ?? null,
);

function tableAlignmentClass(alignment: TableAlignment | undefined): string | undefined {
  return alignment ? `readme-table-align-${alignment}` : undefined;
}

async function selectFile(path: string): Promise<void> {
  const projectId = props.project.id;
  selectedPath.value = path;
  loading.value = true;
  errorMessage.value = '';

  try {
    const file = await fetchProjectFileContent(projectId, path);
    if (props.project.id === projectId && selectedPath.value === path) {
      content.value = file.content;
    }
  } catch (error) {
    if (props.project.id === projectId && selectedPath.value === path) {
      content.value = '';
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o arquivo selecionado.';
    }
  } finally {
    if (props.project.id === projectId && selectedPath.value === path) {
      loading.value = false;
    }
  }
}

async function loadFiles(): Promise<void> {
  const projectId = props.project.id;
  loading.value = true;
  errorMessage.value = '';
  files.value = [];
  filesTruncated.value = false;
  selectedPath.value = '';
  content.value = '';

  try {
    const result = await fetchProjectMarkdownFiles(projectId);
    if (props.project.id !== projectId) return;

    files.value = result.files;
    filesTruncated.value = result.truncated;

    const first = result.files[0];
    if (first) {
      await selectFile(first.path);
    } else {
      loading.value = false;
    }
  } catch (error) {
    if (props.project.id === projectId) {
      errorMessage.value =
        error instanceof Error
          ? error.message
          : 'Não foi possível listar a documentação do projeto.';
      loading.value = false;
    }
  }
}

async function copyCode(block: CodeBlock): Promise<void> {
  try {
    await navigator.clipboard.writeText(block.content);
    copiedBlockId.value = block.id;
    window.setTimeout(() => {
      if (copiedBlockId.value === block.id) copiedBlockId.value = '';
    }, 1_500);
  } catch {
    copiedBlockId.value = '';
  }
}

watch(
  () => props.project.id,
  () => {
    void loadFiles();
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
            {{ selectedFile?.name ?? 'Documentação' }}
          </strong>
          <span>
            {{ files.length > 1
              ? `${files.length} arquivos Markdown encontrados`
              : 'Documentação principal do projeto' }}
          </span>
        </div>
      </div>

      <button
        type="button"
        class="readme-refresh-button"
        :disabled="loading"
        @click="loadFiles"
      >
        <ArrowPathIcon aria-hidden="true" />
        {{ loading ? 'Atualizando...' : 'Atualizar' }}
      </button>
    </header>

    <nav
      v-if="files.length > 1"
      class="readme-file-list"
      aria-label="Arquivos Markdown do projeto"
    >
      <button
        v-for="file in files"
        :key="file.path"
        type="button"
        class="readme-file-item"
        :class="{ 'readme-file-item-active': file.path === selectedPath }"
        :aria-current="file.path === selectedPath ? 'true' : undefined"
        :disabled="loading && file.path === selectedPath"
        @click="selectFile(file.path)"
      >
        {{ file.path }}
      </button>
    </nav>

    <p v-if="filesTruncated" class="readme-truncated-warning" role="status">
      A lista foi limitada aos primeiros arquivos Markdown encontrados.
    </p>

    <div v-if="loading && !content" class="readme-state" aria-live="polite">
      <span class="readme-loading-icon">•••</span>
      <strong>Carregando documentação</strong>
      <p>Lendo os arquivos Markdown do projeto.</p>
    </div>

    <div v-else-if="errorMessage" class="readme-state readme-state-error">
      <span class="readme-loading-icon">!</span>
      <strong>Não foi possível abrir a documentação</strong>
      <p>{{ errorMessage }}</p>
      <button type="button" class="secondary-button" @click="loadFiles">
        Tentar novamente
      </button>
    </div>

    <div v-else-if="!selectedFile" class="readme-state">
      <DocumentTextIcon class="readme-empty-icon" aria-hidden="true" />
      <strong>Nenhum arquivo Markdown encontrado</strong>
      <p>
        Adicione um arquivo <code>.md</code> ao projeto (por exemplo, um
        README.md na raiz) para exibir a documentação nesta página.
      </p>
    </div>

    <article v-else class="readme-document">
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
            <button type="button" @click="copyCode(block)">
              <CheckIcon v-if="copiedBlockId === block.id" aria-hidden="true" />
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
  border-radius: var(--radius-md);
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
