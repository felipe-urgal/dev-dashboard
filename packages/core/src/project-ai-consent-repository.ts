import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';

import { resolveConfigDirectory } from './config-directory.js';
import {
  isFileNotFoundError,
  quarantineUnreadableStateFile,
} from './state-file-recovery.js';

export type ProjectAiCloudProviderId = 'openai';

interface ProjectAiConsentConfig {
  version: 1;
  grants: Array<{
    projectId: string;
    provider: ProjectAiCloudProviderId;
  }>;
}

const MAX_GRANTS = 1_000;
const MAX_PROJECT_ID_LENGTH = 256;

export class ProjectAiConsentRepositoryError extends Error {
  public constructor(
    public readonly code:
      | 'INVALID_PROJECT_ID'
      | 'INVALID_PROVIDER'
      | 'PROJECT_AI_CONSENT_LIMIT_REACHED',
    message: string,
  ) {
    super(message);
    this.name = 'ProjectAiConsentRepositoryError';
  }
}

function isValidProjectId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_PROJECT_ID_LENGTH
  );
}

function isCloudProvider(value: unknown): value is ProjectAiCloudProviderId {
  return value === 'openai';
}

function grantKey(
  projectId: string,
  provider: ProjectAiCloudProviderId,
): string {
  return `${projectId}\u0000${provider}`;
}

function parseConfig(contents: string): Set<string> {
  const parsed: unknown = JSON.parse(contents);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      'A configuração de consentimento de IA possui formato inválido.',
    );
  }

  const candidate = parsed as Record<string, unknown>;
  if (candidate.version !== 1 || !Array.isArray(candidate.grants)) {
    throw new Error(
      'A versão da configuração de consentimento de IA não é suportada.',
    );
  }

  const grants = new Set<string>();
  for (const value of candidate.grants.slice(0, MAX_GRANTS)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const grant = value as Record<string, unknown>;
    if (
      !isValidProjectId(grant.projectId) ||
      !isCloudProvider(grant.provider)
    ) {
      continue;
    }
    grants.add(grantKey(grant.projectId, grant.provider));
  }
  return grants;
}

export class ProjectAiConsentRepository {
  private readonly directory: string;
  private readonly file: string;
  private grants: Set<string>;
  private mutationQueue: Promise<void> = Promise.resolve();

  public constructor(directory = resolveConfigDirectory()) {
    this.directory = directory;
    this.file = path.join(directory, 'project-ai-consent.json');

    try {
      this.grants = parseConfig(readFileSync(this.file, 'utf8'));
    } catch (error) {
      if (!isFileNotFoundError(error)) quarantineUnreadableStateFile(this.file);
      this.grants = new Set();
    }
  }

  public get filePath(): string {
    return this.file;
  }

  public has(projectId: string, provider: ProjectAiCloudProviderId): boolean {
    if (!isValidProjectId(projectId)) return false;
    return this.grants.has(grantKey(projectId, provider));
  }

  public async set(
    projectId: string,
    provider: ProjectAiCloudProviderId,
    granted: boolean,
  ): Promise<void> {
    if (!isValidProjectId(projectId)) {
      throw new ProjectAiConsentRepositoryError(
        'INVALID_PROJECT_ID',
        'O identificador do projeto é inválido.',
      );
    }
    if (!isCloudProvider(provider)) {
      throw new ProjectAiConsentRepositoryError(
        'INVALID_PROVIDER',
        'O provider cloud informado não é suportado.',
      );
    }

    const operation = this.mutationQueue.then(async () => {
      const next = new Set(this.grants);
      const key = grantKey(projectId, provider);
      if (granted) {
        if (!next.has(key) && next.size >= MAX_GRANTS) {
          throw new ProjectAiConsentRepositoryError(
            'PROJECT_AI_CONSENT_LIMIT_REACHED',
            'O limite de consentimentos de IA por projeto foi atingido.',
          );
        }
        next.add(key);
      } else {
        next.delete(key);
      }

      const grants = [...next]
        .map((item) => {
          const separator = item.lastIndexOf('\u0000');
          return {
            projectId: item.slice(0, separator),
            provider: item.slice(separator + 1) as ProjectAiCloudProviderId,
          };
        })
        .sort((left, right) =>
          `${left.projectId}:${left.provider}`.localeCompare(
            `${right.projectId}:${right.provider}`,
          ),
        );

      await fsPromises.mkdir(this.directory, { recursive: true, mode: 0o700 });
      const temporaryFile = `${this.file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
      await fsPromises.writeFile(
        temporaryFile,
        `${JSON.stringify(
          { version: 1, grants } satisfies ProjectAiConsentConfig,
          null,
          2,
        )}\n`,
        { encoding: 'utf8', mode: 0o600 },
      );
      await fsPromises.rename(temporaryFile, this.file);
      this.grants = next;
    });

    this.mutationQueue = operation.catch(() => undefined);
    await operation;
  }
}
