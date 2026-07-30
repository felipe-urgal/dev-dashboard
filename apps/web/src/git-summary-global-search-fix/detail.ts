import {
  ArrowPathIcon,
  CodeBracketSquareIcon,
  DocumentTextIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

import { closeSearchDetail, renderResults } from './list';
import { mountIcon } from './dom-helpers';
import { formatDate, statusLabel } from './format';
import { requestJson } from './network';
import { stateFor } from './state';
import type { CommitDetail, CommitSummary, DetailResponse } from './types';

function patchView(patch: string): HTMLElement {
  const pre = document.createElement('pre');
  pre.className = 'git-commit-detail-patch';
  if (!patch.trim()) {
    pre.textContent = 'Este commit não possui um patch textual para exibir.';
    return pre;
  }
  patch.split('\n').forEach((line) => {
    const row = document.createElement('span');
    row.className = line.startsWith('+++') || line.startsWith('---')
      ? 'is-file'
      : line.startsWith('+')
        ? 'is-addition'
        : line.startsWith('-')
          ? 'is-deletion'
          : line.startsWith('@@')
            ? 'is-hunk'
            : line.startsWith('diff ') || line.startsWith('index ')
              ? 'is-meta'
              : '';
    row.textContent = `${line}\n`;
    pre.append(row);
  });
  return pre;
}

function metric(value: string, label: string, className = ''): HTMLElement {
  const item = document.createElement('span');
  if (className) item.className = className;
  const strong = document.createElement('strong');
  strong.textContent = value;
  const small = document.createElement('small');
  small.textContent = label;
  item.append(strong, small);
  return item;
}

function renderDetail(section: HTMLElement, detail: CommitDetail): void {
  const panel = section.querySelector<HTMLElement>('.git-summary-commit-detail');
  if (!panel) return;
  panel.replaceChildren();

  const header = document.createElement('header');
  header.className = 'git-summary-detail-header';
  const heading = document.createElement('div');
  heading.className = 'git-summary-detail-heading';
  mountIcon(heading, DocumentTextIcon, 'git-summary-detail-icon');
  const copy = document.createElement('div');
  const hash = document.createElement('code');
  hash.textContent = detail.shortHash;
  const title = document.createElement('h3');
  title.textContent = detail.subject;
  const metadata = document.createElement('p');
  metadata.textContent = `${detail.authorName} · ${formatDate(detail.authoredAt)}`;
  copy.append(hash, title, metadata);
  heading.append(copy);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'git-summary-detail-close';
  close.title = 'Fechar detalhes e voltar aos resultados';
  close.setAttribute('aria-label', 'Fechar detalhes do commit');
  mountIcon(close, XMarkIcon, 'git-summary-close-icon');
  close.addEventListener('click', () => closeSearchDetail(section));
  header.append(heading, close);

  const metrics = document.createElement('div');
  metrics.className = 'git-summary-detail-metrics';
  metrics.append(
    metric(String(detail.files.length), 'arquivo(s)'),
    metric(`+${detail.additions}`, 'adições', 'is-addition'),
    metric(`−${detail.deletions}`, 'remoções', 'is-deletion'),
  );

  const body = document.createElement('p');
  body.className = 'git-summary-detail-body';
  body.textContent = detail.body && detail.body !== detail.subject
    ? detail.body
    : 'O commit não possui uma descrição adicional.';

  const filesSection = document.createElement('section');
  filesSection.className = 'git-summary-detail-files';
  const filesHeader = document.createElement('header');
  const filesHeading = document.createElement('h4');
  filesHeading.textContent = 'Arquivos alterados';
  filesHeader.append(filesHeading);
  const files = document.createElement('ul');
  detail.files.forEach((file) => {
    const item = document.createElement('li');
    const status = document.createElement('span');
    status.className = `is-${file.status}`;
    status.textContent = statusLabel(file.status);
    const path = document.createElement('code');
    path.textContent = file.previousPath ? `${file.previousPath} → ${file.path}` : file.path;
    const stats = document.createElement('small');
    stats.textContent = file.binary ? 'binário' : `+${file.additions} / −${file.deletions}`;
    item.append(status, path, stats);
    files.append(item);
  });
  if (detail.files.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'git-summary-detail-files-empty';
    empty.textContent = 'Nenhum arquivo alterado foi identificado.';
    files.append(empty);
  }
  filesSection.append(filesHeader, files);

  const diff = document.createElement('details');
  diff.className = 'git-summary-detail-diff';
  const summary = document.createElement('summary');
  mountIcon(summary, CodeBracketSquareIcon, 'git-summary-diff-icon');
  const summaryText = document.createElement('span');
  summaryText.textContent = 'Ver diff completo';
  summary.append(summaryText);
  const warnings = document.createElement('div');
  warnings.className = 'git-summary-detail-warnings';
  if (detail.masked) {
    const warning = document.createElement('p');
    warning.textContent = `${detail.redactionCount} possível(is) segredo(s) foram mascarados.`;
    warnings.append(warning);
  }
  if (detail.truncated) {
    const warning = document.createElement('p');
    warning.textContent = 'O diff foi truncado para manter a página responsiva.';
    warnings.append(warning);
  }
  diff.append(summary, warnings, patchView(detail.patch));
  panel.append(header, metrics, body, filesSection, diff);
}

export async function selectResult(section: HTMLElement, commit: CommitSummary): Promise<void> {
  const state = stateFor(section);
  state.detailRequest?.abort();
  const controller = new AbortController();
  state.detailRequest = controller;
  state.selectedHash = commit.hash;
  section.querySelector('.git-summary-history-shell')?.classList.add('is-inspecting');
  renderResults(section);

  const panel = section.querySelector<HTMLElement>('.git-summary-commit-detail');
  panel?.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'git-summary-detail-loading';
  mountIcon(loading, ArrowPathIcon, 'git-summary-loading-icon');
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = commit.subject;
  const description = document.createElement('span');
  description.textContent = 'Carregando alterações do commit…';
  copy.append(title, description);
  loading.append(copy);
  panel?.append(loading);

  try {
    const response = await requestJson<DetailResponse>(
      `/api/projects/${encodeURIComponent(state.projectId)}/git/commits/${encodeURIComponent(commit.hash)}`,
      controller.signal,
    );
    if (!controller.signal.aborted && state.selectedHash === commit.hash) {
      renderDetail(section, response.detail);
    }
  } catch (error) {
    if (controller.signal.aborted || state.selectedHash !== commit.hash || !panel) return;
    panel.replaceChildren();
    const message = document.createElement('div');
    message.className = 'git-summary-detail-error';
    const title = document.createElement('strong');
    title.textContent = 'Não foi possível abrir este commit';
    const description = document.createElement('p');
    description.textContent = error instanceof Error ? error.message : 'Falha ao carregar o commit.';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'secondary-button';
    back.textContent = 'Voltar aos resultados';
    back.addEventListener('click', () => closeSearchDetail(section));
    message.append(title, description, back);
    panel.append(message);
  }
}
