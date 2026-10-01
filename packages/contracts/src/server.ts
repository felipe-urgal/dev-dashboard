export interface ProjectServerSettings {
  projectId: string;
  port?: number;
  environment?: string;
  updatedAt?: string;
}

export interface UpdateProjectServerSettingsInput {
  port?: number;
  environment?: string;
}
