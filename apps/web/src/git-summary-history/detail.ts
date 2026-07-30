import {
  ArrowPathIcon,
  CodeBracketSquareIcon,
  DocumentTextIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

import { mountIcon, requestJson } from './dom-helpers';
import { formatDate, statusLabel } from './format';
import { renderHistoryList } from './list';
import { stateBySection } from './state';
import type { CommitDetail, CommitDetailResponse, GitCommitSummary } from './types';

function patchView(patch: string): HTMLElement {
  const pre = document.createElement('pre');
  pre.className = 'git-commit-detail-patch';
  // Preserva o texto bruto do patch num atributo, imune a mutações visuais de outros
  // enhancers (destaque de sintaxe, limpeza de cabeçalhos redundantes) que reescrevem o
  // innerHTML do <pre> depois — git-inline-file-diff-enhancer.ts depende desse texto
  // intacto para separar o patch combinado por arquivo.
  pre.dataset.rawPatch = patch;
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

function setDetailLoading(section: HTMLElement, commit: GitCommitSummary): void {
  const panel = section.querySelector<HTMLElement>('.git-summary-commit-detail');
  if (!panel) return;
  panel.replaceChildren();

  const loading = document.createElement('div');
  loading.className = 'git-summary-detail-loading';
  mountIcon(loading, ArrowPathIcon, 'git-summary-loading-icon');
  const text = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = commit.subject;
  const span = document.createElement('span');
  span.textContent = 'Carregando alterações do commit…';
  text.append(strong, span);
  loading.append(text);
  panel.append(loading);
}

function renderCommitDetail(section: HTMLElement, detail: CommitDetail): void {
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
  close.title = 'Fechar detalhes e expandir histórico';
  close.setAttribute('aria-label', 'Fechar detalhes do commit');
  mountIcon(close, XMarkIcon, 'git-summary-close-icon');
  close.addEventListener('click', () => closeCommitDetail(section));
  header.append(heading, close);

  const metrics = document.createElement('div');
  metrics.className = 'git-summary-detail-metrics';
  const fileMetric = document.createElement('span');
  fileMetric.innerHTML = `<strong>${detail.files.length}</strong><small>arquivo(s)</small>`;
  const additions = document.createElement('span');
  additions.className = 'is-addition';
  additions.innerHTML = `<strong>+${detail.additions}</strong><small>adições</small>`;
  const deletions = document.createElement('span');
  deletions.className = 'is-deletion';
  deletions.innerHTML = `<strong>−${detail.deletions}</strong><small>remoções</small>`;
  metrics.append(fileMetric, additions, deletions);

  const body = document.createElement('p');
  body.className = 'git-summary-detail-body';
  body.textContent = detail.body && detail.body !== detail.subject
    ? detail.body
    : 'O commit não possui uma descrição adicional.';

  const filesSection = document.createElement('section');
  filesSection.className = 'git-summary-detail-files';
  const filesTitle = document.createElement('header');
  const filesHeading = document.createElement('h4');
  filesHeading.textContent = 'Arquivos alterados';
  filesTitle.append(filesHeading);
  const fileList = document.createElement('ul');
  detail.files.forEach((file) => {
    const item = document.createElement('li');
    const status = document.createElement('span');
    status.className = `is-${file.status}`;
    status.textContent = statusLabel(file.status);
    const path = document.createElement('code');
    path.textContent = file.previousPath
      ? `${file.previousPath} → ${file.path}`
      : file.path;
    const stats = document.createElement('small');
    stats.textContent = file.binary ? 'binário' : `+${file.additions} / −${file.deletions}`;
    item.append(status, path, stats);
    fileList.append(item);
  });
  if (detail.files.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'git-summary-detail-files-empty';
    empty.textContent = 'Nenhum arquivo alterado foi identificado.';
    fileList.append(empty);
  }
  filesSection.append(filesTitle, fileList);

  const patchSection = document.createElement('details');
  patchSection.className = 'git-summary-detail-diff';
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
  patchSection.append(summary, warnings, patchView(detail.patch));

  panel.append(header, metrics, body, filesSection, patchSection);
}

function renderDetailError(section: HTMLElement, message: string): void {
  const panel = section.querySelector<HTMLElement>('.git-summary-commit-detail');
  if (!panel) return;
  panel.replaceChildren();

  const error = document.createElement('div');
  error.className = 'git-summary-detail-error';
  const title = document.createElement('strong');
  title.textContent = 'Não foi possível abrir este commit';
  const description = document.createElement('p');
  description.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'secondary-button';
  close.textContent = 'Voltar ao histórico';
  close.addEventListener('click', () => closeCommitDetail(section));
  error.append(title, description, close);
  panel.append(error);
}

export async function selectCommit(section: HTMLElement, commitHash: string): Promise<void> {
  const state = stateBySection.get(section);
  if (!state) return;
  const commit = state.commits.find((candidate) => candidate.hash === commitHash);
  if (!commit) return;

  state.request?.abort();
  const controller = new AbortController();
  state.request = controller;
  state.selectedHash = commitHash;
  section.querySelector('.git-summary-history-shell')?.classList.add('is-inspecting');
  renderHistoryList(section);
  setDetailLoading(section, commit);

  try {
    const response = await requestJson<CommitDetailResponse>(
      `/api/projects/${encodeURIComponent(state.projectId)}/git/commits/${encodeURIComponent(commitHash)}`,
      controller.signal,
    );
    if (!controller.signal.aborted && state.selectedHash === commitHash) {
      renderCommitDetail(section, response.detail);
    }
  } catch (error) {
    if (!controller.signal.aborted && state.selectedHash === commitHash) {
      renderDetailError(
        section,
        error instanceof Error ? error.message : 'Falha ao carregar o commit.',
      );
    }
  }
}

export function closeCommitDetail(section: HTMLElement): void {
  const state = stateBySection.get(section);
  if (!state) return;
  state.request?.abort();
  state.request = undefined;
  state.selectedHash = '';
  section.querySelector('.git-summary-history-shell')?.classList.remove('is-inspecting');
  section.querySelector('.git-summary-commit-detail')?.replaceChildren();
  renderHistoryList(section);
}
