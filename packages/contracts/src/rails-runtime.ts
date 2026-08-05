import type { ManagedProcess } from './process.js';

/**
 * Identificador de worker de fundo reconhecido para projetos Rails.
 * Mapeado internamente para os `ManagedProcessKind` 'worker' (Sidekiq) e
 * 'webpack' (webpack-dev-server) do process-manager.
 */
export type RailsWorkerId = 'sidekiq' | 'webpack';

export interface RailsWorkerOverview {
  id: RailsWorkerId;
  /** Se o projeto possui indícios do worker (gem, binstub ou dependência). */
  detected: boolean;
  /** Processo gerenciado atual, ou `null` se nunca foi iniciado pelo dashboard. */
  process: ManagedProcess | null;
}

export type RailsCredentialsKeySource =
  | 'file'
  | 'environment-variable'
  | 'missing';

export interface RailsCredentialsEnvironmentStatus {
  /** 'default' para `config/credentials.yml.enc`, ou o nome do ambiente. */
  name: string;
  credentialsPath: string;
  credentialsFileExists: boolean;
  keyPath: string;
  keyFileExists: boolean;
  keySource: RailsCredentialsKeySource;
}

export interface RailsCredentialsOverview {
  supported: boolean;
  environments: RailsCredentialsEnvironmentStatus[];
}
