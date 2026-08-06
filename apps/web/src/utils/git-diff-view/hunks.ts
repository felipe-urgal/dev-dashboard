import { HUNK_PATTERN } from './constants';
import type { GitDiffHunkSplit, GitUnifiedDiffLine } from './types';

/**
 * Reagrupa o diff plano em hunks, guardando o que a expansão de contexto
 * precisa saber: onde cada hunk começa e termina na numeração do arquivo novo.
 */
export function splitGitDiffHunks(
  lines: readonly GitUnifiedDiffLine[],
): GitDiffHunkSplit {
  const leading: GitUnifiedDiffLine[] = [];
  const hunks: GitDiffHunkSplit['hunks'] = [];

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
