import { highlightGenericLine } from './generic-line';
import { gitSyntaxLanguageForPath } from './language-map';
import { highlightMarkdownLine } from './markdown';
import { highlightMarkupLine } from './markup';

function highlightLine(text: string, language: ReturnType<typeof gitSyntaxLanguageForPath>, query: string): string {
  if (language === 'html') return highlightMarkupLine(text, query);
  if (language === 'vue') {
    return /<\/?[A-Za-z]|<%/.test(text)
      ? highlightMarkupLine(text, query)
      : highlightGenericLine(text, 'typescript', query);
  }
  if (language === 'markdown') return highlightMarkdownLine(text, query);
  return highlightGenericLine(text, language, query);
}

export function highlightGitDiffCode(
  text: string,
  filePath: string,
  query = '',
): string {
  const language = gitSyntaxLanguageForPath(filePath);
  return text
    .split(/(\r\n|\n|\r)/)
    .map((part, index) => (index % 2 === 0 ? highlightLine(part, language, query) : part))
    .join('');
}
