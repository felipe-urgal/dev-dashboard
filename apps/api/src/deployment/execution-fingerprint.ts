import { createHash } from 'node:crypto';

import type { Project } from '@dev-dashboard/contracts';

import {
  loadProjectLocalEnvironment,
  ProjectLocalEnvironmentError,
  type ProjectLocalEnvironmentKind,
} from '../security/project-local-environment.js';
import { DeploymentError } from './errors.js';

export interface DeploymentExecutionFingerprintResolver {
  resolve(project: Project): Promise<string>;
}

function stableEnvironment(
  environment: NodeJS.ProcessEnv,
): Array<[string, string]> {
  return Object.entries(environment)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .sort(([left], [right]) => left.localeCompare(right));
}

export class ProjectLocalEnvironmentFingerprintResolver implements DeploymentExecutionFingerprintResolver {
  public async resolve(project: Project): Promise<string> {
    const production = project.production;
    const kinds: ProjectLocalEnvironmentKind[] =
      production?.strategy === 'self-update'
        ? ['check']
        : ['check', 'production'];

    try {
      const environments = await Promise.all(
        kinds.map(async (kind) => ({
          kind,
          values: stableEnvironment(
            await loadProjectLocalEnvironment(project.path, kind),
          ),
        })),
      );
      return createHash('sha256')
        .update(JSON.stringify(environments))
        .digest('hex');
    } catch (error) {
      if (error instanceof ProjectLocalEnvironmentError) {
        throw new DeploymentError(
          'DEPLOYMENT_PRODUCTION_UNAVAILABLE',
          'Não foi possível validar os arquivos locais de ambiente antes do deployment.',
        );
      }
      throw error;
    }
  }
}
