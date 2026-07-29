import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  GitBranch,
  GitRemote,
  GitTrackingComparison,
  ProjectGitWorkspace,
} from '@dev-dashboard/contracts';

const execFileAsync = promisify(execFile);
const FIELD_SEPARATOR = '\u001f';

async function runGit(projectPath: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync('git', [...args], {
    cwd: projectPath,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_OPTIONAL_LOCKS: '0',
      LC_ALL: 'C',
    },
  });

  return result.stdout.trim();
}

function sanitizeRemoteUrl(value: string): string {
  const trimmed = value.trim();

  if (!/^https?:\/\//i.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return trimmed.replace(/^(https?:\/\/)[^/@]+@/i, '$1');
  }
}

function remoteRole(name: string): GitRemote['role'] {
  if (name === 'origin') return 'origin';
  if (name === 'upstream') return 'upstream';
  return 'other';
}

async function listRemotes(projectPath: string): Promise<GitRemote[]> {
  let names: string[] = [];

  try {
    names = (await runGit(projectPath, ['remote']))
      .split('\n')
      .map((name) => name.trim())
      .filter(Boolean);
  } catch {
    return [];
  }

  const remotes = await Promise.all(names.map(async (name): Promise<GitRemote> => {
    let fetchUrl = '';
    let pushUrl = '';

    try {
      fetchUrl = sanitizeRemoteUrl(await runGit(projectPath, ['remote', 'get-url', name]));
    } catch {
      // Um remote incompleto continua visível com URL vazia.
    }

    try {
      pushUrl = sanitizeRemoteUrl(await runGit(projectPath, ['remote', 'get-url', '--push', name]));
    } catch {
      pushUrl = fetchUrl;
    }

    return {
      name,
      fetchUrl,
      pushUrl,
      role: remoteRole(name),
    };
  }));

  return remotes.sort((left, right) => {
    const rank = (remote: GitRemote): number => {
      if (remote.role === 'origin') return 0;
      if (remote.role === 'upstream') return 1;
      return 2;
    };

    return rank(left) - rank(right) || left.name.localeCompare(right.name);
  });
}

async function listBranches(projectPath: string): Promise<GitBranch[]> {
  let output = '';

  try {
    output = await runGit(projectPath, [
      'for-each-ref',
      `--format=%(refname)${FIELD_SEPARATOR}%(refname:short)${FIELD_SEPARATOR}%(upstream:short)${FIELD_SEPARATOR}%(HEAD)`,
      'refs/heads',
      'refs/remotes',
    ]);
  } catch {
    return [];
  }

  const branches = output
    .split('\n')
    .map((line): GitBranch | null => {
      const [refName = '', shortRef = '', upstream = '', head = ''] = line.split(FIELD_SEPARATOR);
      if (!refName || !shortRef || refName.endsWith('/HEAD')) return null;

      if (refName.startsWith('refs/heads/')) {
        return {
          name: shortRef,
          shortName: shortRef,
          kind: 'local',
          current: head.trim() === '*',
          ...(upstream ? { upstream } : {}),
        };
      }

      if (!refName.startsWith('refs/remotes/')) return null;

      const separatorIndex = shortRef.indexOf('/');
      const remote = separatorIndex >= 0 ? shortRef.slice(0, separatorIndex) : '';
      const shortName = separatorIndex >= 0 ? shortRef.slice(separatorIndex + 1) : shortRef;

      return {
        name: shortRef,
        shortName,
        kind: 'remote',
        current: false,
        ...(remote ? { remote } : {}),
      };
    })
    .filter((branch): branch is GitBranch => branch !== null);

  return branches.sort((left, right) => {
    if (left.current !== right.current) return left.current ? -1 : 1;
    if (left.kind !== right.kind) return left.kind === 'local' ? -1 : 1;
    if (left.remote !== right.remote) return (left.remote ?? '').localeCompare(right.remote ?? '');
    return left.name.localeCompare(right.name);
  });
}

async function compareWithReference(
  projectPath: string,
  reference: string | undefined,
): Promise<GitTrackingComparison | undefined> {
  if (!reference) return undefined;

  try {
    await runGit(projectPath, ['rev-parse', '--verify', '--quiet', reference]);
    const output = await runGit(projectPath, [
      'rev-list',
      '--left-right',
      '--count',
      `HEAD...${reference}`,
    ]);
    const [aheadRaw = '0', behindRaw = '0'] = output.split(/\s+/);

    return {
      reference,
      ahead: Number.parseInt(aheadRaw, 10) || 0,
      behind: Number.parseInt(behindRaw, 10) || 0,
    };
  } catch {
    return undefined;
  }
}

async function currentBranch(projectPath: string): Promise<string | undefined> {
  try {
    return (await runGit(projectPath, ['branch', '--show-current'])) || undefined;
  } catch {
    return undefined;
  }
}

async function configuredUpstream(projectPath: string): Promise<string | undefined> {
  try {
    return (await runGit(projectPath, [
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{upstream}',
    ])) || undefined;
  } catch {
    return undefined;
  }
}

async function defaultRemoteBranch(
  projectPath: string,
  remote: string,
  branches: readonly GitBranch[],
): Promise<string | undefined> {
  try {
    const symbolic = await runGit(projectPath, [
      'symbolic-ref',
      '--quiet',
      '--short',
      `refs/remotes/${remote}/HEAD`,
    ]);
    if (symbolic) return symbolic;
  } catch {
    // O fallback abaixo cobre remotos sem HEAD simbólico local.
  }

  for (const candidate of [`${remote}/main`, `${remote}/master`]) {
    if (branches.some((branch) => branch.name === candidate)) return candidate;
  }

  return undefined;
}

export class GitWorkspaceService {
  public async inspect(projectPath: string): Promise<ProjectGitWorkspace> {
    try {
      await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
    } catch {
      return {
        branches: [],
        remotes: [],
      };
    }

    const [branches, remotes, branch, tracking] = await Promise.all([
      listBranches(projectPath),
      listRemotes(projectPath),
      currentBranch(projectPath),
      configuredUpstream(projectPath),
    ]);

    const originReference = tracking?.startsWith('origin/')
      ? tracking
      : branch && branches.some((item) => item.name === `origin/${branch}`)
        ? `origin/${branch}`
        : undefined;

    const hasUpstreamRemote = remotes.some((remote) => remote.name === 'upstream');
    const upstreamReference = hasUpstreamRemote
      ? await defaultRemoteBranch(projectPath, 'upstream', branches)
      : undefined;

    const [originComparison, upstreamComparison] = await Promise.all([
      compareWithReference(projectPath, originReference),
      compareWithReference(projectPath, upstreamReference),
    ]);

    return {
      branches,
      remotes,
      ...(originComparison ? { originComparison } : {}),
      ...(upstreamComparison ? { upstreamComparison } : {}),
    };
  }
}
