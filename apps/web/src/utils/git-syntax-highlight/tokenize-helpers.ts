import type { GitSyntaxLanguage } from './types';

export function commentMarker(language: GitSyntaxLanguage, line: string, cursor: number): string | null {
  const rest = line.slice(cursor);
  if (language === 'ruby' || language === 'python' || language === 'shell' || language === 'yaml') {
    return rest.startsWith('#') ? '#' : null;
  }
  if (language === 'sql') {
    if (rest.startsWith('--')) return '--';
    if (rest.startsWith('/*')) return '/*';
    return null;
  }
  if (language === 'css') return rest.startsWith('/*') ? '/*' : null;
  if (['generic', 'java', 'javascript', 'php', 'rust', 'typescript', 'vue'].includes(language)) {
    if (rest.startsWith('//')) return '//';
    if (rest.startsWith('/*')) return '/*';
  }
  return null;
}

export function quotedEnd(line: string, cursor: number): number {
  const quote = line[cursor];
  let index = cursor + 1;
  while (index < line.length) {
    if (line[index] === '\\') {
      index += 2;
      continue;
    }
    if (line[index] === quote) return index + 1;
    index += 1;
  }
  return line.length;
}

export function nextNonWhitespace(line: string, cursor: number): string {
  return line.slice(cursor).match(/^\s*(::|=>|===|!==|==|!=|<=|>=|&&|\|\||.)/)?.[1] ?? '';
}
