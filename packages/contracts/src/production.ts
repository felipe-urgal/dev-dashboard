export type ProductionStrategy =
  'command' | 'git-managed' | 'self-update' | 'disabled';

export type ProductionProvider =
  'systemd' | 'docker-compose' | 'vercel' | 'none';

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
  prepare?: 'prod:prepare';
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
  'startup' | 'before-deploy' | 'not-configured';

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

/** Rascunho do contrato montado pelo assistente de configuração. */
export interface ProductionContractDraft {
  strategy: Exclude<ProductionStrategy, 'disabled'>;
  provider: ProductionProvider;
  branch: string;
  /** Operações que o contrato deve declarar (cada uma exige o script `prod:*`). */
  commands: Array<keyof ProductionCommands>;
  /** URL HTTP/HTTPS de health check (sem credenciais, query ou hash). */
  healthUrl?: string;
  /** Projeto externo (Vercel) para a estratégia git-managed. */
  externalProject?: string;
  policies: ProductionPolicies;
}

export interface ProductionContractSetupInfo {
  /** Scripts `prod:*` encontrados no package.json do projeto. */
  scripts: string[];
  manifestExists: boolean;
}

export interface ProductionContractPreview {
  valid: boolean;
  message?: string;
  /** Operações pedidas cujo script `prod:*` não existe no package.json. */
  missingScripts: string[];
  manifest: { version: 1; production: Record<string, unknown> };
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
