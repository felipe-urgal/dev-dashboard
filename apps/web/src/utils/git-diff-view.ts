export type GitDiffLineKind =
  | 'addition'
  | 'deletion'
  | 'context'
  | 'hunk'
  | 'meta'
  | 'notice';

export interface GitUnifiedDiffLine {
  kind: GitDiffLineKind;
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface GitSplitDiffRow {
  kind: 'change' | 'context' | 'meta';
  left: GitUnifiedDiffLine | null;
  right: GitUnifiedDiffLine | null;
}

const HUNK_PATTERN = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/;

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
  const lines: GitUnifiedDiffLine[] = [];

  for (const rawLine of content.split('\n')) {
    const hunk = HUNK_PATTERN.exec(rawLine);
    if (hunk) {
      oldLine = Number.parseInt(hunk[1] ?? '0', 10);
      newLine = Number.parseInt(hunk[3] ?? '0', 10);
      lines.push(metaLine(rawLine, 'hunk'));
      continue;
    }

    if (
      rawLine.startsWith('diff --git ')
      || rawLine.startsWith('index ')
      || rawLine.startsWith('--- ')
      || rawLine.startsWith('+++ ')
      || rawLine.startsWith('new file mode ')
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

export function countGitDiffMatches(content: string, query: string): number {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return 0;
  const expression = new RegExp(escapeRegExp(normalizedQuery), 'gi');
  return Array.from(content.matchAll(expression)).length;
}
