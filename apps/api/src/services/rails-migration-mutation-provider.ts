import type {
  MigrationMutationPlanContext,
  MigrationMutationProvider,
  MigrationMutationProviderPlan,
} from './migration-mutation-provider.js';
import {
  RailsMigrationProvider,
  type RailsMigrationsInspector,
} from './rails-migration-provider.js';
import { resolveRailsCommand } from './rails-inspection/command-resolution.js';
import { MUTATION_ARGS } from './rails-inspection/constants.js';
import { listDatabases } from './rails-inspection/databases.js';

export class RailsMigrationMutationProvider
  extends RailsMigrationProvider
  implements MigrationMutationProvider
{
  public constructor(inspector: RailsMigrationsInspector) {
    super(inspector);
  }

  public async planMutation(
    context: MigrationMutationPlanContext,
  ): Promise<MigrationMutationProviderPlan> {
    if (!this.supports(context.project)) {
      throw new Error('Provider Rails não se aplica a este projeto.');
    }
    if (context.operation !== 'apply') {
      throw new Error(
        'Operação de migration não suportada pelo provider Rails.',
      );
    }
    if (context.database !== 'primary') {
      throw new Error(
        'Mutation Rails por database secundário ainda não possui comando explícito.',
      );
    }

    const databases = await listDatabases(context.project);
    if (databases.length !== 1 || databases[0] !== 'primary') {
      throw new Error(
        'Projetos Rails multi-database permanecem bloqueados neste primeiro adapter.',
      );
    }

    const railsCommand = await resolveRailsCommand(context.project);
    if (!railsCommand) {
      throw new Error('Comando Rails não pôde ser resolvido.');
    }

    return {
      command: {
        file: railsCommand.command,
        args: [...railsCommand.args, ...MUTATION_ARGS.migrate],
      },
    };
  }
}
