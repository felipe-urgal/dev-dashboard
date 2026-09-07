import type { Project } from '@dev-dashboard/contracts';

import type {
  MigrationOverview,
  MigrationProvider,
} from './migration-provider.js';

const SAFE_DATABASE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

export interface MigrationOverviewServiceOptions {
  now?: () => Date;
}

function databaseIdentity(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized && SAFE_DATABASE_ID.test(normalized)
    ? normalized
    : 'primary';
}

function unavailableOverview(
  provider: string,
  database: string | undefined,
  now: () => Date,
  warning: string,
): MigrationOverview {
  return {
    provider,
    status: 'unavailable',
    database: databaseIdentity(database),
    applied: [],
    pending: [],
    observedAt: now().toISOString(),
    evidence: 'Inspeção de migrations indisponível.',
    warnings: [warning],
  };
}

export class MigrationOverviewService {
  private readonly now: () => Date;

  public constructor(
    private readonly providers: readonly MigrationProvider[],
    options: MigrationOverviewServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  public async inspect(
    project: Project,
    database?: string,
  ): Promise<MigrationOverview> {
    let provider: MigrationProvider | undefined;

    for (const candidate of this.providers) {
      try {
        if (candidate.supports(project)) {
          provider = candidate;
          break;
        }
      } catch {
        // Providers custom são extensões confiáveis, mas não podem derrubar a superfície comum.
      }
    }

    if (!provider) {
      return unavailableOverview(
        'none',
        database,
        this.now,
        'Nenhum Migration Provider compatível foi encontrado para este projeto.',
      );
    }

    try {
      return await provider.inspect({
        project,
        database: databaseIdentity(database),
        now: this.now,
      });
    } catch {
      return unavailableOverview(
        provider.id,
        database,
        this.now,
        'O Migration Provider falhou durante a inspeção. O erro foi omitido por segurança.',
      );
    }
  }
}
