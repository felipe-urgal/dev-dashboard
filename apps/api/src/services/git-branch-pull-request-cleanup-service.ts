import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  detectProvider,
  parseRemoteUrl,
} from './git-pull-request/remote-parsing.js';
import { runGit as sharedRunGit } from './shared/run-git.js';

const execFileAsync = promisify(execFile);

export type RunGhImpl = (
  cwd: string,
  args: readonly string[],
) => Promise<string>;

async function defaultRunGh(
  cwd: string,
  args: readonly string[],
): Promise<string> {
  const result = await execFileAsync('gh', [...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, LC_ALL: 'C' },
  });
  return result.stdout.trim();
}

async function remoteUrl(
  projectPath: string,
  remote: string,
): Promise<string | null> {
  try {
    return (
      await sharedRunGit(projectPath, ['remote', 'get-url', remote])
    ).trim();
  } catch {
    return null;
  }
}

function parsePullRequestNumbers(output: string): number[] {
  const payload = JSON.parse(output) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error('Resposta inválida ao consultar Pull Requests.');
  }

  return payload.map((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      !('number' in item) ||
      typeof (item as { number?: unknown }).number !== 'number'
    ) {
      throw new Error('Resposta inválida ao consultar Pull Requests.');
    }
    return (item as { number: number }).number;
  });
}

export class GitBranchPullRequestCleanupService {
  public constructor(private readonly runGhImpl: RunGhImpl = defaultRunGh) {}

  public async closeOpenForBranch(
    projectPath: string,
    branch: string,
  ): Promise<void> {
    const originUrl = await remoteUrl(projectPath, 'origin');
    const origin = originUrl ? parseRemoteUrl(originUrl) : null;
    if (!origin || detectProvider(origin.host) !== 'github') return;

    const sourceOwner = origin.ownerRepo.split('/')[0];
    if (!sourceOwner) return;

    const targetRepositories = new Set<string>([origin.ownerRepo]);
    const upstreamUrl = await remoteUrl(projectPath, 'upstream');
    const upstream = upstreamUrl ? parseRemoteUrl(upstreamUrl) : null;
    if (upstream && detectProvider(upstream.host) === 'github') {
      targetRepositories.add(upstream.ownerRepo);
    }

    try {
      for (const repository of targetRepositories) {
        const output = await this.runGhImpl(projectPath, [
          'pr',
          'list',
          '--repo',
          repository,
          '--state',
          'open',
          '--head',
          `${sourceOwner}:${branch}`,
          '--json',
          'number',
          '--limit',
          '100',
        ]);

        for (const number of parsePullRequestNumbers(output)) {
          await this.runGhImpl(projectPath, [
            'pr',
            'close',
            String(number),
            '--repo',
            repository,
          ]);
        }
      }
    } catch {
      throw new Error(
        'Não foi possível verificar ou fechar a Pull Request aberta desta branch.',
      );
    }
  }
}
