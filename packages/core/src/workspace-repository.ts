import { createHash } from 'node:crypto';

import {
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';

import path from 'node:path';

import type { Workspace } from '@dev-dashboard/contracts';

import { resolveConfigDirectory } from './config-directory.js';
import {
  isFileNotFoundError,
  quarantineUnreadableStateFile,
} from './state-file-recovery.js';

interface DashboardConfig {
  version: 1;
  workspaces: Workspace[];
}

export interface CreateWorkspaceInput {
  id?: string;
  name: string;
  path: string;
  enabled?: boolean;
  recursiveScan?: boolean;
}

export type WorkspaceRepositoryErrorCode =
  'INVALID_WORKSPACE' | 'WORKSPACE_ALREADY_EXISTS' | 'WORKSPACE_NOT_FOUND';

export class WorkspaceRepositoryError extends Error {
  public readonly code: WorkspaceRepositoryErrorCode;

  public constructor(code: WorkspaceRepositoryErrorCode, message: string) {
    super(message);

    this.name = 'WorkspaceRepositoryError';
    this.code = code;
  }
}

const DEFAULT_CONFIG: DashboardConfig = {
  version: 1,
  workspaces: [],
};

function slugify(value: string): string {
  const result = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return result || 'workspace';
}

function createPathHash(workspacePath: string): string {
  return createHash('sha256').update(workspacePath).digest('hex').slice(0, 8);
}

interface PersistedWorkspaceFields {
  id: string;
  name: string;
  path: string;
  enabled: boolean;
  recursiveScan?: unknown;
}

function isPersistedWorkspace(
  value: unknown,
): value is PersistedWorkspaceFields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.path === 'string' &&
    typeof candidate.enabled === 'boolean'
  );
}

function normalizeWorkspace(persisted: PersistedWorkspaceFields): Workspace {
  return {
    id: persisted.id,
    name: persisted.name,
    path: persisted.path,
    enabled: persisted.enabled,
    recursiveScan: persisted.recursiveScan === true,
  };
}

function parseConfig(contents: string): DashboardConfig {
  const parsed: unknown = JSON.parse(contents);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('O arquivo de configuração possui formato inválido.');
  }

  const candidate = parsed as Record<string, unknown>;

  if (candidate.version !== 1 || !Array.isArray(candidate.workspaces)) {
    throw new Error('A versão do arquivo de configuração não é suportada.');
  }

  return {
    version: 1,
    workspaces: candidate.workspaces
      .filter(isPersistedWorkspace)
      .map(normalizeWorkspace),
  };
}

export class WorkspaceRepository {
  private readonly configDirectory: string;
  private readonly configFile: string;

  public constructor(configDirectory = resolveConfigDirectory()) {
    this.configDirectory = configDirectory;

    this.configFile = path.join(configDirectory, 'config.json');
  }

  public get filePath(): string {
    return this.configFile;
  }

  public async list(): Promise<Workspace[]> {
    const config = await this.readConfig();

    return [...config.workspaces].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  public async find(workspaceId: string): Promise<Workspace | null> {
    const config = await this.readConfig();

    return (
      config.workspaces.find((workspace) => workspace.id === workspaceId) ??
      null
    );
  }

  public async create(input: CreateWorkspaceInput): Promise<Workspace> {
    const name = input.name.trim();

    if (!name) {
      throw new WorkspaceRepositoryError(
        'INVALID_WORKSPACE',
        'Informe um nome para o workspace.',
      );
    }

    const resolvedPath = await realpath(input.path);
    const workspaceStats = await stat(resolvedPath);

    if (!workspaceStats.isDirectory()) {
      throw new WorkspaceRepositoryError(
        'INVALID_WORKSPACE',
        'O caminho informado não é um diretório.',
      );
    }

    const config = await this.readConfig();

    const existingByPath = config.workspaces.find(
      (workspace) => workspace.path === resolvedPath,
    );

    if (existingByPath) {
      throw new WorkspaceRepositoryError(
        'WORKSPACE_ALREADY_EXISTS',
        `O diretório já pertence ao workspace "${existingByPath.name}".`,
      );
    }

    const requestedId = input.id?.trim();
    const baseId = slugify(requestedId || name);

    const existingById = config.workspaces.find(
      (workspace) => workspace.id === baseId,
    );

    const id = existingById
      ? `${baseId}-${createPathHash(resolvedPath)}`
      : baseId;

    const workspace: Workspace = {
      id,
      name,
      path: resolvedPath,
      enabled: input.enabled ?? true,
      recursiveScan: input.recursiveScan ?? false,
    };

    await this.writeConfig({
      version: 1,
      workspaces: [...config.workspaces, workspace],
    });

    return workspace;
  }

  public async setRecursiveScan(
    workspaceId: string,
    recursiveScan: boolean,
  ): Promise<Workspace> {
    const config = await this.readConfig();

    const existingWorkspace = config.workspaces.find(
      (workspace) => workspace.id === workspaceId,
    );

    if (!existingWorkspace) {
      throw new WorkspaceRepositoryError(
        'WORKSPACE_NOT_FOUND',
        'Workspace não encontrado.',
      );
    }

    const updatedWorkspace: Workspace = {
      ...existingWorkspace,
      recursiveScan,
    };

    await this.writeConfig({
      version: 1,
      workspaces: config.workspaces.map((workspace) =>
        workspace.id === workspaceId ? updatedWorkspace : workspace,
      ),
    });

    return updatedWorkspace;
  }

  public async remove(workspaceId: string): Promise<void> {
    const config = await this.readConfig();

    const nextWorkspaces = config.workspaces.filter(
      (workspace) => workspace.id !== workspaceId,
    );

    if (nextWorkspaces.length === config.workspaces.length) {
      throw new WorkspaceRepositoryError(
        'WORKSPACE_NOT_FOUND',
        'Workspace não encontrado.',
      );
    }

    await this.writeConfig({
      version: 1,
      workspaces: nextWorkspaces,
    });
  }

  private async readConfig(): Promise<DashboardConfig> {
    try {
      const contents = await readFile(this.configFile, 'utf8');

      return parseConfig(contents);
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        quarantineUnreadableStateFile(this.configFile);
      }

      return {
        ...DEFAULT_CONFIG,
        workspaces: [],
      };
    }
  }

  private async writeConfig(config: DashboardConfig): Promise<void> {
    await mkdir(this.configDirectory, {
      recursive: true,
      mode: 0o700,
    });

    const temporaryFile = `${this.configFile}.${process.pid}.tmp`;

    await writeFile(temporaryFile, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });

    await rename(temporaryFile, this.configFile);
  }
}
