export interface ProjectServerSettings {
  projectId: string;
  port?: number;
  updatedAt?: string;
}

export interface UpdateProjectServerSettingsInput {
  port?: number;
}
