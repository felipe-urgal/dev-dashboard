export type CommandPaletteMode = 'all' | 'action' | 'page' | 'project';

export interface ParsedPaletteQuery {
  mode: CommandPaletteMode;
  value: string;
  project?: string;
}

export function normalizePaletteText(value: string): string {
  return value
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function parsePaletteQuery(query: string): ParsedPaletteQuery {
  const value = query.trimStart();
  const prefix = value[0];
  if (prefix === '@') {
    const projectAndAction = value.slice(1);
    const actionSeparator = projectAndAction.indexOf('>');
    if (actionSeparator >= 0) {
      return {
        mode: 'action',
        project: normalizePaletteText(projectAndAction.slice(0, actionSeparator)),
        value: normalizePaletteText(projectAndAction.slice(actionSeparator + 1)),
      };
    }
    return { mode: 'project', value: normalizePaletteText(projectAndAction) };
  }
  const mode: CommandPaletteMode = prefix === '>'
    ? 'action'
    : prefix === '/'
      ? 'page'
      : 'all';

  return {
    mode,
    value: normalizePaletteText(mode === 'all' ? value : value.slice(1)),
  };
}

export function paletteFuzzyScore(searchText: string, query: string): number {
  const haystack = normalizePaletteText(searchText);
  const needle = normalizePaletteText(query);
  if (!needle) return 0;

  const exactIndex = haystack.indexOf(needle);
  if (exactIndex >= 0) return 1_000 - exactIndex;

  let score = 0;
  let cursor = 0;
  let previousMatch = -2;
  for (const character of needle) {
    const match = haystack.indexOf(character, cursor);
    if (match < 0) return -1;
    score += match === previousMatch + 1 ? 12 : 3;
    if (match === 0 || /[\s/._-]/.test(haystack[match - 1] ?? '')) score += 8;
    previousMatch = match;
    cursor = match + 1;
  }

  return score - Math.max(0, haystack.length - needle.length) / 100;
}
