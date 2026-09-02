import path from 'node:path';

import type { Project } from '@dev-dashboard/contracts';

const RUBY_CONTEXT_ENV_KEYS = new Set([
  'BUNDLER_VERSION',
  'GEM_HOME',
  'GEM_PATH',
  'GEM_ROOT',
  'MY_RUBY_HOME',
  'RBENV_VERSION',
  'RUBYLIB',
  'RUBYOPT',
  'RUBYGEMS_GEMDEPS',
  'RVM_BIN_PATH',
]);

function isRubyContextEnvironmentKey(key: string): boolean {
  return key.startsWith('BUNDLE_') || RUBY_CONTEXT_ENV_KEYS.has(key);
}

/**
 * Mantém o ambiente operacional da API (PATH, HOME, SSH_AUTH_SOCK etc.), mas
 * impede que um Rails herde a sessão Ruby/Bundler usada para iniciar o Dev
 * Dashboard. Sem isso, um `bin/rspec`/`bin/bundle` pode receber BUNDLE_GEMFILE,
 * GEM_HOME, RUBYOPT e afins de outro projeto e carregar gems/paths errados.
 *
 * Valores definidos explicitamente pelo ambiente local do projeto são
 * preservados, com uma exceção deliberada: BUNDLE_GEMFILE sempre aponta para
 * o Gemfile do projeto selecionado.
 */
export function isolateProjectExecutionEnvironment(
  project: Project,
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...overrides };

  if (project.type !== 'rails') return environment;

  for (const key of Object.keys(process.env)) {
    if (
      isRubyContextEnvironmentKey(key) &&
      !Object.prototype.hasOwnProperty.call(environment, key)
    ) {
      // DetachableExecutionService interpreta `undefined` como "remover do
      // ambiente herdado", em vez de serializar uma string vazia/"undefined".
      environment[key] = undefined;
    }
  }

  environment.BUNDLE_GEMFILE = path.join(project.path, 'Gemfile');
  return environment;
}
