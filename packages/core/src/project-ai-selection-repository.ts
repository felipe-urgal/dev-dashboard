import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import path from 'node:path';

import { resolveConfigDirectory } from './config-directory.js';
import {
  isFileNotFoundError,
  quarantineUnreadableStateFile,
} from './state-file-recovery.js';

export type ProjectAiProviderSelection = 'ollama' | 'openai';
export type ProjectAiModeSelection = 'fast' | 'complete';

export interface ProjectAiSelection {
  provider: ProjectAiProviderSelection;
  mode: ProjectAiModeSelection;
}

interface ProjectAiSelectionConfig {
  version: 1;
  projects: Record<string, ProjectAiSelection>;
}

const DEFAULT_SELECTION: ProjectAiSelection = {
  provider: 'ollama',
  mode: 'fast',
};
const MAX_PROJECTS = 1_000;
const MAX_PROJECT_ID_LENGTH = 256;

function isProjectId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_PROJECT_ID_LENGTH
  );
}

function isProvider(value: unknown): value is ProjectAiProviderSelection {
  return value === 'ollama' || value === 'openai';
}

function isMode(value: unknown): value is ProjectAiModeSelection {
  return value === 'fast' || value === 'complete';
}

function parseConfig(contents: string): Map<string, ProjectAiSelection> {
  const parsed: unknown = JSON.parse(contents);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('A configuração de seleção de IA possui formato inválido.');
  }
  const candidate = parsed as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    !candidate.projects ||
    typeof candidate.projects !== 'object' ||
    Array.isArray(candidate.projects)
  ) {
    throw new Error(
      'A versão da configuração de seleção de IA não é suportada.',
    );
  }

  const selections = new Map<string, ProjectAiSelection>();
  for (const [projectId, rawSelection] of Object.entries(
    candidate.projects as Record<string, unknown>,
  ).slice(0, MAX_PROJECTS)) {
    if (
      !isProjectId(projectId) ||
      !rawSelection ||
      typeof rawSelection !== 'object' ||
      Array.isArray(rawSelection)
    )
      continue;
    const selection = rawSelection as Record<string, unknown>;
    if (!isProvider(selection.provider) || !isMode(selection.mode)) continue;
    selections.set(projectId, {
      provider: selection.provider,
      mode: selection.mode,
    });
  }
  return selections;
}

export class ProjectAiSelectionRepository {
  private readonly directory: string;
  private readonly file: string;
  private selections: Map<string, ProjectAiSelection>;
  private mutationQueue: Promise<void> = Promise.resolve();

  public constructor(directory = resolveConfigDirectory()) {
    this.directory = directory;
    this.file = path.join(directory, 'project-ai-selection.json');
    try {
      this.selections = parseConfig(readFileSync(this.file, 'utf8'));
    } catch (error) {
      if (!isFileNotFoundError(error)) quarantineUnreadableStateFile(this.file);
      this.selections = new Map();
    }
  }

  public get(projectId: string): ProjectAiSelection {
    const selection = this.selections.get(projectId);
    return selection ? { ...selection } : { ...DEFAULT_SELECTION };
  }

  public async set(
    projectId: string,
    selection: ProjectAiSelection,
  ): Promise<void> {
    if (!isProjectId(projectId))
      throw new Error('O identificador do projeto é inválido.');
    if (!isProvider(selection.provider) || !isMode(selection.mode)) {
      throw new Error('A seleção de execução de IA é inválida.');
    }

    const operation = this.mutationQueue.then(async () => {
      const next = new Map(this.selections);
      if (!next.has(projectId) && next.size >= MAX_PROJECTS) {
        throw new Error('O limite de seleções de IA por projeto foi atingido.');
      }
      next.set(projectId, { ...selection });

      await fsPromises.mkdir(this.directory, { recursive: true, mode: 0o700 });
      const projects = Object.fromEntries(
        [...next.entries()].sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      );
      const temporaryFile = `${this.file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
      await fsPromises.writeFile(
        temporaryFile,
        `${JSON.stringify(
          { version: 1, projects } satisfies ProjectAiSelectionConfig,
          null,
          2,
        )}\n`,
        { encoding: 'utf8', mode: 0o600 },
      );
      await fsPromises.rename(temporaryFile, this.file);
      this.selections = next;
    });

    this.mutationQueue = operation.catch(() => undefined);
    await operation;
  }
}
