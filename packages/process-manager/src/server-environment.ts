import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseEnv } from 'node:util';

import {
  ProjectServerSettingsError,
  validateServerEnvironment,
} from './server-settings.js';

const MAX_ENVIRONMENT_FILE_BYTES = 256 * 1_024;
const IGNORED_ENVIRONMENT_MARKER =
  /(?:^|[._-])(?:local|sample|example|bak|backup|old|orig)(?:$|[._-])/i;

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function isRunnableEnvironment(environment: string): boolean {
  return !IGNORED_ENVIRONMENT_MARKER.test(environment);
}

export async function listNodeServerEnvironments(
  projectPath: string,
): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(projectPath, {
      withFileTypes: true,
    });
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const environments = new Set<string>();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith('.env.')) {
      continue;
    }

    const environment = entry.name.slice('.env.'.length);

    if (!environment || !isRunnableEnvironment(environment)) {
      continue;
    }

    try {
      validateServerEnvironment(environment);
      environments.add(environment);
    } catch {
      // Arquivo com sufixo inválido não vira opção executável.
    }
  }

  return [...environments].sort((left, right) => left.localeCompare(right));
}

export async function prepareNodeServerEnvironment(
  projectPath: string,
  selectedEnvironment?: string,
): Promise<NodeJS.ProcessEnv | undefined> {
  if (selectedEnvironment === undefined) {
    return undefined;
  }

  validateServerEnvironment(selectedEnvironment);

  const environments = await listNodeServerEnvironments(projectPath);

  if (!environments.includes(selectedEnvironment)) {
    throw new ProjectServerSettingsError(
      'SERVER_ENVIRONMENT_NOT_FOUND',
      `O arquivo .env.${selectedEnvironment} não foi encontrado.`,
    );
  }

  const source = path.join(projectPath, `.env.${selectedEnvironment}`);
  const sourceStats = await stat(source);

  if (!sourceStats.isFile() || sourceStats.size > MAX_ENVIRONMENT_FILE_BYTES) {
    throw new ProjectServerSettingsError(
      'SERVER_ENVIRONMENT_FILE_TOO_LARGE',
      'O arquivo de ambiente excede o limite seguro de 256 KiB.',
    );
  }

  const contents = await readFile(source, 'utf8');

  try {
    return parseEnv(contents);
  } catch {
    throw new ProjectServerSettingsError(
      'INVALID_SERVER_ENVIRONMENT',
      `O arquivo .env.${selectedEnvironment} possui conteúdo inválido.`,
    );
  }
}
