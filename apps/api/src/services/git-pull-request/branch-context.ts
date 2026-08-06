import { GitPullRequestError } from './errors.js';
import { optionalGit, runGit } from './run.js';

export async function requireRepository(projectPath: string): Promise<void> {
  try {
    await runGit(projectPath, ['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new GitPullRequestError(
      'GIT_NOT_REPOSITORY',
      'O projeto não é um repositório Git.',
    );
  }
}

export async function currentBranch(projectPath: string): Promise<string> {
  const branch = await runGit(projectPath, ['branch', '--show-current']);
  if (!branch) {
    throw new GitPullRequestError(
      'GIT_DETACHED_HEAD',
      'Não é possível compor a URL da Pull Request em um HEAD destacado.',
    );
  }
  return branch;
}

export async function publishedReference(
  projectPath: string,
  branch: string,
): Promise<string> {
  try {
    return await runGit(projectPath, [
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{u}',
    ]);
  } catch {
    throw new GitPullRequestError(
      'GIT_PULL_REQUEST_NOT_PUBLISHED',
      `A branch "${branch}" ainda não foi publicada em um remoto. Publique-a antes de abrir a Pull Request.`,
    );
  }
}

export async function remoteUrl(
  projectPath: string,
  remote: string,
): Promise<string> {
  try {
    return await runGit(projectPath, ['remote', 'get-url', remote]);
  } catch {
    throw new GitPullRequestError(
      'GIT_REMOTE_NOT_CONFIGURED',
      `Nenhum remoto "${remote}" configurado para este projeto.`,
    );
  }
}

export async function defaultBranch(
  projectPath: string,
  remote: string,
): Promise<string> {
  try {
    const ref = await runGit(projectPath, [
      'symbolic-ref',
      '--quiet',
      '--short',
      `refs/remotes/${remote}/HEAD`,
    ]);
    if (ref) return ref.replace(new RegExp(`^${remote}/`), '');
  } catch {
    // Ausência de refs/remotes/<remote>/HEAD é comum; cai nos fallbacks.
  }

  for (const candidate of ['main', 'master', 'develop']) {
    const remoteRef = await optionalGit(projectPath, [
      'show-ref',
      '--verify',
      '--quiet',
      `refs/remotes/${remote}/${candidate}`,
    ]);
    if (remoteRef !== null) return candidate;

    const localRef = await optionalGit(projectPath, [
      'show-ref',
      '--verify',
      '--quiet',
      `refs/heads/${candidate}`,
    ]);
    if (localRef !== null) return candidate;
  }
  return 'main';
}

export async function requireBaseBranch(
  projectPath: string,
  remote: string,
  branch: string,
): Promise<void> {
  const remoteRef = await optionalGit(projectPath, [
    'show-ref',
    '--verify',
    '--quiet',
    `refs/remotes/${remote}/${branch}`,
  ]);
  if (remoteRef !== null) return;

  if (remote === 'origin') {
    const localRef = await optionalGit(projectPath, [
      'show-ref',
      '--verify',
      '--quiet',
      `refs/heads/${branch}`,
    ]);
    if (localRef !== null) return;
  }

  throw new GitPullRequestError(
    'GIT_PULL_REQUEST_BASE_NOT_FOUND',
    `A branch base "${remote}/${branch}" não foi encontrada. Atualize os remotos e tente novamente.`,
  );
}
