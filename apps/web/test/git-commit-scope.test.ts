import { describe, expect, it } from 'vitest';

import type { GitCommit, GitFileChange } from '@dev-dashboard/contracts';

import {
  activeCommitPrefix,
  applyCommitPrefix,
  canAmendCommit,
  canCreateCommit,
  deriveCommitScope,
  joinCommitMessage,
  splitCommitMessage,
} from '../src/utils/git-commit-scope';

const file = (
  path: string,
  status: GitFileChange['status'],
  indexStatus = '.',
): GitFileChange => ({ path, status, indexStatus, worktreeStatus: '.' });

const latest = { subject: 'feat: antigo' } as GitCommit;

describe('deriveCommitScope', () => {
  const scope = deriveCommitScope([
    file('a.ts', 'modified', 'M'),
    file('b.ts', 'modified'),
    file('c.ts', 'untracked', '?'),
    file('d.ts', 'conflicted', 'U'),
  ]);

  it('separa rastreadas, não rastreadas, staged e conflitos', () => {
    expect(scope.tracked.map((item) => item.path)).toEqual([
      'a.ts',
      'b.ts',
      'd.ts',
    ]);
    expect(scope.untracked.map((item) => item.path)).toEqual(['c.ts']);
    expect(scope.staged.map((item) => item.path)).toEqual(['a.ts', 'd.ts']);
    expect(scope.conflicts.map((item) => item.path)).toEqual(['d.ts']);
  });
});

describe('regras de criar e alterar', () => {
  const clean = deriveCommitScope([file('a.ts', 'modified')]);
  const staged = deriveCommitScope([file('a.ts', 'modified', 'M')]);
  const onlyUntracked = deriveCommitScope([file('n.ts', 'untracked', '?')]);
  const conflict = deriveCommitScope([file('x.ts', 'conflicted', 'U')]);

  it('criar exige mensagem, algo rastreado e nenhum conflito', () => {
    const create = (message: string, scope = clean, busy = false) =>
      canCreateCommit({ message, busy, scope });

    expect(create('msg')).toBe(true);
    expect(create('   ')).toBe(false);
    expect(create('msg', onlyUntracked)).toBe(false);
    expect(create('msg', conflict)).toBe(false);
    expect(create('msg', clean, true)).toBe(false);
    expect(create('x'.repeat(501))).toBe(false);
  });

  it('amend exige staged ou uma mensagem realmente nova', () => {
    const amend = (message: string, scope = clean) =>
      canAmendCommit({ message, busy: false, scope, latest });

    expect(amend('')).toBe(false);
    expect(amend('feat: antigo')).toBe(false);
    expect(amend('feat: novo')).toBe(true);
    expect(amend('', staged)).toBe(true);
    expect(amend('feat: novo', conflict)).toBe(false);
    expect(
      canAmendCommit({
        message: 'x',
        busy: false,
        scope: staged,
        latest: undefined,
      }),
    ).toBe(false);
  });
});

describe('mensagem', () => {
  it('separa assunto e corpo e junta de volta', () => {
    expect(splitCommitMessage('assunto')).toEqual({
      subject: 'assunto',
      body: '',
    });
    expect(splitCommitMessage('assunto\n\ncorpo\nlinha 2')).toEqual({
      subject: 'assunto',
      body: 'corpo\nlinha 2',
    });
    expect(joinCommitMessage('assunto', '  ')).toBe('assunto');
    expect(joinCommitMessage('assunto', 'corpo')).toBe('assunto\n\ncorpo');
  });

  it('detecta e troca o prefixo convencional', () => {
    expect(activeCommitPrefix('fix(api): ajusta')).toBe('fix');
    expect(activeCommitPrefix('ajusta')).toBeNull();
    expect(applyCommitPrefix('fix(api): ajusta', 'feat')).toBe('feat: ajusta');
    expect(applyCommitPrefix('ajusta', 'docs')).toBe('docs: ajusta');
  });
});
