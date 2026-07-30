import {
  ArchiveBoxIcon,
  ArrowPathIcon,
  CodeBracketSquareIcon,
  DocumentTextIcon,
} from '@heroicons/vue/24/outline';

import { refreshControls, renderMetrics } from './controls';
import { mountIcon, requestJson } from './dom-helpers';
import { formatDate, statusLabel } from './format';
import { renderList } from './list';
import { setNotice } from './notice';
import { runStashMutation } from './actions';
import { stateBySection } from './state';
import type { StashDetailResponse } from './types';

export function patchView(patch: string): HTMLElement {
  const pre = document.createElement('pre');
  pre.className = 'git-stash-patch';
  // Preserva o texto bruto do patch num atributo, imune a mutações visuais de outros
  // enhancers (destaque de sintaxe, limpeza de cabeçalhos redundantes) que reescrevem o
  // innerHTML do <pre> depois — git-inline-file-diff-enhancer.ts depende desse texto
  // intacto para separar o patch combinado por arquivo.
  pre.dataset.rawPatch = patch;
  if (!patch.trim()) {
    pre.textContent = 'Este stash não possui diff textual para exibir.';
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

export function renderDetailLoading(section: HTMLElement, reference: string): void {
  const host = section.querySelector<HTMLElement>('.git-stash-detail');
  if (!host) return;
  host.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'git-stash-detail-loading';
  mountIcon(loading, ArrowPathIcon, 'git-stash-loading-icon');
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = reference;
  const text = document.createElement('span');
  text.textContent = 'Carregando arquivos e diff…';
  copy.append(title, text);
  loading.append(copy);
  host.append(loading);
}

export function renderEmptyDetail(section: HTMLElement): void {
  const host = section.querySelector<HTMLElement>('.git-stash-detail');
  if (!host) return;
  host.replaceChildren();
  const empty = document.createElement('div');
  empty.className = 'git-stash-detail-empty';
  mountIcon(empty, DocumentTextIcon, 'git-stash-detail-empty-icon');
  const title = document.createElement('strong');
  title.textContent = 'Selecione um stash';
  const copy = document.createElement('p');
  copy.textContent = 'Os arquivos, estatísticas e ações aparecerão aqui.';
  empty.append(title, copy);
  host.append(empty);
}

function detailAction(
  label: string,
  className: string,
  control: string,
  handler: () => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.dataset.stashControl = control;
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

export function renderDetail(section: HTMLElement): void {
  const state = stateBySection.get(section);
  const detail = state?.detail;
  const host = section.querySelector<HTMLElement>('.git-stash-detail');
  if (!state || !detail || !host) {
    renderEmptyDetail(section);
    return;
  }
  host.replaceChildren();

  const header = document.createElement('header');
  header.className = 'git-stash-detail-header';
  const heading = document.createElement('div');
  mountIcon(heading, ArchiveBoxIcon, 'git-stash-detail-icon');
  const copy = document.createElement('div');
  const reference = document.createElement('code');
  reference.textContent = detail.reference;
  const title = document.createElement('h3');
  title.textContent = detail.message;
  const metadata = document.createElement('p');
  metadata.textContent = `${detail.branch} · ${formatDate(detail.createdAt)}`;
  copy.append(reference, title, metadata);
  heading.append(copy);
  header.append(heading);

  const metrics = document.createElement('div');
  metrics.className = 'git-stash-detail-metrics';
  const metricItems: Array<readonly [string, string, string]> = [
    [`${detail.fileCount}`, 'arquivos', ''],
    [`+${detail.additions}`, 'adições', 'is-addition'],
    [`−${detail.deletions}`, 'remoções', 'is-deletion'],
  ];
  metricItems.forEach(([value, label, className]) => {
    const metric = document.createElement('span');
    if (className) metric.className = className;
    const strong = document.createElement('strong');
    strong.textContent = value;
    const small = document.createElement('small');
    small.textContent = label;
    metric.append(strong, small);
    metrics.append(metric);
  });

  const hint = document.createElement('p');
  hint.className = 'git-stash-restore-hint';

  const actions = document.createElement('div');
  actions.className = 'git-stash-detail-actions';
  actions.append(
    detailAction('Aplicar e manter', 'secondary-button', 'restore', () => {
      void runStashMutation(section, 'apply');
    }),
    detailAction('Restaurar e remover', 'primary-button', 'restore', () => {
      void runStashMutation(section, 'pop');
    }),
    detailAction('Excluir stash', 'git-stash-danger-button', 'drop', () => {
      void runStashMutation(section, 'drop');
    }),
  );

  const files = document.createElement('section');
  files.className = 'git-stash-files';
  const filesHeader = document.createElement('header');
  const filesTitle = document.createElement('h4');
  filesTitle.textContent = 'Arquivos guardados';
  const filesCount = document.createElement('span');
  filesCount.textContent = `${detail.files.length} item${detail.files.length === 1 ? '' : 's'}`;
  filesHeader.append(filesTitle, filesCount);
  const list = document.createElement('ul');
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
    list.append(item);
  });
  if (detail.files.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'git-stash-file-empty';
    empty.textContent = 'Nenhum arquivo identificado.';
    list.append(empty);
  }
  files.append(filesHeader, list);

  const diff = document.createElement('details');
  diff.className = 'git-stash-diff';
  const summary = document.createElement('summary');
  mountIcon(summary, CodeBracketSquareIcon, 'git-stash-diff-icon');
  const summaryText = document.createElement('span');
  summaryText.textContent = 'Ver diff completo';
  summary.append(summaryText);
  const warnings = document.createElement('div');
  warnings.className = 'git-stash-warnings';
  if (detail.masked) {
    const warning = document.createElement('p');
    warning.textContent = `${detail.redactionCount} possível(is) segredo(s) foram mascarados.`;
    warnings.append(warning);
  }
  if (detail.truncated) {
    const warning = document.createElement('p');
    warning.textContent = 'O diff foi truncado para manter a interface responsiva.';
    warnings.append(warning);
  }
  diff.append(summary, warnings, patchView(detail.patch));

  host.append(header, metrics, hint, actions, files, diff);
  renderMetrics(section);
}

export async function selectStash(section: HTMLElement, reference: string): Promise<void> {
  const state = stateBySection.get(section);
  if (!state || state.selectedReference === reference && state.detail) return;
  state.detailRequest?.abort();
  const controller = new AbortController();
  state.detailRequest = controller;
  state.selectedReference = reference;
  state.detail = null;
  renderList(section);
  renderDetailLoading(section, reference);
  refreshControls(section);

  try {
    const response = await requestJson<StashDetailResponse>(
      `/api/projects/${encodeURIComponent(state.projectId)}/git/stashes/${encodeURIComponent(reference)}`,
      { signal: controller.signal },
    );
    if (!controller.signal.aborted && state.selectedReference === reference) {
      state.detail = response.detail;
      renderDetail(section);
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      setNotice(
        section,
        error instanceof Error ? error.message : 'Não foi possível inspecionar o stash.',
        'error',
      );
      renderEmptyDetail(section);
    }
  } finally {
    if (state.detailRequest === controller) state.detailRequest = undefined;
    refreshControls(section);
  }
}
