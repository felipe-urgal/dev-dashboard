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
