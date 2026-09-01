import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';

export const PROJECT_LOCAL_ENV_MAX_BYTES = 64 * 1024;

export type ProjectLocalEnvironmentKind = 'check' | 'production';

const PROJECT_LOCAL_ENV_PATH = {
  check: path.join('.dev-dashboard', '.env.check.local'),
  production: path.join('.dev-dashboard', '.env.production.local'),
} as const satisfies Record<ProjectLocalEnvironmentKind, string>;

export type ProjectLocalEnvironmentErrorCode =
  'ACCESS_FAILED' | 'INVALID_FILE' | 'PARSE_FAILED';

export class ProjectLocalEnvironmentError extends Error {
  public constructor(
    public readonly code: ProjectLocalEnvironmentErrorCode,
    public readonly kind: ProjectLocalEnvironmentKind,
  ) {
    super(`Não foi possível carregar o ambiente local de ${kind} do projeto.`);
    this.name = 'ProjectLocalEnvironmentError';
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as Error & { code?: unknown }).code === code
  );
}

export async function loadProjectLocalEnvironment(
  projectPath: string,
  kind: ProjectLocalEnvironmentKind,
): Promise<NodeJS.ProcessEnv> {
  const envPath = path.join(projectPath, PROJECT_LOCAL_ENV_PATH[kind]);

  let stats;
  try {
    stats = await lstat(envPath);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return {};
    throw new ProjectLocalEnvironmentError('ACCESS_FAILED', kind);
  }

  if (!stats.isFile() || stats.size > PROJECT_LOCAL_ENV_MAX_BYTES) {
    throw new ProjectLocalEnvironmentError('INVALID_FILE', kind);
  }

  try {
    return parseEnv(await readFile(envPath, 'utf8'));
  } catch {
    throw new ProjectLocalEnvironmentError('PARSE_FAILED', kind);
  }
}
