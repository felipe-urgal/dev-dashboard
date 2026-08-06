import { highlightGenericLine } from './generic-line';
import { renderText, renderToken } from './render-text';

export function highlightMarkdownLine(line: string, query: string): string {
  const heading = line.match(/^(\s*)(#{1,6})(\s+)(.*)$/);
  if (heading) {
    return (
      renderText(heading[1] ?? '', query) +
      renderToken('keyword', heading[2] ?? '', query) +
      renderText(heading[3] ?? '', query) +
      renderToken('type', heading[4] ?? '', query)
    );
  }
  if (/^\s*>/.test(line)) return renderToken('comment', line, query);
  return highlightGenericLine(line, 'generic', query);
}
