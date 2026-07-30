import type { LeadingPatchMetadata } from './types';

export function splitLeadingPatchMetadata(lines: readonly string[]): LeadingPatchMetadata {
  const hunkIndex = lines.findIndex((line) => line.trimStart().startsWith('@@'));
  if (hunkIndex <= 0) return { metadata: [], content: [...lines] };
  return {
    metadata: lines.slice(0, hunkIndex),
    content: lines.slice(hunkIndex),
  };
}

function leadingMetadataRows(body: HTMLElement): HTMLElement[] {
  const rows: HTMLElement[] = [];
  for (const child of [...body.children]) {
    if (!(child instanceof HTMLElement)) continue;
    const text = child.textContent?.trimStart() ?? '';
    if (text.startsWith('@@')) break;
    const metadata = child.classList.contains('is-meta')
      || child.classList.contains('git-diff-split-meta');
    if (!metadata) break;
    rows.push(child);
  }
  return rows;
}

export function updatePatchMetadata(page: HTMLElement): void {
  const body = page.querySelector<HTMLElement>('.git-diff-unified, .git-diff-split');
  const viewer = page.querySelector<HTMLElement>('.git-diff-viewer');
  if (!body || !viewer) {
    viewer?.querySelector('.git-diff-patch-metadata')?.remove();
    return;
  }

  const rows = leadingMetadataRows(body);
  const lines = rows.map((row) => row.textContent?.trimEnd() ?? '').filter(Boolean);
  const existing = viewer.querySelector<HTMLDetailsElement>('.git-diff-patch-metadata');

  if (lines.length === 0) {
    existing?.remove();
    return;
  }

  rows.forEach((row) => {
    row.hidden = true;
  });

  const signature = lines.join('\n');
  if (existing?.dataset.signature === signature && existing.nextElementSibling === body) return;
  existing?.remove();

  const details = document.createElement('details');
  details.className = 'git-diff-patch-metadata';
  details.dataset.signature = signature;
  const summary = document.createElement('summary');
  const label = document.createElement('span');
  label.textContent = 'Metadados do patch';
  const hint = document.createElement('small');
  hint.textContent = `${lines.length} linha${lines.length === 1 ? '' : 's'}`;
  summary.append(label, hint);
  const pre = document.createElement('pre');
  pre.textContent = signature;
  details.append(summary, pre);
  body.before(details);
}
