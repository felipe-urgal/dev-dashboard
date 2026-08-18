export type TableAlignment = 'left' | 'center' | 'right' | null;

export interface HeadingBlock {
  id: string;
  type: 'heading';
  level: number;
  text: string;
}

export interface ParagraphBlock {
  id: string;
  type: 'paragraph';
  text: string;
}

export interface CodeBlock {
  id: string;
  type: 'code';
  language: string;
  content: string;
}

export interface ListBlock {
  id: string;
  type: 'list';
  ordered: boolean;
  items: string[];
}

export interface QuoteBlock {
  id: string;
  type: 'quote';
  text: string;
}

export interface DividerBlock {
  id: string;
  type: 'divider';
}

export interface TableBlock {
  id: string;
  type: 'table';
  headers: string[];
  alignments: TableAlignment[];
  rows: string[][];
}

export type MarkdownBlock =
  | HeadingBlock
  | ParagraphBlock
  | CodeBlock
  | ListBlock
  | QuoteBlock
  | DividerBlock
  | TableBlock;

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

export function parseMarkdown(source: string): MarkdownBlock[] {
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

export function escapeHtml(value: string): string {
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

export function renderInlineMarkdown(value: string): string {
  const pattern =
    /!\[([^\]]*)\]\(\s*(?:<[^>]+>|[^)]+)\s*\)|\[([^\]]+)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\s*\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/g;
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
        result += external
          ? `<a class="readme-inline-link" href="${escapeHtml(target)}" target="_blank" rel="noreferrer noopener">${label}</a>`
          : label;
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
