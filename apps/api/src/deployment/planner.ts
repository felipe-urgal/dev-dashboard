import { createHash } from 'node:crypto';

import type {
  DeploymentPlan,
  DeploymentPlanStep,
  ProductionCommandId,
  Project,
} from '@dev-dashboard/contracts';

import { DeploymentError } from './errors.js';
import type { DeploymentRevision } from './revision.js';

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

function step(
  id: ProductionCommandId,
  phase: DeploymentPlanStep['phase'],
  options: { mutating?: boolean; irreversible?: boolean } = {},
): DeploymentPlanStep {
  return {
    id,
    script: SCRIPT_BY_COMMAND[id],
    phase,
    mutating: options.mutating ?? false,
    irreversible: options.irreversible ?? false,
  };
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
    if (production.strategy !== 'command') {
      throw new DeploymentError(
        'DEPLOYMENT_STRATEGY_UNSUPPORTED',
        'Este adapter executa somente contratos strategy=command.',
      );
    }
    if (revision.branch !== production.branch) {
      throw new DeploymentError(
        'DEPLOYMENT_BRANCH_MISMATCH',
        `A produção exige a branch ${production.branch}, mas o projeto está em ${revision.branch}.`,
      );
    }

    const commands = production.commands;
    if (!commands.check || !commands.deploy || !commands.verify) {
      throw new DeploymentError(
        'DEPLOYMENT_PRODUCTION_UNAVAILABLE',
        'O contrato command não possui check, deploy e verify válidos.',
      );
    }

    const steps: DeploymentPlanStep[] = [step('check', 'preparing')];
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
      steps.push(step('backup', 'backing_up'));
    }

    if (production.policies.migrations === 'before-deploy') {
      if (!commands.migrate) {
        throw new DeploymentError(
          'DEPLOYMENT_MIGRATION_COMMAND_REQUIRED',
          'A política exige migração antes do deploy, mas prod:migrate não está disponível.',
        );
      }
      steps.push(
        step('migrate', 'migrating', {
          mutating: true,
          irreversible: true,
        }),
      );
    }

    steps.push(
      step('deploy', 'deploying', {
        mutating: true,
        irreversible: production.policies.migrations === 'startup',
      }),
    );
    steps.push(step('verify', 'verifying'));

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
