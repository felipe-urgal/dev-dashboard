import type { DiffSummaryMetric } from './types';

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

export function updateCompactSummary(page: HTMLElement): void {
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
