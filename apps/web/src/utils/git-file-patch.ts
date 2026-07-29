export interface GitPatchFile {
  oldPath: string;
  newPath: string;
  content: string;
}

function normalizePath(value: string): string {
  const trimmed = value.trim().replace(/^"|"$/g, '');
  if (!trimmed || trimmed === '/dev/null') return '';
  return trimmed.replace(/^[ab]\//, '');
}

function pathFromHeader(line: string, prefix: '--- ' | '+++ '): string {
  const raw = line.slice(prefix.length).split('\t')[0] ?? '';
  return normalizePath(raw);
}

export function splitGitPatchByFile(patch: string): GitPatchFile[] {
  const files: GitPatchFile[] = [];
  let current: string[] = [];
  let oldPath = '';
  let newPath = '';

  const flush = (): void => {
    if (current.length === 0) return;
    files.push({
      oldPath,
      newPath,
      content: current.join('\n'),
    });
    current = [];
    oldPath = '';
    newPath = '';
  };

  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      flush();
      const match = /^diff --git\s+"?a\/(.*?)"?\s+"?b\/(.*?)"?$/.exec(line);
      oldPath = normalizePath(match?.[1] ?? '');
      newPath = normalizePath(match?.[2] ?? '');
    }

    if (line.startsWith('--- ')) oldPath = pathFromHeader(line, '--- ') || oldPath;
    if (line.startsWith('+++ ')) newPath = pathFromHeader(line, '+++ ') || newPath;
    current.push(line);
  }

  flush();
  return files.filter((file) => file.oldPath || file.newPath || file.content.trim());
}

export function findGitPatchForFile(
  patch: string,
  filePath: string,
  previousPath = '',
): GitPatchFile | undefined {
  const normalizedPath = normalizePath(filePath);
  const normalizedPrevious = normalizePath(previousPath);

  return splitGitPatchByFile(patch).find((file) => {
    const candidates = [file.oldPath, file.newPath].filter(Boolean);
    return candidates.includes(normalizedPath)
      || Boolean(normalizedPrevious && candidates.includes(normalizedPrevious));
  });
}
