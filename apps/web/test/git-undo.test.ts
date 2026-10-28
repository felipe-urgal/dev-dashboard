import { describe, expect, it } from 'vitest';

import type { GitFileChange } from '@dev-dashboard/contracts';

import {
  describeCommitUndo,
  groupUndoFiles,
  stagedFilesToUnstage,
  undoActionsFor,
} from '../src/utils/git-undo';

const file = (
  path: string,
  status: GitFileChange['status'],
  indexStatus = '.',
  worktreeStatus = '.',
  extra: Partial<GitFileChange> = {},
): GitFileChange => ({ path, status, indexStatus, worktreeStatus, ...extra });

describe('describeCommitUndo', () => {
  it('commit local usa reset; publicado usa revert', () => {
    const local = describeCommitUndo(
      { available: true, strategy: 'reset' },
      false,
    );
    expect(local.publicationLabel).toBe('Commit local');
    expect(local.actionLabel).toBe('Desfazer commit');
    expect(local.blocked).toBe(false);

    const published = describeCommitUndo(
      { available: true, strategy: 'revert' },
      false,
    );
    expect(published.publicationLabel).toBe('Publicado no remoto');
    expect(published.actionLabel).toBe('Reverter commit');
    expect(published.what).toContain('aguardando Push');
  });

  it('cada bloqueio tem motivo e o atalho certo para resolver', () => {
    const block = (reason: string) =>
      describeCommitUndo(
        { available: false, reason, reference: 'origin/x' },
        false,
      ).block;

    expect(block('dirty')).toMatchObject({ action: 'files' });
    expect(block('behind')).toMatchObject({
      action: 'sync',
      text: expect.stringContaining('origin/x'),
    });
    expect(block('diverged')).toMatchObject({ action: 'sync' });
    expect(block('detached')).toMatchObject({ action: null });
    expect(block('first-commit')).toMatchObject({ action: null });
  });

  it('sem preflight ainda fica bloqueado e indica a verificação', () => {
    const view = describeCommitUndo(null, true);

    expect(view.blocked).toBe(true);
    expect(view.publicationLabel).toBe('Verificando…');
  });
});

describe('arquivos', () => {
  it('só o staged tem ação segura; o resto vai para o menu', () => {
    expect(undoActionsFor(file('a', 'modified', 'M'))).toMatchObject({
      safe: 'unstage',
      menu: [],
    });
    expect(
      undoActionsFor(file('b', 'modified', 'M', 'M')).menu.map(
        (item) => item.key,
      ),
    ).toEqual(['discard']);
    expect(undoActionsFor(file('c', 'untracked', '?', '?'))).toMatchObject({
      safe: null,
      menu: [{ key: 'remove' }],
    });
    expect(
      undoActionsFor(file('d', 'renamed', 'R', '.', { previousPath: 'x' })),
    ).toMatchObject({ safe: 'unstage', menu: [{ key: 'restore' }] });
    expect(undoActionsFor(file('e', 'conflicted', 'U', 'U'))).toMatchObject({
      safe: null,
      menu: [{ key: 'restore' }],
    });
  });

  it('agrupa cada arquivo uma vez e esconde grupos vazios', () => {
    const groups = groupUndoFiles([
      file('a', 'modified', 'M'),
      file('b', 'modified', 'M', 'M'),
      file('c', 'modified', '.', 'M'),
      file('d', 'untracked', '?', '?'),
      file('e', 'renamed', 'R'),
    ]);

    expect(groups.map((group) => [group.id, group.files.length])).toEqual([
      ['staged', 2],
      ['worktree', 1],
      ['untracked', 1],
      ['special', 1],
    ]);
    expect(groupUndoFiles([file('x', 'untracked', '?', '?')]).length).toBe(1);
  });

  it('"tirar tudo do staged" alcança só quem tem algo staged e não está em conflito', () => {
    const targets = stagedFilesToUnstage([
      file('a', 'modified', 'M'),
      file('b', 'modified', '.', 'M'),
      file('c', 'conflicted', 'U', 'U'),
      file('d', 'renamed', 'R'),
    ]);

    expect(targets.map((item) => item.path)).toEqual(['a', 'd']);
  });
});
