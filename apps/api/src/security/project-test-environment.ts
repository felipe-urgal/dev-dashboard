import type { Project } from '@dev-dashboard/contracts';

import { isolateProjectExecutionEnvironment } from './project-execution-environment.js';

function hasOwnEnvironmentKey(
  environment: NodeJS.ProcessEnv,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(environment, key);
}

/**
 * Monta o ambiente usado exclusivamente pela aba Testes.
 *
 * Projetos Node mantêm a política já existente. Rails recebe um contexto de
 * teste determinístico para não herdar RAILS_ENV, RACK_ENV, CI ou DATABASE_URL
 * do processo que iniciou o Dev Dashboard. Valores de CI e banco continuam
 * disponíveis quando o próprio projeto os declara em `.env.check.local`.
 */
export function buildProjectTestEnvironment(
  project: Project,
  localEnvironment: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const checkDatabaseUrl = localEnvironment.CHECK_DATABASE_URL?.trim();
  const databaseUrl = checkDatabaseUrl
    ? checkDatabaseUrl
    : project.type === 'rails'
      ? undefined
      : '';

  const environment: NodeJS.ProcessEnv = {
    ...localEnvironment,
    DATABASE_URL: databaseUrl,
    // Credenciais do provider pertencem ao Dev Dashboard e não ao processo
    // de testes do projeto alvo.
    VERCEL_TOKEN: '',
    VERCEL_TEAM_ID: '',
  };

  if (project.type === 'rails') {
    environment.RAILS_ENV = 'test';
    environment.RACK_ENV = 'test';

    if (!hasOwnEnvironmentKey(localEnvironment, 'CI')) {
      environment.CI = undefined;
    }
  }

  return isolateProjectExecutionEnvironment(project, environment);
}
