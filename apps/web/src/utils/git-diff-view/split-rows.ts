import type { GitSplitDiffRow, GitUnifiedDiffLine } from './types';

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
