import { randomBytes } from 'node:crypto';

import type {
  ProjectFileContent,
  ProjectFileWatchEntry,
  ProjectFileWatchItem,
  ProjectFileWatchResult,
  ProjectTextPosition,
  ProjectWorkspaceEditPreview,
  ProjectWorkspaceEditRequest,
  ProjectWorkspaceEditResult,
  ProjectWorkspaceTextEdit,
} from '@dev-dashboard/contracts';

import {
  ProjectFileError,
  type ProjectFileService,
} from './project-file-service.js';

export type ProjectWorkspaceEditErrorCode =
  | 'WORKSPACE_EDIT_INVALID'
  | 'WORKSPACE_EDIT_LIMIT_EXCEEDED'
  | 'WORKSPACE_EDIT_CHANGED_EXTERNALLY'
  | 'WORKSPACE_EDIT_CONFIRMATION_REQUIRED'
  | 'WORKSPACE_EDIT_ROLLBACK_FAILED';

export class ProjectWorkspaceEditError extends Error {
  public constructor(
    public readonly code: ProjectWorkspaceEditErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ProjectWorkspaceEditError';
  }
}

interface PreparedWorkspaceFile {
  path: string;
  language: string;
  beforeVersion: string;
  beforeContent: string;
  afterContent: string;
}

interface StoredWorkspaceEdit {
  token: string;
  projectId: string;
  files: PreparedWorkspaceFile[];
  expiresAt: number;
}

interface OffsetEdit {
  start: number;
  end: number;
  newText: string;
}

const MAX_WATCHED_FILES = 20;
const MAX_WORKSPACE_FILES = 20;
const MAX_EDITS_PER_FILE = 200;
const MAX_FILE_SIZE = 512 * 1024;
const MAX_TOTAL_PREVIEW_BYTES = 4 * 1024 * 1024;
const CONFIRMATION_TTL_MS = 5 * 60_000;
const VERSION_PATTERN = /^[a-f0-9]{64}$/;

function invalid(message: string): never {
  throw new ProjectWorkspaceEditError('WORKSPACE_EDIT_INVALID', message);
}

function assertVersion(version: string): void {
  if (!VERSION_PATTERN.test(version)) {
    invalid('A versão esperada de um dos arquivos não é válida.');
  }
}

function lineStarts(content: string): number[] {
  const starts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === '\n') starts.push(index + 1);
  }
  return starts;
}

function positionToOffset(
  content: string,
  starts: readonly number[],
  position: ProjectTextPosition,
): number {
  if (
    !Number.isInteger(position.line)
    || !Number.isInteger(position.column)
    || position.line < 1
    || position.column < 1
    || position.line > starts.length
  ) {
    invalid('Uma das posições do WorkspaceEdit é inválida.');
  }

  const start = starts[position.line - 1]!;
  let end = position.line < starts.length
    ? starts[position.line]! - 1
    : content.length;
  if (end > start && content[end - 1] === '\r') end -= 1;

  const maximumColumn = end - start + 1;
  if (position.column > maximumColumn) {
    invalid('Uma das colunas do WorkspaceEdit ultrapassa a linha do arquivo.');
  }
  return start + position.column - 1;
}

function normalizeEdits(
  content: string,
  edits: readonly ProjectWorkspaceTextEdit[],
): OffsetEdit[] {
  if (edits.length === 0 || edits.length > MAX_EDITS_PER_FILE) {
    throw new ProjectWorkspaceEditError(
      'WORKSPACE_EDIT_LIMIT_EXCEEDED',
      `Cada arquivo deve possuir entre 1 e ${MAX_EDITS_PER_FILE} edições.`,
    );
  }

  const starts = lineStarts(content);
  const normalized = edits.map((edit) => {
    const start = positionToOffset(content, starts, edit.range.start);
    const end = positionToOffset(content, starts, edit.range.end);
    if (end < start) invalid('Uma das faixas do WorkspaceEdit está invertida.');
    return { start, end, newText: edit.newText };
  }).sort((left, right) => left.start - right.start || left.end - right.end);

  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1]!;
    const current = normalized[index]!;
    if (current.start < previous.end || current.start === previous.start) {
      invalid('O WorkspaceEdit contém faixas sobrepostas ou ambíguas.');
    }
  }

  return normalized;
}

function applyTextEdits(
  content: string,
  edits: readonly ProjectWorkspaceTextEdit[],
): string {
  const normalized = normalizeEdits(content, edits);
  let result = content;
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const edit = normalized[index]!;
    result = `${result.slice(0, edit.start)}${edit.newText}${result.slice(edit.end)}`;
  }
  return result;
}

export class ProjectWorkspaceEditService {
  private readonly confirmations = new Map<string, StoredWorkspaceEdit>();

  public constructor(
    private readonly projectFileService: ProjectFileService,
    private readonly now: () => number = Date.now,
  ) {}

  public async watchOpenFiles(
    projectPath: string,
    files: readonly ProjectFileWatchEntry[],
  ): Promise<ProjectFileWatchResult> {
    if (files.length > MAX_WATCHED_FILES) {
      throw new ProjectWorkspaceEditError(
        'WORKSPACE_EDIT_LIMIT_EXCEEDED',
        `No máximo ${MAX_WATCHED_FILES} arquivos abertos podem ser monitorados.`,
      );
    }

    const seen = new Set<string>();
    for (const file of files) {
      if (seen.has(file.path)) invalid('A lista de arquivos monitorados contém caminhos duplicados.');
      seen.add(file.path);
      assertVersion(file.version);
    }

    const items = await Promise.all(files.map(async (entry): Promise<ProjectFileWatchItem> => {
      try {
        const file = await this.projectFileService.readFile(projectPath, entry.path);
        return file.version === entry.version
          ? { path: entry.path, state: 'unchanged' }
          : { path: entry.path, state: 'changed', file };
      } catch (error) {
        if (error instanceof ProjectFileError) {
          if (error.code === 'FILE_NOT_FOUND') {
            return { path: entry.path, state: 'deleted' };
          }
          return { path: entry.path, state: 'unavailable' };
        }
        throw error;
      }
    }));

    return {
      checkedAt: new Date(this.now()).toISOString(),
      items,
    };
  }

  public async previewWorkspaceEdit(
    projectPath: string,
    projectId: string,
    request: ProjectWorkspaceEditRequest,
  ): Promise<ProjectWorkspaceEditPreview> {
    this.pruneExpired();
    if (request.files.length === 0 || request.files.length > MAX_WORKSPACE_FILES) {
      throw new ProjectWorkspaceEditError(
        'WORKSPACE_EDIT_LIMIT_EXCEEDED',
        `O WorkspaceEdit deve alterar entre 1 e ${MAX_WORKSPACE_FILES} arquivos.`,
      );
    }

    const seen = new Set<string>();
    const prepared: PreparedWorkspaceFile[] = [];
    let previewBytes = 0;

    for (const input of request.files) {
      if (seen.has(input.path)) invalid('O WorkspaceEdit contém caminhos duplicados.');
      seen.add(input.path);
      assertVersion(input.expectedVersion);

      const current = await this.projectFileService.readFile(projectPath, input.path);
      if (current.version !== input.expectedVersion) {
        throw new ProjectWorkspaceEditError(
          'WORKSPACE_EDIT_CHANGED_EXTERNALLY',
          `${input.path} mudou no disco antes do preview.`,
        );
      }
      if (!current.writable) {
        throw new ProjectFileError(
          'FILE_NOT_WRITABLE',
          `${input.path} não possui permissão de escrita.`,
        );
      }

      const afterContent = applyTextEdits(current.content, input.edits);
      if (afterContent === current.content) {
        invalid(`O WorkspaceEdit não produz alteração em ${input.path}.`);
      }
      if (Buffer.byteLength(afterContent, 'utf8') > MAX_FILE_SIZE) {
        throw new ProjectFileError(
          'FILE_TOO_LARGE',
          `${input.path} ultrapassaria o limite de 512 KB.`,
        );
      }

      previewBytes += Buffer.byteLength(current.content, 'utf8');
      previewBytes += Buffer.byteLength(afterContent, 'utf8');
      if (previewBytes > MAX_TOTAL_PREVIEW_BYTES) {
        throw new ProjectWorkspaceEditError(
          'WORKSPACE_EDIT_LIMIT_EXCEEDED',
          'O preview do WorkspaceEdit ultrapassa o limite total de 4 MB.',
        );
      }

      prepared.push({
        path: current.path,
        language: current.language,
        beforeVersion: current.version,
        beforeContent: current.content,
        afterContent,
      });
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = this.now() + CONFIRMATION_TTL_MS;
    this.confirmations.set(token, {
      token,
      projectId,
      files: prepared,
      expiresAt,
    });

    return {
      confirmationToken: token,
      files: prepared.map((file) => ({ ...file })),
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  public async applyWorkspaceEdit(
    projectPath: string,
    projectId: string,
    confirmationToken: string,
  ): Promise<ProjectWorkspaceEditResult> {
    this.pruneExpired();
    const record = this.confirmations.get(confirmationToken);
    if (!record || record.projectId !== projectId) {
      throw new ProjectWorkspaceEditError(
        'WORKSPACE_EDIT_CONFIRMATION_REQUIRED',
        'O preview do WorkspaceEdit expirou ou não corresponde a este projeto.',
      );
    }
    this.confirmations.delete(confirmationToken);

    for (const prepared of record.files) {
      const current = await this.projectFileService.readFile(projectPath, prepared.path);
      if (current.version !== prepared.beforeVersion) {
        throw new ProjectWorkspaceEditError(
          'WORKSPACE_EDIT_CHANGED_EXTERNALLY',
          `${prepared.path} mudou no disco depois do preview.`,
        );
      }
    }

    const applied: Array<{
      prepared: PreparedWorkspaceFile;
      saved: ProjectFileContent;
    }> = [];

    try {
      for (const prepared of record.files) {
        const saved = await this.projectFileService.writeFile(
          projectPath,
          prepared.path,
          prepared.afterContent,
          prepared.beforeVersion,
        );
        applied.push({ prepared, saved });
      }
    } catch (error) {
      let rollbackFailed = false;
      for (let index = applied.length - 1; index >= 0; index -= 1) {
        const item = applied[index]!;
        try {
          await this.projectFileService.writeFile(
            projectPath,
            item.prepared.path,
            item.prepared.beforeContent,
            item.saved.version,
          );
        } catch {
          rollbackFailed = true;
        }
      }
      if (rollbackFailed) {
        throw new ProjectWorkspaceEditError(
          'WORKSPACE_EDIT_ROLLBACK_FAILED',
          'A aplicação falhou e nem todos os arquivos puderam ser restaurados.',
        );
      }
      throw error;
    }

    return { files: applied.map((item) => item.saved) };
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [token, record] of this.confirmations) {
      if (record.expiresAt <= now) this.confirmations.delete(token);
    }
  }
}
