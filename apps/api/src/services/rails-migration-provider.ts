import type {
  Project,
  RailsMigrationsOverview,
} from '@dev-dashboard/contracts';

import type {
  MigrationInspectionContext,
  MigrationOverview,
  MigrationProvider,
} from './migration-provider.js';

export interface RailsMigrationsInspector {
  getMigrationsOverview(
    project: Project,
    database?: string,
  ): Promise<RailsMigrationsOverview>;
}

export class RailsMigrationProvider implements MigrationProvider {
  public readonly id = 'rails';

  public constructor(private readonly inspector: RailsMigrationsInspector) {}

  public supports(project: Project): boolean {
    return project.type === 'rails';
  }

  public async inspect(
    context: MigrationInspectionContext,
  ): Promise<MigrationOverview> {
    const observedAt = (context.now ?? (() => new Date()))().toISOString();
    const database = context.database?.trim() || 'primary';

    if (!this.supports(context.project)) {
      return {
        provider: this.id,
        status: 'unavailable',
        database,
        applied: [],
        pending: [],
        observedAt,
        evidence: 'Projeto não é Rails.',
        warnings: ['O provider Rails não se aplica a este projeto.'],
      };
    }

    const overview = await this.inspector.getMigrationsOverview(
      context.project,
      database,
    );
    const selectedDatabase = overview.database ?? database;

    if (!overview.supported) {
      return {
        provider: this.id,
        status: 'unavailable',
        database: selectedDatabase,
        applied: [],
        pending: [],
        observedAt,
        evidence: 'Rails db:migrate:status não pôde ser inspecionado.',
        warnings: [
          'A indisponibilidade da inspeção não equivale a zero migrations pendentes.',
        ],
      };
    }

    const applied = overview.migrations
      .filter((migration) => migration.status === 'up')
      .map((migration) => ({ id: migration.version, name: migration.name }));
    const pending = overview.migrations
      .filter((migration) => migration.status === 'down')
      .map((migration) => ({ id: migration.version, name: migration.name }));

    return {
      provider: this.id,
      status: pending.length > 0 ? 'pending' : 'up-to-date',
      database: selectedDatabase,
      applied,
      pending,
      observedAt,
      evidence: 'Rails db:migrate:status',
      warnings: [],
    };
  }
}
