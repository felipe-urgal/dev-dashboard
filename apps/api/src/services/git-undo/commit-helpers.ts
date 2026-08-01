import { FIELD_SEPARATOR } from './constants.js';
import { GitUndoError } from './errors.js';
import { runGit } from './run.js';
import type { CommitSummary } from './types.js';

function parseCommit(value: string): CommitSummary {
  const [hash = '', shortHash = '', subject = ''] = value.trim().split(FIELD_SEPARATOR);
  return { hash, shortHash, subject };
}

export async function headCommit(projectPath: string): Promise<CommitSummary> {
  try {
    return parseCommit(await runGit(
      projectPath,
      ['log', '-1', `--format=%H${FIELD_SEPARATOR}%h${FIELD_SEPARATOR}%s`],
    ));
  } catch {
    throw new GitUndoError('GIT_COMMIT_FAILED', 'O repositório ainda não possui commit para desfazer.');
  }
}
