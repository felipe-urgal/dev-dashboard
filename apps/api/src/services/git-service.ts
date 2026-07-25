import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitCommit, GitFileChange, GitFileStatus, ProjectGitOverview } from '@dev-dashboard/contracts';
const execFileAsync = promisify(execFile);
const LOG_SEPARATOR = '\u001f';
const RECORD_SEPARATOR = '\u001e';
async function runGit(projectPath: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', [...args], { cwd: projectPath, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' } });
  return result.stdout;
}
function statusFromCode(code: string): GitFileStatus {
  if (code.includes('U') || code === 'AA' || code === 'DD') return 'conflicted';
  if (code.includes('R')) return 'renamed';
  if (code.includes('C')) return 'copied';
  if (code.includes('A')) return 'added';
  if (code.includes('D')) return 'deleted';
  if (code.includes('T')) return 'type-changed';
  return 'modified';
}
function parseStatus(output: string) {
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
function parseCommits(output: string): GitCommit[] {
  return output.split(RECORD_SEPARATOR).map((item) => item.trim()).filter(Boolean).map((record) => {
    const [hash = '', shortHash = '', subject = '', authorName = '', authorEmail = '', authoredAt = ''] = record.split(LOG_SEPARATOR);
    return { hash, shortHash, subject, authorName, authorEmail, authoredAt };
  });
}
export class GitService {
  public async getOverview(projectPath: string): Promise<ProjectGitOverview> {
    try { await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']); } catch { return { repository: false, detached: false, ahead: 0, behind: 0, clean: true, files: [], recentCommits: [] }; }
    const status = parseStatus(await runGit(projectPath, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']));
    let commits: GitCommit[] = [];
    try { commits = parseCommits(await runGit(projectPath, ['log', '-n', '20', `--format=%H${LOG_SEPARATOR}%h${LOG_SEPARATOR}%s${LOG_SEPARATOR}%an${LOG_SEPARATOR}%ae${LOG_SEPARATOR}%aI${RECORD_SEPARATOR}`])); } catch { /* repositório sem commits */ }
    return { repository: true, ...(status.branch ? { branch: status.branch } : {}), detached: status.detached, ...(status.upstream ? { upstream: status.upstream } : {}), ahead: status.ahead, behind: status.behind, clean: status.files.length === 0, files: status.files, ...(commits[0] ? { latestCommit: commits[0] } : {}), recentCommits: commits };
  }
}
