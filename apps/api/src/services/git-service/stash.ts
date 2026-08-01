import type { GitStashEntry } from '@dev-dashboard/contracts';

import { LOG_SEPARATOR } from './constants.js';
import { runGit } from './run.js';

export async function listStashEntries(projectPath: string): Promise<GitStashEntry[]> {
  let output = '';
  try {
    output = await runGit(projectPath, ['stash', 'list', `--format=%gd${LOG_SEPARATOR}%s${LOG_SEPARATOR}%cI`]);
  } catch {
    return [];
  }
  return output.split('\n').filter(Boolean).map((line) => {
    const [ref = '', message = '', date = ''] = line.split(LOG_SEPARATOR);
    const match = /stash@\{(\d+)\}/.exec(ref);
    return { index: match?.[1] ? Number(match[1]) : 0, message, createdAt: date };
  });
}
