import {
  ArrowPathIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  XMarkIcon,
} from '@heroicons/vue/24/outline';

import { mountIcon, requestJson } from './dom-helpers';
import { formatDate, statusLabel } from './format';
import { closeDetail, renderList } from './list';
import { stateBySection } from './state';
import type { CommitDetail, CommitDetailResponse, GitHistoryCommit } from './types';

export function patchView(patch: string): HTMLElement {
  const pre = document.createElement('pre');
  pre.className = 'git-history-page-patch';
  // Preserva o texto bruto do patch num atributo, imune a mutações visuais de outros
  // enhancers (destaque de sintaxe, limpeza de cabeçalhos redundantes) que reescrevem o
  // innerHTML do <pre> depois — git-inline-file-diff-enhancer.ts depende desse texto
  // intacto para separar o patch combinado por arquivo.
  pre.dataset.rawPatch = patch;
  if (!patch.trim()) {
    pre.textContent = 'Este commit não possui diff textual para exibir.';
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

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

export function detailLoading(section: HTMLElement, commit: GitHistoryCommit): void {
  const host = section.querySelector<HTMLElement>('.git-history-page-detail');
  if (!host) return;
  host.scrollTop = 0;
  host.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'git-history-page-detail-loading';
  mountIcon(loading, ArrowPathIcon, 'git-history-page-loading-icon');
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = commit.subject;
  const description = document.createElement('span');
  description.textContent = 'Carregando arquivos e diff…';
  copy.append(title, description);
  loading.append(copy);
  host.append(loading);
}

export function renderDetail(section: HTMLElement, detail: CommitDetail): void {
  const state = stateBySection.get(section);
  const host = section.querySelector<HTMLElement>('.git-history-page-detail');
  if (!state || !host) return;
  host.scrollTop = 0;
  host.replaceChildren();

  const header = document.createElement('header');
  header.className = 'git-history-page-detail-header';
  const heading = document.createElement('div');
  heading.className = 'git-history-page-detail-heading';
  mountIcon(heading, DocumentTextIcon, 'git-history-page-detail-icon');
  const copy = document.createElement('div');
  const hashLine = document.createElement('span');
  hashLine.className = 'git-history-page-detail-hash';
  const hash = document.createElement('code');
  hash.textContent = detail.shortHash;
  const copyHash = document.createElement('button');
  copyHash.type = 'button';
  copyHash.title = 'Copiar hash completo';
  copyHash.setAttribute('aria-label', 'Copiar hash completo do commit');
  mountIcon(copyHash, ClipboardDocumentIcon, 'git-history-page-copy-icon');
  copyHash.addEventListener('click', async () => {
    await copyText(detail.hash);
    state.copiedHash = detail.hash;
    copyHash.replaceChildren();
    mountIcon(copyHash, CheckIcon, 'git-history-page-copy-icon');
    copyHash.classList.add('is-copied');
    window.setTimeout(() => {
      if (state.copiedHash !== detail.hash) return;
      state.copiedHash = '';
      copyHash.replaceChildren();
      mountIcon(copyHash, ClipboardDocumentIcon, 'git-history-page-copy-icon');
      copyHash.classList.remove('is-copied');
    }, 1_800);
  });
  hashLine.append(hash, copyHash);
  const title = document.createElement('h3');
  title.textContent = detail.subject;
  const metadata = document.createElement('p');
  metadata.textContent = `${detail.authorName} <${detail.authorEmail}> · ${formatDate(detail.authoredAt)}`;
  copy.append(hashLine, title, metadata);
  heading.append(copy);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'git-history-page-detail-close';
  close.title = 'Fechar detalhes';
  close.setAttribute('aria-label', 'Fechar detalhes do commit');
  mountIcon(close, XMarkIcon, 'git-history-page-close-icon');
  close.addEventListener('click', () => closeDetail(section));
  header.append(heading, close);

  const metrics = document.createElement('div');
  metrics.className = 'git-history-page-detail-metrics';
  [
    [String(detail.files.length), 'arquivos', ''],
    [`+${detail.additions}`, 'adições', 'is-addition'],
    [`−${detail.deletions}`, 'remoções', 'is-deletion'],
  ].forEach(([value, label, className]) => {
    const metric = document.createElement('span');
    if (className) metric.className = className;
    const strong = document.createElement('strong');
    strong.textContent = value ?? '';
    const small = document.createElement('small');
    small.textContent = label ?? '';
    metric.append(strong, small);
    metrics.append(metric);
  });

  const body = document.createElement('p');
  body.className = 'git-history-page-detail-body';
  body.textContent = detail.body && detail.body !== detail.subject
    ? detail.body
    : 'O commit não possui uma descrição adicional.';

  const files = document.createElement('section');
  files.className = 'git-history-page-detail-files';
  const filesHeader = document.createElement('header');
  const filesTitle = document.createElement('h4');
  filesTitle.textContent = 'Arquivos alterados';
  filesHeader.append(filesTitle);
  const fileList = document.createElement('ul');
  detail.files.forEach((file) => {
    const item = document.createElement('li');
    const status = document.createElement('span');
    status.className = `is-${file.status}`;
    status.textContent = statusLabel(file.status);
    const filePath = document.createElement('code');
    filePath.textContent = file.previousPath ? `${file.previousPath} → ${file.path}` : file.path;
    const stats = document.createElement('small');
    stats.textContent = file.binary ? 'binário' : `+${file.additions} / −${file.deletions}`;
    item.append(status, filePath, stats);
    fileList.append(item);
  });
  if (detail.files.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'git-history-page-files-empty';
    empty.textContent = 'Nenhum arquivo alterado foi identificado.';
    fileList.append(empty);
  }
  files.append(filesHeader, fileList);

  const warnings = document.createElement('div');
  warnings.className = 'git-history-page-warnings';
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

  // O patch combinado continua no DOM apenas como fonte para os diffs individuais.
  // A visualização completa foi removida do Histórico para evitar duplicação e ruído.
  const patchSource = document.createElement('div');
  patchSource.className = 'git-history-page-patch-source';
  patchSource.hidden = true;
  patchSource.append(patchView(detail.patch));

  host.append(header, metrics, body, files);
  if (warnings.childElementCount > 0) host.append(warnings);
  host.append(patchSource);
}

export function renderDetailError(section: HTMLElement, message: string): void {
  const host = section.querySelector<HTMLElement>('.git-history-page-detail');
  if (!host) return;
  host.scrollTop = 0;
  host.replaceChildren();
  const error = document.createElement('div');
  error.className = 'git-history-page-detail-error';
  const title = document.createElement('strong');
  title.textContent = 'Não foi possível abrir este commit';
  const description = document.createElement('p');
  description.textContent = message;
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'secondary-button';
  back.textContent = 'Voltar ao histórico';
  back.addEventListener('click', () => closeDetail(section));
  error.append(title, description, back);
  host.append(error);
}

export async function selectCommit(section: HTMLElement, hash: string): Promise<void> {
  const state = stateBySection.get(section);
  if (!state) return;
  const commit = state.commits.find((candidate) => candidate.hash === hash);
  if (!commit) return;
  state.detailRequest?.abort();
  const controller = new AbortController();
  state.detailRequest = controller;
  state.selectedHash = hash;
  section.querySelector('.git-history-page-layout')?.classList.add('is-inspecting');
  renderList(section);
  detailLoading(section, commit);

  try {
    const response = await requestJson<CommitDetailResponse>(
      `/api/projects/${encodeURIComponent(state.projectId)}/git/commits/${encodeURIComponent(hash)}`,
      controller.signal,
    );
    if (!controller.signal.aborted && state.selectedHash === hash) {
      renderDetail(section, response.detail);
    }
  } catch (error) {
    if (!controller.signal.aborted && state.selectedHash === hash) {
      renderDetailError(
        section,
        error instanceof Error ? error.message : 'Falha ao carregar o commit.',
      );
    }
  }
}
