import { randomBytes } from 'node:crypto';

import {
  mkdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';

import { homedir } from 'node:os';

import path from 'node:path';

import type {
  ProjectServerSettings,
  UpdateProjectServerSettingsInput,
} from '@dev-dashboard/contracts';

interface ServerSettingsConfig {
  version: 1;
  settings: ProjectServerSettings[];
}

export type ProjectServerSettingsErrorCode =
  | 'INVALID_PROJECT_ID'
  | 'INVALID_SERVER_PORT'
  | 'INVALID_HEALTH_CHECK_PATH';

export class ProjectServerSettingsError extends Error {
  public readonly code: ProjectServerSettingsErrorCode;

  public constructor(
    code: ProjectServerSettingsErrorCode,
    message: string,
  ) {
    super(message);

    this.name = 'ProjectServerSettingsError';
    this.code = code;
  }
}

const DEFAULT_CONFIG: ServerSettingsConfig = {
  version: 1,
  settings: [],
};

function resolveConfigDirectory(): string {
  const configuredDirectory =
    process.env.DEV_DASHBOARD_CONFIG_DIR?.trim();

  if (configuredDirectory) {
    return path.resolve(configuredDirectory);
  }

  const xdgConfigHome =
    process.env.XDG_CONFIG_HOME?.trim();

  if (xdgConfigHome) {
    return path.join(
      path.resolve(xdgConfigHome),
      'dev-dashboard',
    );
  }

  return path.join(
    homedir(),
    '.config',
    'dev-dashboard',
  );
}

function isErrnoException(
  error: unknown,
): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function parseServerSettings(
  value: unknown,
): ProjectServerSettings | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.projectId !== 'string' ||
    (candidate.port !== undefined &&
      typeof candidate.port !== 'number') ||
    (candidate.healthCheckPath !== undefined &&
      typeof candidate.healthCheckPath !== 'string') ||
    (candidate.updatedAt !== undefined &&
      typeof candidate.updatedAt !== 'string')
  ) {
    return null;
  }

  // Arquivos criados pela implementação anterior podem
  // conter `host`. Esse campo é ignorado durante a migração.
  let healthCheckPath: string | undefined;

  if (candidate.healthCheckPath !== undefined) {
    try {
      validateHealthCheckPath(candidate.healthCheckPath);
      healthCheckPath = candidate.healthCheckPath;
    } catch {
      // Configuração local corrompida não pode ampliar o destino
      // autorizado do health check.
    }
  }

  return {
    projectId: candidate.projectId,
    ...(candidate.port !== undefined
      ? { port: candidate.port }
      : {}),
    ...(healthCheckPath !== undefined
      ? { healthCheckPath }
      : {}),
    ...(candidate.updatedAt !== undefined
      ? { updatedAt: candidate.updatedAt }
      : {}),
  };
}

function parseConfig(contents: string): ServerSettingsConfig {
  const parsed: unknown = JSON.parse(contents);

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      'O arquivo de configurações dos servidores possui formato inválido.',
    );
  }

  const candidate = parsed as Record<string, unknown>;

  if (
    candidate.version !== 1 ||
    !Array.isArray(candidate.settings)
  ) {
    throw new Error(
      'A versão das configurações dos servidores não é suportada.',
    );
  }

  return {
    version: 1,
    settings: candidate.settings
      .map(parseServerSettings)
      .filter(
        (settings): settings is ProjectServerSettings =>
          settings !== null,
      ),
  };
}

export function validateServerPort(
  port: number | undefined,
): void {
  if (port === undefined) {
    return;
  }

  if (
    !Number.isInteger(port) ||
    port < 1_024 ||
    port > 65_535
  ) {
    throw new ProjectServerSettingsError(
      'INVALID_SERVER_PORT',
      'A porta deve estar entre 1024 e 65535.',
    );
  }
}

export function validateHealthCheckPath(
  healthCheckPath: string | undefined,
): void {
  if (healthCheckPath === undefined) {
    return;
  }

  const segments = healthCheckPath.split('/').slice(1);
  const validCharacters = /^\/(?:[A-Za-z0-9._~-]+\/?)*$/;

  if (
    healthCheckPath.length > 128 ||
    !validCharacters.test(healthCheckPath) ||
    segments.some(
      (segment) => segment === '.' || segment === '..',
    )
  ) {
    throw new ProjectServerSettingsError(
      'INVALID_HEALTH_CHECK_PATH',
      'O health check deve usar um caminho relativo válido, como /up ou /health.',
    );
  }
}

export class ProjectServerSettingsRepository {
  private readonly configDirectory: string;
  private readonly configFile: string;

  public constructor(
    configDirectory = resolveConfigDirectory(),
  ) {
    this.configDirectory = configDirectory;
    this.configFile = path.join(
      configDirectory,
      'server-settings.json',
    );
  }

  public get filePath(): string {
    return this.configFile;
  }

  public async find(
    projectId: string,
  ): Promise<ProjectServerSettings> {
    const config = await this.readConfig();

    return (
      config.settings.find(
        (settings) => settings.projectId === projectId,
      ) ?? { projectId }
    );
  }

  public async save(
    projectId: string,
    input: UpdateProjectServerSettingsInput,
  ): Promise<ProjectServerSettings> {
    const normalizedProjectId = projectId.trim();

    if (!normalizedProjectId) {
      throw new ProjectServerSettingsError(
        'INVALID_PROJECT_ID',
        'O projeto informado é inválido.',
      );
    }

    validateServerPort(input.port);
    validateHealthCheckPath(input.healthCheckPath);

    const settings: ProjectServerSettings = {
      projectId: normalizedProjectId,
      ...(input.port !== undefined
        ? { port: input.port }
        : {}),
      ...(input.healthCheckPath !== undefined
        ? { healthCheckPath: input.healthCheckPath }
        : {}),
      updatedAt: new Date().toISOString(),
    };

    const config = await this.readConfig();

    await this.writeConfig({
      version: 1,
      settings: [
        ...config.settings.filter(
          (candidate) =>
            candidate.projectId !== normalizedProjectId,
        ),
        settings,
      ],
    });

    return settings;
  }

  private async readConfig(): Promise<ServerSettingsConfig> {
    try {
      const contents = await readFile(
        this.configFile,
        'utf8',
      );

      return parseConfig(contents);
    } catch (error) {
      if (isErrnoException(error) && error.code === 'ENOENT') {
        return {
          ...DEFAULT_CONFIG,
          settings: [],
        };
      }

      throw error;
    }
  }

  private async writeConfig(
    config: ServerSettingsConfig,
  ): Promise<void> {
    await mkdir(this.configDirectory, {
      recursive: true,
      mode: 0o700,
    });

    const temporaryFile =
      `${this.configFile}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;

    await writeFile(
      temporaryFile,
      `${JSON.stringify(config, null, 2)}\n`,
      {
        encoding: 'utf8',
        mode: 0o600,
      },
    );

    await rename(temporaryFile, this.configFile);
  }
}
