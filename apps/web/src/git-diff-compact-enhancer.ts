interface DiffSummaryMetric {
  label: string;
  value: string;
  tone?: 'addition' | 'deletion' | 'neutral';
}

export interface LeadingPatchMetadata {
  metadata: string[];
  content: string[];
}

export function splitLeadingPatchMetadata(lines: readonly string[]): LeadingPatchMetadata {
  const hunkIndex = lines.findIndex((line) => line.trimStart().startsWith('@@'));
  if (hunkIndex <= 0) return { metadata: [], content: [...lines] };
  return {
    metadata: lines.slice(0, hunkIndex),
    content: lines.slice(hunkIndex),
  };
}

function metricValue(page: HTMLElement, label: string): string {
  const card = [...page.querySelectorAll<HTMLElement>('.git-diff-metrics article')]
    .find((item) => item.querySelector('span')?.textContent?.trim() === label);
  return card?.querySelector('strong')?.textContent?.trim() ?? '0';
}

function appendSummaryMetric(host: HTMLElement, metric: DiffSummaryMetric): void {
  const item = document.createElement('span');
  item.className = `git-diff-compact-summary-item is-${metric.tone ?? 'neutral'}`;
  const strong = document.createElement('strong');
  strong.textContent = metric.value;
  const label = document.createElement('small');
  label.textContent = metric.label;
  item.append(strong, label);
  host.append(item);
}

function updateCompactSummary(page: HTMLElement): void {
  const headingCopy = page.querySelector<HTMLElement>('.git-diff-page-heading > div:first-child');
  const originalDescription = headingCopy?.querySelector<HTMLElement>('p');
  const metrics = page.querySelector<HTMLElement>('.git-diff-metrics');
  if (!headingCopy || !originalDescription || !metrics) return;

  let summary = headingCopy.querySelector<HTMLElement>('.git-diff-compact-summary');
  if (!summary) {
    summary = document.createElement('div');
    summary.className = 'git-diff-compact-summary';
    summary.setAttribute('aria-label', 'Resumo das alterações da branch');
    originalDescription.after(summary);
  }

  const branch = originalDescription.querySelector('strong')?.textContent?.trim() ?? 'Branch atual';
  const description = (originalDescription.textContent ?? '')
    .replace(branch, '')
    .replace('·', '')
    .trim();
  const files = metricValue(page, 'Arquivos');
  const additions = metricValue(page, 'Adições');
  const deletions = metricValue(page, 'Remoções');
  const binaries = metricValue(page, 'Binários');
  const signature = [branch, description, files, additions, deletions, binaries].join('|');
  if (summary.dataset.signature === signature) return;

  summary.dataset.signature = signature;
  summary.replaceChildren();

  const branchItem = document.createElement('strong');
  branchItem.className = 'git-diff-compact-branch';
  branchItem.textContent = branch;
  summary.append(branchItem);

  if (description) {
    const scope = document.createElement('span');
    scope.className = 'git-diff-compact-scope';
    scope.textContent = description;
    summary.append(scope);
  }

  appendSummaryMetric(summary, {
    label: Number(files) === 1 ? 'arquivo' : 'arquivos',
    value: files,
  });
  appendSummaryMetric(summary, { label: 'adições', value: additions, tone: 'addition' });
  appendSummaryMetric(summary, { label: 'remoções', value: deletions, tone: 'deletion' });
  if (Number.parseInt(binaries, 10) > 0) {
    appendSummaryMetric(summary, {
      label: Number(binaries) === 1 ? 'binário' : 'binários',
      value: binaries,
    });
  }

  originalDescription.hidden = true;
  metrics.hidden = true;
}

function totalFileCount(page: HTMLElement): number {
  const text = page.querySelector<HTMLElement>('.git-diff-files-pane > header span')?.textContent ?? '';
  const match = text.match(/de\s+(\d+)/i);
  if (match?.[1]) return Number.parseInt(match[1], 10) || 0;
  return page.querySelectorAll('.git-diff-file-list > button').length;
}

function updateFilters(page: HTMLElement): void {
  const statusFilter = page.querySelector<HTMLElement>('.git-diff-status-filter');
  const singleFile = totalFileCount(page) <= 1;
  page.classList.toggle('has-single-diff-file', singleFile);
  if (statusFilter) statusFilter.hidden = singleFile;
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

function updatePatchMetadata(page: HTMLElement): void {
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

function enhancePage(page: HTMLElement): void {
  updateCompactSummary(page);
  updateFilters(page);
  updatePatchMetadata(page);
}

let scheduled = false;

function scan(): void {
  scheduled = false;
  document.querySelectorAll<HTMLElement>('.git-diff-page').forEach(enhancePage);
}

function scheduleScan(): void {
  if (scheduled) return;
  scheduled = true;
  window.requestAnimationFrame(scan);
}

export function installGitDiffCompactEnhancer(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (document.documentElement.dataset.gitDiffCompactEnhancer === 'true') return;
  document.documentElement.dataset.gitDiffCompactEnhancer = 'true';

  scheduleScan();
  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}
