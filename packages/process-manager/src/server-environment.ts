import { randomBytes } from 'node:crypto';
import {
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import {
  ProjectServerSettingsError,
  validateServerEnvironment,
} from './server-settings.js';

const MAX_ENVIRONMENT_FILE_BYTES = 256 * 1_024;
const TEMPLATE_OR_LOCAL_SUFFIX =
  /(?:^|\.)(?:local|sample|example)$/i;

function isErrnoException(
  error: unknown,
): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
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

    if (
      !environment ||
      TEMPLATE_OR_LOCAL_SUFFIX.test(environment)
    ) {
      continue;
    }

    try {
      validateServerEnvironment(environment);
      environments.add(environment);
    } catch {
      // Arquivo com sufixo inválido não vira opção executável.
    }
  }

  return [...environments].sort((left, right) =>
    left.localeCompare(right),
  );
}

export async function prepareNodeServerEnvironment(
  projectPath: string,
  selectedEnvironment?: string,
): Promise<string | undefined> {
  if (selectedEnvironment !== undefined) {
    validateServerEnvironment(selectedEnvironment);
  }

  const environments = await listNodeServerEnvironments(projectPath);

  if (environments.length === 0) {
    if (selectedEnvironment !== undefined) {
      throw new ProjectServerSettingsError(
        'SERVER_ENVIRONMENT_NOT_FOUND',
        `O arquivo .env.${selectedEnvironment} não foi encontrado.`,
      );
    }

    return undefined;
  }

  if (!selectedEnvironment) {
    throw new ProjectServerSettingsError(
      'SERVER_ENVIRONMENT_REQUIRED',
      'Escolha um ambiente antes de iniciar o servidor.',
    );
  }

  if (!environments.includes(selectedEnvironment)) {
    throw new ProjectServerSettingsError(
      'SERVER_ENVIRONMENT_NOT_FOUND',
      `O arquivo .env.${selectedEnvironment} não foi encontrado.`,
    );
  }

  const source = path.join(
    projectPath,
    `.env.${selectedEnvironment}`,
  );
  const target = path.join(projectPath, '.env.local');
  const temporary = path.join(
    projectPath,
    `.env.local.${process.pid}.${randomBytes(6).toString('hex')}.tmp`,
  );

  const sourceStats = await stat(source);

  if (
    !sourceStats.isFile() ||
    sourceStats.size > MAX_ENVIRONMENT_FILE_BYTES
  ) {
    throw new ProjectServerSettingsError(
      'SERVER_ENVIRONMENT_FILE_TOO_LARGE',
      'O arquivo de ambiente excede o limite seguro de 256 KiB.',
    );
  }

  const contents = await readFile(source);

  try {
    await writeFile(temporary, contents, {
      mode: 0o600,
    });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }

  return selectedEnvironment;
}
