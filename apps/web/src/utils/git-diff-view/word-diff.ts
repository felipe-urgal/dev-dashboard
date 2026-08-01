import { WORD_DIFF_MAX_CELLS, WORD_DIFF_MIN_SIMILARITY, WORD_PATTERN } from './constants';
import type { GitDiffWordRange, GitUnifiedDiffLine } from './types';

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
