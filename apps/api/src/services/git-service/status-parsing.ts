import type { GitCommit, GitFileChange, GitFileStatus } from '@dev-dashboard/contracts';

import { LOG_SEPARATOR, RECORD_SEPARATOR } from './constants.js';

export function statusFromCode(code: string): GitFileStatus {
  if (code.includes('U') || code === 'AA' || code === 'DD') return 'conflicted';
  if (code.includes('R')) return 'renamed';
  if (code.includes('C')) return 'copied';
  if (code.includes('A')) return 'added';
  if (code.includes('D')) return 'deleted';
  if (code.includes('T')) return 'type-changed';
  return 'modified';
}

export function parseStatus(output: string) {
  let branch: string | undefined; let detached = false; let upstream: string | undefined; let ahead = 0; let behind = 0;
  const files: GitFileChange[] = [];
  const records = output.split('\0').filter(Boolean);
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]!;
    if (record.startsWith('# branch.head ')) { const value = record.slice(14); detached = value === '(detached)'; if (!detached && value !== '(initial)') branch = value; continue; }
    if (record.startsWith('# branch.upstream ')) { upstream = record.slice(18); continue; }
    if (record.startsWith('# branch.ab ')) { const match = /\+(\d+)\s+-(\d+)/.exec(record); if (match) { ahead = Number(match[1]); behind = Number(match[2]); } continue; }
    if (record.startsWith('? ')) { files.push({ path: record.slice(2), indexStatus: '?', worktreeStatus: '?', status: 'untracked' }); continue; }
    if (record.startsWith('! ')) continue;
    if (record.startsWith('1 ')) { const parts = record.split(' '); const code = parts[1] ?? '..'; files.push({ path: parts.slice(8).join(' '), indexStatus: code[0] ?? '.', worktreeStatus: code[1] ?? '.', status: statusFromCode(code) }); continue; }
    if (record.startsWith('2 ')) { const parts = record.split(' '); const code = parts[1] ?? '..'; const currentPath = parts.slice(9).join(' '); const previousPath = records[index + 1]; if (previousPath) index += 1; files.push({ path: currentPath, ...(previousPath ? { previousPath } : {}), indexStatus: code[0] ?? '.', worktreeStatus: code[1] ?? '.', status: statusFromCode(code) }); continue; }
    if (record.startsWith('u ')) { const parts = record.split(' '); const code = parts[1] ?? 'UU'; files.push({ path: parts.slice(10).join(' '), indexStatus: code[0] ?? 'U', worktreeStatus: code[1] ?? 'U', status: 'conflicted' }); }
  }
  return { branch, detached, upstream, ahead, behind, files };
}

export function parseCommits(output: string): GitCommit[] {
  return output.split(RECORD_SEPARATOR).map((item) => item.trim()).filter(Boolean).map((record) => {
    const [hash = '', shortHash = '', subject = '', authorName = '', authorEmail = '', authoredAt = ''] = record.split(LOG_SEPARATOR);
    return { hash, shortHash, subject, authorName, authorEmail, authoredAt };
  });
}
