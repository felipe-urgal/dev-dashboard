import type { GitFileChange } from '@dev-dashboard/contracts';

export interface UndoCommitStatus {
  available: boolean;
  strategy?: 'reset' | 'revert' | undefined;
  reason?: string | undefined;
  reference?: string | undefined;
}

export type UndoBlockAction = 'files' | 'sync' | null;

export interface CommitUndoView {
  publicationLabel: string;
  publicationTone: 'success' | 'warning' | 'neutral';
  /** O que acontece ao confirmar (ou por que não dá). */
  what: string;
  blocked: boolean;
  block: { title: string; text: string; action: UndoBlockAction } | null;
  actionLabel: string;
  confirm: { title: string; message: string; label: string };
}

const BLOCKS: Record<
  string,
  (reference: string) => {
    title: string;
    text: string;
    action: UndoBlockAction;
  }
> = {
  behind: (reference) => ({
    title: 'Sincronização necessária',
    text: `A branch está atrás de ${reference}. Sincronize antes de desfazer o commit.`,
    action: 'sync',
  }),
  diverged: (reference) => ({
    title: 'Branch divergente',
    text: `A branch divergiu de ${reference}. Resolva a divergência antes de desfazer o commit.`,
    action: 'sync',
  }),
  dirty: () => ({
    title: 'Alterações locais pendentes',
    text: 'Registre ou desfaça as alterações locais atuais antes de desfazer o commit.',
    action: 'files',
  }),
  'first-commit': () => ({
    title: 'Primeiro commit',
    text: 'O primeiro commit do repositório não pode ser desfeito por esta ação.',
    action: null,
  }),
  detached: () => ({
    title: 'HEAD destacado',
    text: 'Selecione uma branch antes de desfazer commits.',
    action: null,
  }),
  'no-commit': () => ({
    title: 'Sem commit',
    text: 'Nenhum commit está disponível para desfazer.',
    action: null,
  }),
};

/** Tudo que a tela mostra sobre o último commit, a partir do preflight. */
export function describeCommitUndo(
  status: UndoCommitStatus | null,
  loading: boolean,
): CommitUndoView {
  const revert = status?.strategy === 'revert';
  const actionLabel = revert ? 'Reverter commit' : 'Desfazer commit';

  if (!status) {
    return {
      publicationLabel: loading ? 'Verificando…' : 'Indisponível',
      publicationTone: 'neutral',
      what: 'Verificando se o último commit pode ser desfeito.',
      blocked: true,
      block: null,
      actionLabel,
      confirm: { title: `${actionLabel}?`, message: '', label: actionLabel },
    };
  }

  if (!status.available) {
    const block = (BLOCKS[status.reason ?? ''] ?? BLOCKS['no-commit']!)(
      status.reference ?? 'seu remoto',
    );
    return {
      publicationLabel: block.title,
      publicationTone: 'warning',
      what: 'Se o commit é local, ele é removido e as alterações ficam staged; se já está no remoto, é criado um commit inverso aguardando Push.',
      blocked: true,
      block,
      actionLabel,
      confirm: { title: `${actionLabel}?`, message: '', label: actionLabel },
    };
  }

  return {
    publicationLabel: revert ? 'Publicado no remoto' : 'Commit local',
    publicationTone: revert ? 'warning' : 'success',
    what: revert
      ? 'O commit já está no remoto. Um novo commit inverso será criado localmente e ficará aguardando Push.'
      : 'O commit será removido da branch com reset soft e suas alterações ficarão staged para edição ou novo commit.',
    blocked: false,
    block: null,
    actionLabel,
    confirm: {
      title: `${actionLabel}?`,
      message: revert
        ? 'Será criado um novo commit que inverte o último commit. O histórico não será reescrito e a reversão ficará aguardando Push.'
        : 'O último commit será removido com reset soft. Todos os arquivos desse commit continuarão staged.',
      label: actionLabel,
    },
  };
}

export function hasStagedChange(file: GitFileChange): boolean {
  return file.indexStatus !== '.' && file.indexStatus !== '?';
}

export function hasWorktreeChange(file: GitFileChange): boolean {
  return file.worktreeStatus !== '.' && file.worktreeStatus !== '?';
}

export function isSpecialRestore(file: GitFileChange): boolean {
  return ['renamed', 'copied', 'conflicted'].includes(file.status);
}

export type UndoFileAction = 'unstage' | 'discard' | 'remove' | 'restore';

export interface UndoFileActions {
  /** Ação segura (preserva o conteúdo), mostrada direto na linha. */
  safe: 'unstage' | null;
  /** Ações destrutivas, no menu. */
  menu: {
    key: Exclude<UndoFileAction, 'unstage'>;
    label: string;
    risk: string;
  }[];
}

export function restoreLabelFor(file: GitFileChange): string {
  if (file.status === 'renamed') return 'Restaurar rename';
  if (file.status === 'copied') return 'Descartar cópia';
  return 'Restaurar HEAD';
}

function restoreRiskFor(file: GitFileChange): string {
  if (file.status === 'renamed') return 'desfaz o rename por completo';
  if (file.status === 'copied') return 'remove a cópia';
  return 'substitui o conflito pela versão do HEAD';
}

export function undoActionsFor(file: GitFileChange): UndoFileActions {
  const menu: UndoFileActions['menu'] = [];

  if (
    hasWorktreeChange(file) &&
    file.status !== 'untracked' &&
    !isSpecialRestore(file)
  ) {
    menu.push({
      key: 'discard',
      label: 'Descartar alterações',
      risk: 'apaga as alterações não staged',
    });
  }
  if (file.status === 'untracked') {
    menu.push({
      key: 'remove',
      label: 'Excluir arquivo',
      risk: 'apaga para sempre — o Git não tem cópia',
    });
  }
  if (isSpecialRestore(file)) {
    menu.push({
      key: 'restore',
      label: restoreLabelFor(file),
      risk: restoreRiskFor(file),
    });
  }

  return {
    safe:
      hasStagedChange(file) && file.status !== 'conflicted' ? 'unstage' : null,
    menu,
  };
}

export type UndoGroupId = 'staged' | 'worktree' | 'untracked' | 'special';

export interface UndoGroup {
  id: UndoGroupId;
  title: string;
  files: GitFileChange[];
}

const GROUP_TITLES: Record<UndoGroupId, string> = {
  staged: 'Staged',
  worktree: 'Não staged',
  untracked: 'Não rastreadas',
  special: 'Renomeados e conflitos',
};

function groupOf(file: GitFileChange): UndoGroupId {
  if (isSpecialRestore(file)) return 'special';
  if (file.status === 'untracked') return 'untracked';
  return hasStagedChange(file) ? 'staged' : 'worktree';
}

/** Cada arquivo aparece uma vez; grupos vazios não existem. */
export function groupUndoFiles(files: readonly GitFileChange[]): UndoGroup[] {
  return (Object.keys(GROUP_TITLES) as UndoGroupId[])
    .map((id) => ({
      id,
      title: GROUP_TITLES[id],
      files: files.filter((file) => groupOf(file) === id),
    }))
    .filter((group) => group.files.length > 0);
}

/** Arquivos que "Tirar tudo do staged" alcança. */
export function stagedFilesToUnstage(
  files: readonly GitFileChange[],
): GitFileChange[] {
  return files.filter((file) => undoActionsFor(file).safe === 'unstage');
}
