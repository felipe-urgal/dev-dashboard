import type {
  DeploymentChangeCommit,
  DeploymentPendingChanges,
} from '@dev-dashboard/contracts';

import { runGit } from '../services/shared/run-git.js';

const FIELD = '\u001f';
const RECORD = '\u001e';
const COMMIT_FORMAT = ['%H', '%h', '%s', '%an', '%aI'].join(FIELD) + RECORD;
const MAX_COMMITS = 30;
const MAX_REVISIONS = 30;
const REVISION_PATTERN = /^[0-9a-f]{7,40}$/;
const BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/;
const MIGRATION_PATH =
  /(^|\/)(db\/migrate|migrations|prisma\/migrations|drizzle)\//;

export function isRevision(value: string): boolean {
  return REVISION_PATTERN.test(value);
}

function parseCommits(output: string): DeploymentChangeCommit[] {
  return output
    .split(RECORD)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [
        hash = '',
        shortHash = '',
        subject = '',
        authorName = '',
        at = '',
      ] = record.split(FIELD);
      return { hash, shortHash, subject, authorName, authoredAt: at };
    });
}

async function git(
  projectPath: string,
  args: readonly string[],
): Promise<string | null> {
  try {
    return await runGit(projectPath, args, { timeoutMs: 15_000 });
  } catch {
    return null;
  }
}

/** Lê do Git local o que um deployment mudaria; nunca altera nada. */
export class DeploymentChangesService {
  public async pending(
    projectPath: string,
    branch: string,
    from: string,
  ): Promise<DeploymentPendingChanges> {
    const empty = {
      branch,
      from,
      total: 0,
      commits: [],
      files: 0,
      migrations: 0,
    };
    if (!BRANCH_PATTERN.test(branch) || branch.startsWith('-')) {
      return { state: 'unknown', reason: 'branch-not-found', ...empty };
    }

    const target =
      (await git(projectPath, [
        'rev-parse',
        '--verify',
        '--quiet',
        `refs/remotes/origin/${branch}^{commit}`,
      ])) ??
      (await git(projectPath, [
        'rev-parse',
        '--verify',
        '--quiet',
        `refs/heads/${branch}^{commit}`,
      ]));
    if (!target) {
      return { state: 'unknown', reason: 'branch-not-found', ...empty };
    }

    const fromCommit = isRevision(from)
      ? await git(projectPath, [
          'rev-parse',
          '--verify',
          '--quiet',
          `${from}^{commit}`,
        ])
      : null;
    if (!fromCommit) {
      return { state: 'unknown', reason: 'revision-not-found', ...empty };
    }

    const range = `${fromCommit.trim()}..${target.trim()}`;
    const [count, log, names] = await Promise.all([
      git(projectPath, ['rev-list', '--count', range]),
      git(projectPath, [
        'log',
        `--max-count=${MAX_COMMITS}`,
        `--format=${COMMIT_FORMAT}`,
        range,
      ]),
      git(projectPath, ['diff', '--name-only', range]),
    ]);

    const paths = (names ?? '').split('\n').filter(Boolean);
    return {
      state: 'available',
      branch,
      from,
      total: Number.parseInt(count ?? '0', 10) || 0,
      commits: parseCommits(log ?? ''),
      files: paths.length,
      migrations: paths.filter((file) => MIGRATION_PATH.test(file)).length,
    };
  }

  /** Mensagens dos commits do histórico (revisões fora do clone são omitidas). */
  public async commits(
    projectPath: string,
    revisions: readonly string[],
  ): Promise<DeploymentChangeCommit[]> {
    const unique = [...new Set(revisions.filter(isRevision))].slice(
      0,
      MAX_REVISIONS,
    );
    const found = await Promise.all(
      unique.map(async (revision) => {
        const output = await git(projectPath, [
          'show',
          '-s',
          `--format=${COMMIT_FORMAT}`,
          revision,
        ]);
        return output ? parseCommits(output)[0] : undefined;
      }),
    );
    return found.filter(
      (commit): commit is DeploymentChangeCommit => commit !== undefined,
    );
  }
}
