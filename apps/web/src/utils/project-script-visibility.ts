import type { Project, ProjectScript } from '@dev-dashboard/contracts';

export type ProjectScriptDestination =
  'catalog' | 'server' | 'tests' | 'database' | 'dependencies' | 'hidden';

const LIFECYCLE_HOOK = /^(?:pre|post).+/;
const SERVER_SCRIPT = /^(?:dev|develop|start|serve|server|watch)(?::|$)/;
const TEST_SCRIPT =
  /^(?:test|tests|spec|specs|vitest|jest|rspec|pytest)(?::|$)/;
const DATABASE_SCRIPT =
  /(?:^|:)(?:db:)?(?:migrate|migration|migrations|rollback)(?::|$)/;

function scriptName(script: ProjectScript): string {
  const name = script.name
    .toLocaleLowerCase('pt-BR')
    .replace(/^(?:npm|pnpm|bun)\s+run\s+/, '')
    .replace(/^yarn\s+/, '')
    .trim();

  if (name) return name;
  return script.command.toLocaleLowerCase('pt-BR').trim();
}

export function projectScriptDestination(
  script: ProjectScript,
  project: Project,
): ProjectScriptDestination {
  if (script.origin === 'bundler' || script.origin === 'package-manager')
    return 'dependencies';

  if (script.origin !== 'package-script') return 'catalog';

  const name = scriptName(script);
  if (LIFECYCLE_HOOK.test(name)) return 'hidden';
  if (script.id === 'package-script:build') return 'dependencies';
  if (project.capabilities.includes('server') && SERVER_SCRIPT.test(name))
    return 'server';
  if (project.capabilities.includes('tests') && TEST_SCRIPT.test(name))
    return 'tests';
  if (project.capabilities.includes('database') && DATABASE_SCRIPT.test(name))
    return 'database';
  return 'catalog';
}

export function isRunnableProjectScript(
  script: ProjectScript,
  project: Project,
): boolean {
  return projectScriptDestination(script, project) === 'catalog';
}
