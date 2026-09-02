import { createHash } from 'node:crypto';

import type {
  DeploymentCommandPlanStep,
  DeploymentPlan,
  DeploymentPlanStep,
  DeploymentProviderPlanStep,
  ProductionCommandId,
  Project,
} from '@dev-dashboard/contracts';

import { DeploymentError } from './errors.js';
import type { DeploymentRevision } from './revision.js';

type DeploymentProviderTarget = DeploymentProviderPlanStep['target'];

const SCRIPT_BY_COMMAND = {
  status: 'prod:status',
  check: 'prod:check',
  backup: 'prod:backup',
  migrate: 'prod:migrate',
  deploy: 'prod:deploy',
  verify: 'prod:verify',
  restoreCheck: 'prod:restore-check',
  rollback: 'prod:rollback',
  logs: 'prod:logs',
} as const satisfies Record<ProductionCommandId, string>;

function commandStep(
  id: ProductionCommandId,
  phase: DeploymentCommandPlanStep['phase'],
  options: {
    mutating?: boolean;
    irreversible?: boolean;
    prepareScript?: 'prod:prepare';
    providerPreflight?: DeploymentProviderTarget;
  } = {},
): DeploymentCommandPlanStep {
  return {
    id,
    script: SCRIPT_BY_COMMAND[id],
    phase,
    mutating: options.mutating ?? false,
    irreversible: options.irreversible ?? false,
    ...(options.prepareScript ? { prepareScript: options.prepareScript } : {}),
    ...(options.providerPreflight
      ? { providerPreflight: options.providerPreflight }
      : {}),
  };
}

function addPreDeploySteps(
  project: Project,
  steps: DeploymentPlanStep[],
  providerPreflight?: DeploymentProviderTarget,
): void {
  const production = project.production!;
  const commands = production.commands;
  const requiresBackup =
    production.policies.backup === 'required-before-deploy' ||
    production.policies.backup === 'required-before-migration';

  if (requiresBackup) {
    if (!commands.backup) {
      throw new DeploymentError(
        'DEPLOYMENT_BACKUP_REQUIRED',
        'A política de produção exige backup, mas prod:backup não está disponível.',
      );
    }
    steps.push(
      commandStep('backup', 'backing_up', {
        ...(providerPreflight ? { providerPreflight } : {}),
      }),
    );
  }

  if (production.policies.migrations === 'before-deploy') {
    if (!commands.migrate) {
      throw new DeploymentError(
        'DEPLOYMENT_MIGRATION_COMMAND_REQUIRED',
        'A política exige migração antes do deploy, mas prod:migrate não está disponível.',
      );
    }
    steps.push(
      commandStep('migrate', 'migrating', {
        mutating: true,
        irreversible: true,
        ...(providerPreflight ? { providerPreflight } : {}),
      }),
    );
  }
}

export class DeploymentPlanner {
  public constructor(private readonly now: () => number = Date.now) {}

  public build(project: Project, revision: DeploymentRevision): DeploymentPlan {
    const production = project.production;
    if (!production?.enabled || !project.capabilities.includes('production')) {
      throw new DeploymentError(
        'DEPLOYMENT_PRODUCTION_UNAVAILABLE',
        'O projeto não possui produção habilitada e válida.',
      );
    }
    if (revision.branch !== production.branch) {
      throw new DeploymentError(
        'DEPLOYMENT_BRANCH_MISMATCH',
        `A produção exige a branch ${production.branch}, mas o projeto está em ${revision.branch}.`,
      );
    }

    const commands = production.commands;
    const steps: DeploymentPlanStep[] = [];

    if (production.strategy === 'command') {
      if (!commands.check || !commands.deploy || !commands.verify) {
        throw new DeploymentError(
          'DEPLOYMENT_PRODUCTION_UNAVAILABLE',
          'O contrato command não possui check, deploy e verify válidos.',
        );
      }

      steps.push(
        commandStep('check', 'preparing', {
          ...(commands.prepare ? { prepareScript: commands.prepare } : {}),
        }),
      );
      addPreDeploySteps(project, steps);
      steps.push(
        commandStep('deploy', 'deploying', {
          mutating: true,
          irreversible: production.policies.migrations === 'startup',
        }),
      );
      steps.push(commandStep('verify', 'verifying'));
    } else if (production.strategy === 'git-managed') {
      if (
        production.provider !== 'vercel' ||
        !production.external?.project ||
        !commands.check ||
        !commands.verify ||
        commands.deploy
      ) {
        throw new DeploymentError(
          'DEPLOYMENT_PRODUCTION_UNAVAILABLE',
          'O contrato git-managed/Vercel precisa declarar external.project, check/verify e não pode declarar prod:deploy local.',
        );
      }

      const target: DeploymentProviderTarget = {
        externalProject: production.external.project,
        branch: production.branch,
        revision: revision.revision,
      };

      steps.push(
        commandStep('check', 'preparing', {
          ...(commands.prepare ? { prepareScript: commands.prepare } : {}),
          providerPreflight: target,
        }),
      );
      addPreDeploySteps(project, steps, target);
      steps.push({
        id: 'provider-deploy',
        phase: 'deploying',
        mutating: true,
        irreversible: true,
        target,
      });
      steps.push(commandStep('verify', 'verifying'));
    } else {
      throw new DeploymentError(
        'DEPLOYMENT_STRATEGY_UNSUPPORTED',
        'A estratégia de produção não possui executor de deployment.',
      );
    }

    const hashPayload = {
      projectId: project.id,
      provider: production.provider,
      branch: production.branch,
      revision: revision.revision,
      steps,
    };
    const planHash = createHash('sha256')
      .update(JSON.stringify(hashPayload))
      .digest('hex');

    return {
      projectId: project.id,
      projectName: project.name,
      provider: production.provider,
      branch: production.branch,
      revision: revision.revision,
      planHash,
      createdAt: new Date(this.now()).toISOString(),
      steps,
    };
  }
}
