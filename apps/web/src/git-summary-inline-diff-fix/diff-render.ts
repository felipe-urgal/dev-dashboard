import {
  buildSplitGitDiffRows,
  parseUnifiedGitDiff,
  type GitUnifiedDiffLine,
} from '../utils/git-diff-view';

function prefix(line: GitUnifiedDiffLine | null): string {
  if (!line) return '';
  if (line.kind === 'addition') return '+';
  if (line.kind === 'deletion') return '−';
  return line.kind === 'context' ? ' ' : '';
}

function number(value: number | null): string {
  return value === null ? '' : String(value);
}

export function unified(content: string): HTMLElement {
  const table = document.createElement('div');
  table.className = 'git-inline-diff-unified';

  parseUnifiedGitDiff(content).forEach((line) => {
    const row = document.createElement('div');
    row.className = `git-inline-diff-line is-${line.kind}`;

    const oldNumber = document.createElement('span');
    oldNumber.className = 'git-inline-diff-line-number';
    oldNumber.textContent = number(line.oldLine);
    const newNumber = document.createElement('span');
    newNumber.className = 'git-inline-diff-line-number';
    newNumber.textContent = number(line.newLine);
    const marker = document.createElement('span');
    marker.className = 'git-inline-diff-prefix';
    marker.textContent = prefix(line);
    const code = document.createElement('code');
    code.textContent = line.text;

    row.append(oldNumber, newNumber, marker, code);
    table.append(row);
  });

  return table;
}

function splitCell(line: GitUnifiedDiffLine | null, side: 'left' | 'right'): HTMLElement {
  const cell = document.createElement('div');
  cell.className = `git-inline-diff-side is-${side}${line ? ` is-${line.kind}` : ' is-empty'}`;

  const lineNumber = document.createElement('span');
  lineNumber.className = 'git-inline-diff-line-number';
  lineNumber.textContent = number(side === 'left' ? line?.oldLine ?? null : line?.newLine ?? null);
  const marker = document.createElement('span');
  marker.className = 'git-inline-diff-prefix';
  marker.textContent = prefix(line);
  const code = document.createElement('code');
  code.textContent = line?.text ?? '';

  cell.append(lineNumber, marker, code);
  return cell;
}

export function split(content: string): HTMLElement {
  const table = document.createElement('div');
  table.className = 'git-inline-diff-split';

  buildSplitGitDiffRows(parseUnifiedGitDiff(content)).forEach((row) => {
    if (row.kind === 'meta') {
      const meta = document.createElement('div');
      const line = row.left ?? row.right;
      meta.className = `git-inline-diff-split-meta is-${line?.kind ?? 'meta'}`;
      const code = document.createElement('code');
      code.textContent = line?.text ?? '';
      meta.append(code);
      table.append(meta);
      return;
    }

    const pair = document.createElement('div');
    pair.className = `git-inline-diff-pair is-${row.kind}`;
    pair.append(splitCell(row.left, 'left'), splitCell(row.right, 'right'));
    table.append(pair);
  });

  return table;
}
