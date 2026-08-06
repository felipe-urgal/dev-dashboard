import type { DiffViewMode } from './types';

const VIEW_MODE_KEY = 'dev-dashboard-git-inline-diff-mode';
export const TARGET_FILE_KEY = 'dev-dashboard-git-target-diff-file';

// O texto bruto do patch combinado é preservado em data-raw-patch pela função
// patchView() que cria esse <pre> (git-summary-history-enhancer.ts). Ler apenas
// `.textContent` pegaria a versão já reescrita por outros enhancers (destaque de
// sintaxe, limpeza de cabeçalhos redundantes), sem as linhas "diff --git" que
// `findGitPatchForFile` precisa para separar o patch por arquivo.
export function rawPatchOf(element: HTMLElement): string {
  return element.dataset.rawPatch ?? element.textContent ?? '';
}

export function readViewMode(): DiffViewMode {
  try {
    return window.localStorage.getItem(VIEW_MODE_KEY) === 'split'
      ? 'split'
      : 'unified';
  } catch {
    return 'unified';
  }
}

export function persistViewMode(mode: DiffViewMode): void {
  try {
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // Preferência visual opcional.
  }
}
