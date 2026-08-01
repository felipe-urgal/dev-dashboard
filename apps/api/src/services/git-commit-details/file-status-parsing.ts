import type { GitCommitDetailFile, GitCommitFileStatus } from './types.js';

function statusFromCode(code: string): GitCommitFileStatus {
  const normalized = code[0]?.toUpperCase() ?? 'M';
  if (normalized === 'A') return 'added';
  if (normalized === 'D') return 'deleted';
  if (normalized === 'R') return 'renamed';
  if (normalized === 'C') return 'copied';
  if (normalized === 'T') return 'type-changed';
  return 'modified';
}

export function parseNameStatus(output: string): Map<string, {
  status: GitCommitFileStatus;
  previousPath?: string;
}> {
  const result = new Map<string, {
    status: GitCommitFileStatus;
    previousPath?: string;
  }>();
  const records = output.split('\0').filter(Boolean);

  for (let index = 0; index < records.length; index += 1) {
    const code = records[index] ?? '';
    const status = statusFromCode(code);
    if (status === 'renamed' || status === 'copied') {
      const previousPath = records[index + 1] ?? '';
      const currentPath = records[index + 2] ?? '';
      index += 2;
      if (currentPath) result.set(currentPath, { status, previousPath });
      continue;
    }

    const filePath = records[index + 1] ?? '';
    index += 1;
    if (filePath) result.set(filePath, { status });
  }

  return result;
}

export function parseNumstat(
  output: string,
  statuses: Map<string, { status: GitCommitFileStatus; previousPath?: string }>,
): GitCommitDetailFile[] {
  const files: GitCommitDetailFile[] = [];
  const records = output.split('\0');
  let index = 0;

  while (index < records.length) {
    const record = records[index];
    index += 1;
    if (!record) continue;

    const [additionsRaw = '0', deletionsRaw = '0', ...pathParts] = record.split('\t');
    let filePath = pathParts.join('\t');
    let previousPath: string | undefined;

    // Em renomeações o `-z` quebra o registro em três: contagens, caminho
    // anterior e caminho novo. Sem consumir os dois seguintes, o arquivo
    // renomeado desaparecia da lista.
    if (!filePath) {
      previousPath = records[index] ?? '';
      index += 1;
      filePath = records[index] ?? '';
      index += 1;
      if (!filePath) continue;
    }

    const binary = additionsRaw === '-' || deletionsRaw === '-';
    const status = statuses.get(filePath);
    const effectivePreviousPath = status?.previousPath ?? previousPath;
    files.push({
      path: filePath,
      ...(effectivePreviousPath ? { previousPath: effectivePreviousPath } : {}),
      status: status?.status ?? (previousPath ? 'renamed' : 'modified'),
      additions: binary ? 0 : Number.parseInt(additionsRaw, 10) || 0,
      deletions: binary ? 0 : Number.parseInt(deletionsRaw, 10) || 0,
      binary,
    });
  }

  return files;
}
