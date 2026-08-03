export type ProjectFileKind = 'file' | 'directory';

export interface ProjectFileEntry {
  path: string;
  name: string;
  kind: ProjectFileKind;
  language?: string;
  size?: number;
}

export interface ProjectDirectoryListing {
  path: string;
  entries: ProjectFileEntry[];
  truncated: boolean;
}

export interface ProjectFileContent {
  path: string;
  name: string;
  language: string;
  content: string;
  version: string;
  size: number;
  modifiedAt: string;
  writable: boolean;
}

export interface ProjectFileWriteRequest {
  path: string;
  content: string;
  expectedVersion: string;
}

export interface ProjectFileCreateRequest {
  path: string;
  kind: ProjectFileKind;
  content?: string;
}

export type ProjectFileMutationOperation = 'rename' | 'delete';

export interface ProjectFileMutationPreviewRequest {
  operation: ProjectFileMutationOperation;
  path: string;
  destinationPath?: string;
}

export interface ProjectFileMutationPreview {
  confirmationToken: string;
  operation: ProjectFileMutationOperation;
  path: string;
  destinationPath?: string;
  kind: ProjectFileKind;
  affectedFiles: number;
  affectedDirectories: number;
  totalBytes: number;
  requiresPhrase: boolean;
  confirmationPhrase?: string;
  expiresAt: string;
}

export interface ProjectFileMutationApplyRequest {
  confirmationToken: string;
  confirmationPhrase?: string;
}

export interface ProjectFileMutationResult {
  operation: 'create' | ProjectFileMutationOperation;
  path: string;
  destinationPath?: string;
  kind: ProjectFileKind;
}

export interface ProjectFileSearchMatch {
  path: string;
  name: string;
  language: string;
  line: number;
  column: number;
  preview: string;
}

export interface ProjectFileSearchResult {
  query: string;
  items: ProjectFileSearchMatch[];
  truncated: boolean;
  scannedFiles: number;
}
