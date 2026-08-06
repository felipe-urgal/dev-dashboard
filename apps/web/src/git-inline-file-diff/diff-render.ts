import {
  buildSplitGitDiffRows,
  parseUnifiedGitDiff,
  type GitUnifiedDiffLine,
} from '../utils/git-diff-view';
import { mountIcon } from './dom-helpers';
import { DocumentTextIcon } from '@heroicons/vue/24/outline';

function linePrefix(line: GitUnifiedDiffLine | null): string {
  if (!line) return '';
  if (line.kind === 'addition') return '+';
  if (line.kind === 'deletion') return '−';
  if (line.kind === 'context') return ' ';
  return '';
}

function lineNumber(value: number | null): string {
  return value === null ? '' : String(value);
}

export function unifiedView(content: string): HTMLElement {
  const table = document.createElement('div');
  table.className = 'git-inline-diff-unified';

  parseUnifiedGitDiff(content).forEach((line) => {
    const row = document.createElement('div');
    row.className = `git-inline-diff-line is-${line.kind}`;

    const oldNumber = document.createElement('span');
    oldNumber.className = 'git-inline-diff-line-number';
    oldNumber.textContent = lineNumber(line.oldLine);
    const newNumber = document.createElement('span');
    newNumber.className = 'git-inline-diff-line-number';
    newNumber.textContent = lineNumber(line.newLine);
    const prefix = document.createElement('span');
    prefix.className = 'git-inline-diff-prefix';
    prefix.textContent = linePrefix(line);
    const code = document.createElement('code');
    code.textContent = line.text;

    row.append(oldNumber, newNumber, prefix, code);
    table.append(row);
  });

  return table;
}

function splitSide(
  line: GitUnifiedDiffLine | null,
  side: 'left' | 'right',
): HTMLElement {
  const cell = document.createElement('div');
  cell.className = `git-inline-diff-side is-${side}${line ? ` is-${line.kind}` : ' is-empty'}`;

  const number = document.createElement('span');
  number.className = 'git-inline-diff-line-number';
  number.textContent = lineNumber(
    side === 'left' ? (line?.oldLine ?? null) : (line?.newLine ?? null),
  );
  const prefix = document.createElement('span');
  prefix.className = 'git-inline-diff-prefix';
  prefix.textContent = linePrefix(line);
  const code = document.createElement('code');
  code.textContent = line?.text ?? '';
  cell.append(number, prefix, code);
  return cell;
}

export function splitView(content: string): HTMLElement {
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
    pair.append(splitSide(row.left, 'left'), splitSide(row.right, 'right'));
    table.append(pair);
  });

  return table;
}

export function emptyView(message: string): HTMLElement {
  const empty = document.createElement('div');
  empty.className = 'git-inline-diff-empty';
  mountIcon(empty, DocumentTextIcon, 'git-inline-diff-empty-icon');
  const title = document.createElement('strong');
  title.textContent = 'Diff indisponível';
  const description = document.createElement('p');
  description.textContent = message;
  empty.append(title, description);
  return empty;
}
