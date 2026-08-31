export type ProductionStrategy = 'command' | 'git-managed' | 'disabled';

export type ProductionProvider =
  | 'systemd'
  | 'docker-compose'
  | 'vercel'
  | 'none';

export type ProductionCommandId =
  | 'status'
  | 'check'
  | 'backup'
  | 'migrate'
  | 'deploy'
  | 'verify'
  | 'restoreCheck'
  | 'rollback'
  | 'logs';

export interface ProductionCommands {
  status?: 'prod:status';
  check?: 'prod:check';
  backup?: 'prod:backup';
  migrate?: 'prod:migrate';
  deploy?: 'prod:deploy';
  verify?: 'prod:verify';
  restoreCheck?: 'prod:restore-check';
  rollback?: 'prod:rollback';
  logs?: 'prod:logs';
}

export type ProductionBackupPolicy =
  | 'required-before-migration'
  | 'required-before-deploy'
  | 'external'
  | 'not-configured';

export type ProductionMigrationPolicy =
  | 'startup'
  | 'before-deploy'
  | 'not-configured';

export type ProductionRollbackPolicy =
  | 'restore-backup-when-schema-changed'
  | 'manual-restore'
  | 'provider-only-when-schema-compatible'
  | 'not-configured';

export interface ProductionPolicies {
  backup: ProductionBackupPolicy;
  migrations: ProductionMigrationPolicy;
  rollback: ProductionRollbackPolicy;
}

export interface ProductionHealthCheck {
  type: 'http';
  url: string;
}

export interface ProductionExternalReference {
  project: string;
}

export interface ProductionContractV1 {
  version: 1;
  enabled: boolean;
  strategy: ProductionStrategy;
  provider: ProductionProvider;
  branch: string;
  documentation?: string;
  commands: ProductionCommands;
  health?: ProductionHealthCheck;
  external?: ProductionExternalReference;
  reasonCode?: string;
  blockedBy?: string[];
  policies: ProductionPolicies;
}

export type ProductionContractWarningCode =
  | 'PRODUCTION_CONTRACT_UNREADABLE'
  | 'PRODUCTION_CONTRACT_INVALID_JSON'
  | 'PRODUCTION_CONTRACT_UNSUPPORTED_VERSION'
  | 'PRODUCTION_CONTRACT_INVALID_SHAPE'
  | 'PRODUCTION_CONTRACT_SCRIPT_MISSING';

export interface ProductionContractWarning {
  code: ProductionContractWarningCode;
  message: string;
  manifestPath: '.dev-dashboard/production.json';
}
