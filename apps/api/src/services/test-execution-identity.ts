import { createHash } from 'node:crypto';

import { runGit } from './git-service/run.js';

const IDENTITY_TIMEOUT_MS = 2_000;
const IDENTITY_MAX_BUFFER_BYTES = 2 * 1024 * 1024;
const MAX_UNTRACKED_FILES = 100;

export interface TestExecutionGitIdentity {
  gitRevision?: string;
  gitDirtyFingerprint?: string;
}

type GitRunner = (
  projectPath: string,
  args: readonly string[],
  options?: { timeoutMs?: number; maxBufferBytes?: number },
) => Promise<string>;

function untrackedPaths(status: string): string[] {
  return status
    .split('\0')
    .filter((entry) => entry.startsWith('?? '))
    .map((entry) => entry.slice(3))
    .filter(Boolean);
}

export async function captureTestExecutionGitIdentity(
  projectPath: string | undefined,
  gitRunner: GitRunner = runGit,
): Promise<TestExecutionGitIdentity> {
  if (!projectPath) return {};

  const options = {
    timeoutMs: IDENTITY_TIMEOUT_MS,
    maxBufferBytes: IDENTITY_MAX_BUFFER_BYTES,
  } as const;

  let revision: string;
  try {
    revision = (
      await gitRunner(projectPath, ['rev-parse', '--verify', 'HEAD'], options)
    ).trim();
  } catch {
    return {};
  }

  if (!revision) return {};

  try {
    const status = await gitRunner(
      projectPath,
      ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
      options,
    );

    if (!status) {
      return { gitRevision: revision, gitDirtyFingerprint: 'clean' };
    }

    const untracked = untrackedPaths(status);
    if (untracked.length > MAX_UNTRACKED_FILES) {
      // Sem fingerprint parcial: quando o conjunto é grande demais para
      // capturar com segurança, preservar só a revisão evita comparar estados
      // dirty como se fossem equivalentes.
      return { gitRevision: revision };
    }

    const diff = await gitRunner(
      projectPath,
      ['diff', '--binary', '--no-ext-diff', 'HEAD', '--'],
      options,
    );
    const untrackedHashes =
      untracked.length === 0
        ? ''
        : await gitRunner(
            projectPath,
            ['hash-object', '--', ...untracked],
            options,
          );

    const fingerprint = createHash('sha256')
      .update(status)
      .update('\0')
      .update(diff)
      .update('\0')
      .update(untrackedHashes)
      .digest('hex');

    return {
      gitRevision: revision,
      gitDirtyFingerprint: fingerprint,
    };
  } catch {
    // A revisão ainda é útil, mas sem fingerprint não há evidência suficiente
    // para considerar dois working trees dirty como comparáveis.
    return { gitRevision: revision };
  }
}
