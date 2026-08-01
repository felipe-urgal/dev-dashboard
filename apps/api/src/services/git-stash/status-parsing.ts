import type { GitFileStatus, GitStashFile } from '@dev-dashboard/contracts';

export interface ParsedFileStatus {
  status: GitFileStatus;
  previousPath?: string;
}

function statusFromCode(code: string): GitFileStatus {
  const normalized = code[0]?.toUpperCase() ?? 'M';
  if (normalized === 'A') return 'added';
  if (normalized === 'D') return 'deleted';
  if (normalized === 'R') return 'renamed';
  if (normalized === 'C') return 'copied';
  if (normalized === 'T') return 'type-changed';
  return 'modified';
}

export function parseNameStatus(output: string): Map<string, ParsedFileStatus> {
  const statuses = new Map<string, ParsedFileStatus>();
  const records = output.split('\0').filter(Boolean);

  for (let index = 0; index < records.length;) {
    const code = records[index++] ?? '';
    const status = statusFromCode(code);
    if (status === 'renamed' || status === 'copied') {
      const previousPath = records[index++] ?? '';
      const currentPath = records[index++] ?? '';
      if (currentPath) statuses.set(currentPath, { status, previousPath });
      continue;
    }
    const filePath = records[index++] ?? '';
    if (filePath) statuses.set(filePath, { status });
  }

  return statuses;
}

export function parseNumstat(
  output: string,
  statuses: Map<string, ParsedFileStatus>,
): GitStashFile[] {
  const files: GitStashFile[] = [];
  const records = output.split('\0');
  let index = 0;

  while (index < records.length) {
    const record = records[index++];
    if (!record) continue;
    const fields = record.split('\t');
    const additionsRaw = fields[0] ?? '0';
    const deletionsRaw = fields[1] ?? '0';
    let filePath = fields.slice(2).join('\t');
    let previousPath: string | undefined;

    if (!filePath) {
      previousPath = records[index++] ?? '';
      filePath = records[index++] ?? '';
      if (!filePath) continue;
    }

    const status = statuses.get(filePath);
    const binary = additionsRaw === '-' || deletionsRaw === '-';
    files.push({
      path: filePath,
      ...(status?.previousPath || previousPath
        ? { previousPath: status?.previousPath || previousPath }
        : {}),
      status: status?.status ?? (previousPath ? 'renamed' : 'modified'),
      additions: binary ? 0 : Number.parseInt(additionsRaw, 10) || 0,
      deletions: binary ? 0 : Number.parseInt(deletionsRaw, 10) || 0,
      binary,
    });
  }

  return files;
}
