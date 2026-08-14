import { isRedundantGitDiffHeaderLine } from '../git-diff-metadata';
import { HUNK_PATTERN } from './constants';
import type { GitDiffLineKind, GitUnifiedDiffLine } from './types';

function metaLine(
  text: string,
  kind: GitDiffLineKind = 'meta',
): GitUnifiedDiffLine {
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
  const rawLines = content.split('\n');
  if (rawLines.at(-1) === '') rawLines.pop();

  for (const rawLine of rawLines) {
    const hunk = HUNK_PATTERN.exec(rawLine);
    if (hunk) {
      oldLine = Number.parseInt(hunk[2] ?? '0', 10);
      newLine = Number.parseInt(hunk[4] ?? '0', 10);
      const coordinates = hunk[1] ?? rawLine;
      const context = hunk[6]?.trim() ?? '';
      const repeatedContext =
        Boolean(context) && context === previousHunkContext;
      lines.push(metaLine(repeatedContext ? coordinates : rawLine, 'hunk'));
      if (context) previousHunkContext = context;
      continue;
    }

    if (
      rawLine.startsWith('diff --git ') ||
      rawLine.startsWith('index ') ||
      rawLine.startsWith('--- ') ||
      rawLine.startsWith('+++ ')
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
      rawLine.startsWith('new file mode ') ||
      rawLine.startsWith('deleted file mode ') ||
      rawLine.startsWith('similarity index ') ||
      rawLine.startsWith('rename from ') ||
      rawLine.startsWith('rename to ')
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
