import { isRedundantGitDiffHeaderLine } from './git-diff-metadata';

export type GitDiffLineKind =
  | 'addition'
  | 'deletion'
  | 'context'
  | 'hunk'
  | 'meta'
  | 'notice';

export interface GitDiffWordRange {
  start: number;
  end: number;
}

export interface GitUnifiedDiffLine {
  kind: GitDiffLineKind;
  text: string;
  oldLine: number | null;
  newLine: number | null;
  /** Trechos alterados dentro da linha, quando ela forma par com a linha oposta. */
  words?: readonly GitDiffWordRange[];
}

export interface GitSplitDiffRow {
  kind: 'change' | 'context' | 'meta';
  left: GitUnifiedDiffLine | null;
  right: GitUnifiedDiffLine | null;
}

const HUNK_PATTERN = /^(@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@)(?:\s+(.*))?$/;

function metaLine(text: string, kind: GitDiffLineKind = 'meta'): GitUnifiedDiffLine {
  return {
    kind,
    text,
    oldLine: null,
    newLine: null,
  };
}

export function parseUnifiedGitDiff(content: string): GitUnifiedDiffLine[] {
  let oldLine: number | null = null;
  let newLine: number | null = null;
  let previousHunkContext = '';
  const lines: GitUnifiedDiffLine[] = [];

  for (const rawLine of content.split('\n')) {
    const hunk = HUNK_PATTERN.exec(rawLine);
    if (hunk) {
      oldLine = Number.parseInt(hunk[2] ?? '0', 10);
      newLine = Number.parseInt(hunk[4] ?? '0', 10);
      const coordinates = hunk[1] ?? rawLine;
      const context = hunk[6]?.trim() ?? '';
      const repeatedContext = Boolean(context) && context === previousHunkContext;
      lines.push(metaLine(repeatedContext ? coordinates : rawLine, 'hunk'));
      if (context) previousHunkContext = context;
      continue;
    }

    if (
      rawLine.startsWith('diff --git ')
      || rawLine.startsWith('index ')
      || rawLine.startsWith('--- ')
      || rawLine.startsWith('+++ ')
    ) {
      // O caminho do arquivo já aparece no cabeçalho da própria visualização
      // (lista de arquivos, seletor de arquivo); repetir "diff --git",
      // "index" e "---"/"+++" aqui só adiciona ruído.
      if (!isRedundantGitDiffHeaderLine(rawLine)) {
        lines.push(metaLine(rawLine));
      }
      continue;
    }

    if (
      rawLine.startsWith('new file mode ')
      || rawLine.startsWith('deleted file mode ')
      || rawLine.startsWith('similarity index ')
      || rawLine.startsWith('rename from ')
      || rawLine.startsWith('rename to ')
    ) {
      lines.push(metaLine(rawLine));
      continue;
    }

    if (rawLine.startsWith('\\ No newline at end of file')) {
      lines.push(metaLine(rawLine, 'notice'));
      continue;
    }

    if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      lines.push({
        kind: 'addition',
        text: rawLine.slice(1),
        oldLine: null,
        newLine,
      });
      if (newLine !== null) newLine += 1;
      continue;
    }

    if (rawLine.startsWith('-') && !rawLine.startsWith('---')) {
      lines.push({
        kind: 'deletion',
        text: rawLine.slice(1),
        oldLine,
        newLine: null,
      });
      if (oldLine !== null) oldLine += 1;
      continue;
    }

    if (rawLine.startsWith(' ')) {
      lines.push({
        kind: 'context',
        text: rawLine.slice(1),
        oldLine,
        newLine,
      });
      if (oldLine !== null) oldLine += 1;
      if (newLine !== null) newLine += 1;
      continue;
    }

    lines.push(metaLine(rawLine));
  }

  return lines;
}

export function buildSplitGitDiffRows(
  lines: readonly GitUnifiedDiffLine[],
): GitSplitDiffRow[] {
  const rows: GitSplitDiffRow[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line) break;

    if (line.kind === 'context') {
      rows.push({ kind: 'context', left: line, right: line });
      index += 1;
      continue;
    }

    if (line.kind !== 'addition' && line.kind !== 'deletion') {
      rows.push({ kind: 'meta', left: line, right: line });
      index += 1;
      continue;
    }

    const deletions: GitUnifiedDiffLine[] = [];
    const additions: GitUnifiedDiffLine[] = [];

    while (index < lines.length) {
      const candidate = lines[index];
      if (!candidate || (candidate.kind !== 'addition' && candidate.kind !== 'deletion')) {
        break;
      }
      if (candidate.kind === 'deletion') deletions.push(candidate);
      else additions.push(candidate);
      index += 1;
    }

    const changeCount = Math.max(deletions.length, additions.length);
    for (let changeIndex = 0; changeIndex < changeCount; changeIndex += 1) {
      rows.push({
        kind: 'change',
        left: deletions[changeIndex] ?? null,
        right: additions[changeIndex] ?? null,
      });
    }
  }

  return rows;
}

const WORD_PATTERN = /\s+|[\p{L}\p{N}_$]+|[^\s\p{L}\p{N}_$]/gu;
/** Acima disso a tabela de LCS deixa de valer o custo para uma linha só. */
const WORD_DIFF_MAX_CELLS = 40_000;
/** Abaixo disso as linhas são diferentes demais: marcar tudo vira ruído. */
const WORD_DIFF_MIN_SIMILARITY = 0.45;

function tokenizeLine(text: string): string[] {
  return text.match(WORD_PATTERN) ?? [];
}

function appendRange(ranges: GitDiffWordRange[], start: number, end: number): void {
  const last = ranges.at(-1);
  if (last && last.end === start) last.end = end;
  else ranges.push({ start, end });
}

/**
 * Compara duas linhas por token e devolve os trechos que mudaram de cada lado,
 * para que só a diferença real receba destaque forte.
 *
 * Devolve `null` quando as linhas são parecidas demais (idênticas), diferentes
 * demais, ou grandes demais para valer a comparação.
 */
export function computeGitDiffWordRanges(
  oldText: string,
  newText: string,
): { left: GitDiffWordRange[]; right: GitDiffWordRange[] } | null {
  if (oldText === newText) return null;

  const left = tokenizeLine(oldText);
  const right = tokenizeLine(newText);
  if (left.length === 0 || right.length === 0) return null;
  if (left.length * right.length > WORD_DIFF_MAX_CELLS) return null;

  const table: number[][] = Array.from(
    { length: left.length + 1 },
    () => new Array<number>(right.length + 1).fill(0),
  );
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      table[leftIndex]![rightIndex] = left[leftIndex] === right[rightIndex]
        ? table[leftIndex + 1]![rightIndex + 1]! + 1
        : Math.max(table[leftIndex + 1]![rightIndex]!, table[leftIndex]![rightIndex + 1]!);
    }
  }

  const common = table[0]![0]!;
  if (common / Math.max(left.length, right.length) < WORD_DIFF_MIN_SIMILARITY) return null;

  const leftRanges: GitDiffWordRange[] = [];
  const rightRanges: GitDiffWordRange[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  let leftOffset = 0;
  let rightOffset = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    const leftToken = left[leftIndex]!;
    const rightToken = right[rightIndex]!;
    if (leftToken === rightToken) {
      leftOffset += leftToken.length;
      rightOffset += rightToken.length;
      leftIndex += 1;
      rightIndex += 1;
    } else if (table[leftIndex + 1]![rightIndex]! >= table[leftIndex]![rightIndex + 1]!) {
      appendRange(leftRanges, leftOffset, leftOffset + leftToken.length);
      leftOffset += leftToken.length;
      leftIndex += 1;
    } else {
      appendRange(rightRanges, rightOffset, rightOffset + rightToken.length);
      rightOffset += rightToken.length;
      rightIndex += 1;
    }
  }
  while (leftIndex < left.length) {
    const token = left[leftIndex]!;
    appendRange(leftRanges, leftOffset, leftOffset + token.length);
    leftOffset += token.length;
    leftIndex += 1;
  }
  while (rightIndex < right.length) {
    const token = right[rightIndex]!;
    appendRange(rightRanges, rightOffset, rightOffset + token.length);
    rightOffset += token.length;
    rightIndex += 1;
  }

  return { left: leftRanges, right: rightRanges };
}

/**
 * Percorre o diff e, em cada bloco de remoções seguido de adições, casa as
 * linhas por posição e anota os trechos alterados nas duas pontas.
 */
export function annotateGitDiffWordChanges(
  lines: readonly GitUnifiedDiffLine[],
): GitUnifiedDiffLine[] {
  const result = lines.map((line) => ({ ...line }));
  let index = 0;

  while (index < result.length) {
    if (result[index]?.kind !== 'deletion') {
      index += 1;
      continue;
    }

    let deletionEnd = index;
    while (result[deletionEnd]?.kind === 'deletion') deletionEnd += 1;
    let additionEnd = deletionEnd;
    while (result[additionEnd]?.kind === 'addition') additionEnd += 1;

    const pairs = Math.min(deletionEnd - index, additionEnd - deletionEnd);
    for (let pair = 0; pair < pairs; pair += 1) {
      const deletion = result[index + pair]!;
      const addition = result[deletionEnd + pair]!;
      const ranges = computeGitDiffWordRanges(deletion.text, addition.text);
      if (!ranges) continue;
      deletion.words = ranges.left;
      addition.words = ranges.right;
    }

    index = additionEnd > index ? additionEnd : index + 1;
  }

  return result;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightGitDiffText(text: string, query: string): string {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return escapeHtml(text);

  const expression = new RegExp(escapeRegExp(normalizedQuery), 'gi');
  let result = '';
  let cursor = 0;

  for (const match of text.matchAll(expression)) {
    const start = match.index ?? 0;
    result += escapeHtml(text.slice(cursor, start));
    result += `<mark>${escapeHtml(match[0] ?? '')}</mark>`;
    cursor = start + (match[0]?.length ?? 0);
  }

  result += escapeHtml(text.slice(cursor));
  return result;
}

/**
 * Renderiza uma linha combinando os dois destaques possíveis: o trecho alterado
 * em relação à linha oposta e as ocorrências da busca dentro do diff.
 */
export function renderGitDiffLineHtml(
  text: string,
  options: { words?: readonly GitDiffWordRange[]; query?: string } = {},
): string {
  const words = options.words ?? [];
  const query = options.query?.trim() ?? '';
  if (words.length === 0) return highlightGitDiffText(text, query);

  const changed = new Array<boolean>(text.length).fill(false);
  for (const range of words) {
    for (let index = Math.max(0, range.start); index < Math.min(range.end, text.length); index += 1) {
      changed[index] = true;
    }
  }

  const matched = new Array<boolean>(text.length).fill(false);
  if (query) {
    const expression = new RegExp(escapeRegExp(query), 'gi');
    for (const match of text.matchAll(expression)) {
      const start = match.index ?? 0;
      for (let index = start; index < start + (match[0]?.length ?? 0); index += 1) {
        matched[index] = true;
      }
    }
  }

  let html = '';
  let cursor = 0;
  while (cursor < text.length) {
    const isChanged = changed[cursor];
    const isMatch = matched[cursor];
    let end = cursor + 1;
    while (end < text.length && changed[end] === isChanged && matched[end] === isMatch) end += 1;

    const chunk = escapeHtml(text.slice(cursor, end));
    if (isMatch && isChanged) html += `<mark class="git-diff-word">${chunk}</mark>`;
    else if (isMatch) html += `<mark>${chunk}</mark>`;
    else if (isChanged) html += `<span class="git-diff-word">${chunk}</span>`;
    else html += chunk;
    cursor = end;
  }

  return html;
}

export interface GitDiffHunk {
  header: GitUnifiedDiffLine;
  lines: GitUnifiedDiffLine[];
  /** Diferença entre a numeração nova e a antiga na região deste hunk. */
  lineOffset: number;
  firstNewLine: number | null;
  lastNewLine: number | null;
}

export interface GitDiffHunkSplit {
  /** Linhas de metadados que aparecem antes do primeiro hunk. */
  leading: GitUnifiedDiffLine[];
  hunks: GitDiffHunk[];
}

/**
 * Reagrupa o diff plano em hunks, guardando o que a expansão de contexto
 * precisa saber: onde cada hunk começa e termina na numeração do arquivo novo.
 */
export function splitGitDiffHunks(lines: readonly GitUnifiedDiffLine[]): GitDiffHunkSplit {
  const leading: GitUnifiedDiffLine[] = [];
  const hunks: GitDiffHunk[] = [];

  for (const line of lines) {
    if (line.kind === 'hunk') {
      const coordinates = HUNK_PATTERN.exec(line.text);
      const oldStart = Number.parseInt(coordinates?.[2] ?? '0', 10);
      const newStart = Number.parseInt(coordinates?.[4] ?? '0', 10);
      hunks.push({
        header: line,
        lines: [],
        lineOffset: newStart - oldStart,
        firstNewLine: newStart || null,
        lastNewLine: null,
      });
      continue;
    }

    const current = hunks.at(-1);
    if (!current) {
      leading.push(line);
      continue;
    }
    current.lines.push(line);
    if (line.newLine !== null) current.lastNewLine = line.newLine;
  }

  return { leading, hunks };
}

/**
 * Converte linhas cruas do arquivo em linhas de contexto numeradas nos dois
 * lados — o `lineOffset` do hunk reconstrói a numeração antiga.
 */
export function buildGitDiffContextLines(
  texts: readonly string[],
  startNewLine: number,
  lineOffset: number,
): GitUnifiedDiffLine[] {
  return texts.map((text, index) => {
    const newLine = startNewLine + index;
    const oldLine = newLine - lineOffset;
    return {
      kind: 'context' as const,
      text,
      oldLine: oldLine >= 1 ? oldLine : null,
      newLine,
    };
  });
}

export function countGitDiffMatches(content: string, query: string): number {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return 0;
  const expression = new RegExp(escapeRegExp(normalizedQuery), 'gi');
  return Array.from(content.matchAll(expression)).length;
}
