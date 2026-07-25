export type ProjectScriptOrigin = 'package-script' | 'rails-task' | 'bin';
export type ProjectScriptRisk = 'read-only' | 'mutable' | 'destructive';

export interface ProjectScript {
  id: string;
  name: string;
  description: string;
  command: string;
  origin: ProjectScriptOrigin;
  risk: ProjectScriptRisk;
  enabled: boolean;
}

export interface ProjectScriptCatalog {
  items: ProjectScript[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
