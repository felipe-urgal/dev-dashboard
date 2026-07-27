export interface RetentionSettings {
  retentionDays: number;
  scriptHistoryLimit: number;
  testHistoryLimit: number;
}

export interface RetentionSettingsLimits {
  retentionDays: { minimum: number; maximum: number; default: number };
  scriptHistoryLimit: { minimum: number; maximum: number; default: number };
  testHistoryLimit: { minimum: number; maximum: number; default: number };
}

export interface RetentionSettingsSnapshot {
  values: RetentionSettings;
  limits: RetentionSettingsLimits;
  appliesAfterRestart: boolean;
}
