import { describe, expect, it } from 'vitest';

import type { GitFileChange } from '@dev-dashboard/contracts';

import {
  describeCommitUndo,
  stagedFilesToUnstage,
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
});

describe('arquivos', () => {
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
