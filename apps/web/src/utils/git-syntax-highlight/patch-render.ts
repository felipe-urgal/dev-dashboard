import { highlightGitDiffCode } from './highlight';
import { renderText } from './render-text';

function pathFromDiffHeader(line: string): string | null {
  const header = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
  if (header?.[2]) return header[2];
  const target = line.match(/^\+\+\+ b\/(.+)$/);
  return target?.[1] ?? null;
}

export function highlightGitPatch(patch: string, query = ''): string {
  let filePath = '';
  return patch
    .split('\n')
    .map((line) => {
      filePath = pathFromDiffHeader(line) ?? filePath;
      let kind = 'meta';
      let prefix = '';
      let body = line;

      if (line.startsWith('@@')) kind = 'hunk';
      else if (line.startsWith('+') && !line.startsWith('+++')) {
        kind = 'addition';
        prefix = '+';
        body = line.slice(1);
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        kind = 'deletion';
        prefix = '−';
        body = line.slice(1);
      } else if (line.startsWith(' ')) {
        kind = 'context';
        prefix = ' ';
        body = line.slice(1);
      } else if (line.startsWith('\\ No newline')) {
        kind = 'notice';
      }

      const code =
        kind === 'addition' || kind === 'deletion' || kind === 'context'
          ? highlightGitDiffCode(body, filePath, query)
          : renderText(body, query);
      return `<span class="git-syntax-patch-line is-${kind}"><span class="git-syntax-patch-prefix">${renderText(prefix, query)}</span><span class="git-syntax-patch-code">${code}</span></span>`;
    })
    .join('\n');
}
