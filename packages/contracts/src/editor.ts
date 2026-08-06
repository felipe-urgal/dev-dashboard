export type ProjectEditorId =
  'vscode' | 'cursor' | 'vscodium' | 'sublime' | 'zed';

export interface ProjectEditor {
  id: ProjectEditorId;
  name: string;
}

export interface ProjectEditorAvailability {
  editors: ProjectEditor[];
  preferredEditorId?: ProjectEditorId;
}

export interface ProjectEditorLaunchResult {
  editor: ProjectEditor;
  opened: true;
}
