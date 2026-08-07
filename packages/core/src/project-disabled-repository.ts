import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';

import { resolveConfigDirectory } from './config-directory.js';
import {
  isFileNotFoundError,
  quarantineUnreadableStateFile,
} from './state-file-recovery.js';

interface ProjectDisabledConfig {
  version: 1;
  disabledProjectIds: string[];
}

const MAX_DISABLED_PROJECTS = 1_000;
const MAX_PROJECT_ID_LENGTH = 256;

export class ProjectDisabledRepositoryError extends Error {
  public constructor(
    public readonly code:
      'INVALID_PROJECT_ID' | 'PROJECT_DISABLED_LIMIT_REACHED',
    message: string,
  ) {
    super(message);
    this.name = 'ProjectDisabledRepositoryError';
  }
}

function isValidProjectId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_PROJECT_ID_LENGTH
  );
}

function parseConfig(contents: string): Set<string> {
  const parsed: unknown = JSON.parse(contents);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      'A configuração de projetos desativados possui formato inválido.',
    );
  }

  const candidate = parsed as Record<string, unknown>;

  if (candidate.version !== 1 || !Array.isArray(candidate.disabledProjectIds)) {
    throw new Error(
      'A versão da configuração de projetos desativados não é suportada.',
    );
  }

  return new Set(
    candidate.disabledProjectIds
      .filter(isValidProjectId)
      .slice(0, MAX_DISABLED_PROJECTS),
  );
}

export class ProjectDisabledRepository {
  private readonly directory: string;
  private readonly file: string;
  private disabledProjectIds: Set<string>;
  private mutationQueue: Promise<void> = Promise.resolve();

  public constructor(directory = resolveConfigDirectory()) {
    this.directory = directory;
    this.file = path.join(directory, 'project-disabled.json');

    try {
      this.disabledProjectIds = parseConfig(readFileSync(this.file, 'utf8'));
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        quarantineUnreadableStateFile(this.file);
      }
      this.disabledProjectIds = new Set();
    }
  }

  public get filePath(): string {
    return this.file;
  }

  public list(): ReadonlySet<string> {
    return new Set(this.disabledProjectIds);
  }

  public isDisabled(projectId: string): boolean {
    return this.disabledProjectIds.has(projectId);
  }

  public async set(projectId: string, disabled: boolean): Promise<void> {
    if (!isValidProjectId(projectId)) {
      throw new ProjectDisabledRepositoryError(
        'INVALID_PROJECT_ID',
        'O identificador do projeto é inválido.',
      );
    }

    const operation = this.mutationQueue.then(async () => {
      const next = new Set(this.disabledProjectIds);

      if (disabled) {
        if (!next.has(projectId) && next.size >= MAX_DISABLED_PROJECTS) {
          throw new ProjectDisabledRepositoryError(
            'PROJECT_DISABLED_LIMIT_REACHED',
            'O limite de projetos desativados foi atingido.',
          );
        }

        next.add(projectId);
      } else {
        next.delete(projectId);
      }

      await fsPromises.mkdir(this.directory, {
        recursive: true,
        mode: 0o700,
      });

      const temporaryFile = `${this.file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;

      await fsPromises.writeFile(
        temporaryFile,
        `${JSON.stringify(
          {
            version: 1,
            disabledProjectIds: [...next].sort(),
          } satisfies ProjectDisabledConfig,
          null,
          2,
        )}\n`,
        {
          encoding: 'utf8',
          mode: 0o600,
        },
      );
      await fsPromises.rename(temporaryFile, this.file);
      this.disabledProjectIds = next;
    });

    this.mutationQueue = operation.catch(() => undefined);
    await operation;
  }
}
