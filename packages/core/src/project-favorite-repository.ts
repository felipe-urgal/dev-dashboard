import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';

import { resolveConfigDirectory } from './config-directory.js';

interface ProjectFavoriteConfig {
  version: 1;
  favoriteProjectIds: string[];
}

const MAX_FAVORITES = 1_000;
const MAX_PROJECT_ID_LENGTH = 256;

export class ProjectFavoriteRepositoryError extends Error {
  public constructor(
    public readonly code:
      | 'INVALID_PROJECT_ID'
      | 'PROJECT_FAVORITES_LIMIT_REACHED',
    message: string,
  ) {
    super(message);
    this.name = 'ProjectFavoriteRepositoryError';
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

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error('A configuração de favoritos possui formato inválido.');
  }

  const candidate = parsed as Record<string, unknown>;

  if (
    candidate.version !== 1 ||
    !Array.isArray(candidate.favoriteProjectIds)
  ) {
    throw new Error('A versão da configuração de favoritos não é suportada.');
  }

  return new Set(
    candidate.favoriteProjectIds
      .filter(isValidProjectId)
      .slice(0, MAX_FAVORITES),
  );
}

export class ProjectFavoriteRepository {
  private readonly directory: string;
  private readonly file: string;
  private favoriteProjectIds: Set<string>;
  private mutationQueue: Promise<void> = Promise.resolve();

  public constructor(directory = resolveConfigDirectory()) {
    this.directory = directory;
    this.file = path.join(directory, 'project-favorites.json');

    try {
      this.favoriteProjectIds = parseConfig(
        readFileSync(this.file, 'utf8'),
      );
    } catch {
      this.favoriteProjectIds = new Set();
    }
  }

  public get filePath(): string {
    return this.file;
  }

  public list(): ReadonlySet<string> {
    return new Set(this.favoriteProjectIds);
  }

  public async set(
    projectId: string,
    favorite: boolean,
  ): Promise<void> {
    if (!isValidProjectId(projectId)) {
      throw new ProjectFavoriteRepositoryError(
        'INVALID_PROJECT_ID',
        'O identificador do projeto é inválido.',
      );
    }

    const operation = this.mutationQueue.then(async () => {
      const next = new Set(this.favoriteProjectIds);

      if (favorite) {
        if (
          !next.has(projectId) &&
          next.size >= MAX_FAVORITES
        ) {
          throw new ProjectFavoriteRepositoryError(
            'PROJECT_FAVORITES_LIMIT_REACHED',
            'O limite de projetos favoritos foi atingido.',
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

      const temporaryFile =
        `${this.file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;

      await fsPromises.writeFile(
        temporaryFile,
        `${JSON.stringify({
          version: 1,
          favoriteProjectIds: [...next].sort(),
        } satisfies ProjectFavoriteConfig, null, 2)}\n`,
        {
          encoding: 'utf8',
          mode: 0o600,
        },
      );
      await fsPromises.rename(temporaryFile, this.file);
      this.favoriteProjectIds = next;
    });

    this.mutationQueue = operation.catch(() => undefined);
    await operation;
  }
}
