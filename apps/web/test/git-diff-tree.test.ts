import { describe, expect, it } from 'vitest';

import type { GitDiffFile } from '@dev-dashboard/contracts';

import {
  availableStatuses,
  filterDiffItems,
  groupDiffItems,
  neighborPath,
  nextUnreviewedPath,
  statusLetter,
} from '../src/utils/git-diff-tree';

const file = (
  path: string,
  status: GitDiffFile['status'] = 'modified',
): GitDiffFile => ({
  path,
  status,
  additions: 1,
  deletions: 0,
  binary: false,
});

const item = (
  path: string,
  status?: GitDiffFile['status'],
  viewed = false,
) => ({
  file: file(path, status),
  viewed,
});

describe('lista de arquivos do diff', () => {
  it('agrupa por pasta na ordem de aparição e usa ./ na raiz', () => {
    const groups = groupDiffItems([
      item('app/a.rb'),
      item('README.md'),
      item('app/b.rb'),
      item('spec/a_spec.rb'),
    ]);

    expect(groups.map((group) => group.directory)).toEqual([
      'app/',
      './',
      'spec/',
    ]);
    expect(groups[0]?.items.map((entry) => entry.file.path)).toEqual([
      'app/a.rb',
      'app/b.rb',
    ]);
  });

  it('filtra por busca e por status sem mudar a ordem', () => {
    const items = [
      item('app/a.rb'),
      item('app/novo.rb', 'added'),
      item('docs/b.md', 'deleted'),
    ];

    expect(
      filterDiffItems(items, { query: 'APP', status: 'all' }).map(
        (entry) => entry.file.path,
      ),
    ).toEqual(['app/a.rb', 'app/novo.rb']);
    expect(
      filterDiffItems(items, { query: '', status: 'deleted' }).map(
        (entry) => entry.file.path,
      ),
    ).toEqual(['docs/b.md']);
  });

  it('lista só os status presentes, na ordem dos chips, e mapeia as letras', () => {
    expect(
      availableStatuses([
        file('a', 'deleted'),
        file('b', 'type-changed'),
        file('c', 'modified'),
        file('d', 'copied'),
      ]),
    ).toEqual(['modified', 'deleted', 'copied', 'type-changed']);
    expect(statusLetter('untracked')).toBe('U');
    expect(statusLetter('conflicted')).toBe('!');
  });
});

describe('navegação e revisão', () => {
  const list = [
    { path: 'a', viewed: true },
    { path: 'b', viewed: false },
    { path: 'c', viewed: true },
    { path: 'd', viewed: false },
  ];

  it('o próximo não revisado segue para frente e depois volta ao início', () => {
    expect(nextUnreviewedPath(list, 'a')).toBe('b');
    expect(nextUnreviewedPath(list, 'b')).toBe('d');
    expect(nextUnreviewedPath(list, 'd')).toBe('b');
    expect(
      nextUnreviewedPath(
        list.map((entry) => ({ ...entry, viewed: true })),
        'a',
      ),
    ).toBeNull();
  });

  it('J e K andam entre os vizinhos sem dar a volta', () => {
    const paths = ['a', 'b', 'c'];

    expect(neighborPath(paths, null, 1)).toBe('a');
    expect(neighborPath(paths, null, -1)).toBe('c');
    expect(neighborPath(paths, 'b', 1)).toBe('c');
    expect(neighborPath(paths, 'c', 1)).toBe('c');
    expect(neighborPath(paths, 'a', -1)).toBe('a');
    expect(neighborPath([], 'a', 1)).toBeNull();
  });
});
