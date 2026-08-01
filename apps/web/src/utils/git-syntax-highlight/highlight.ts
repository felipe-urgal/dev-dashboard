import { highlightGenericLine } from './generic-line';
import { gitSyntaxLanguageForPath } from './language-map';
import { highlightMarkdownLine } from './markdown';
import { highlightMarkupLine } from './markup';

export function highlightGitDiffCode(
  text: string,
  filePath: string,
  query = '',
): string {
  const language = gitSyntaxLanguageForPath(filePath);
  if (language === 'html') return highlightMarkupLine(text, query);
  if (language === 'vue') {
    return /<\/?[A-Za-z]|<%/.test(text)
      ? highlightMarkupLine(text, query)
      : highlightGenericLine(text, 'typescript', query);
  }
  if (language === 'markdown') return highlightMarkdownLine(text, query);
  return highlightGenericLine(text, language, query);
}
