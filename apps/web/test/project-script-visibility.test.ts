import assert from 'node:assert/strict';
import { test } from 'vitest';

import type { ProjectScript } from '@dev-dashboard/contracts';

import { makeProject } from './support/activity-fixtures.js';
import { projectScriptDestination } from '../src/utils/project-script-visibility';

function script(name: string, origin: ProjectScript['origin'] = 'package-script'): ProjectScript {
  return {
    id: name,
    name,
    description: name,
    command: `npm run ${name}`,
    origin,
    risk: 'read-only',
    enabled: true,
  };
}

test('direciona comandos já atendidos por áreas especializadas', () => {
  const project = makeProject({ capabilities: ['scripts', 'server', 'tests', 'database'] });

  assert.equal(projectScriptDestination(script('dev'), project), 'server');
  assert.equal(projectScriptDestination(script('test:unit'), project), 'tests');
  assert.equal(projectScriptDestination(script('db:migrate'), project), 'database');
  assert.equal(projectScriptDestination(script('postbuild'), project), 'hidden');
});

test('preserva tarefas explícitas e scripts sem área especializada', () => {
  const completeProject = makeProject({ capabilities: ['scripts', 'server', 'tests'] });
  const scriptsOnlyProject = makeProject({ capabilities: ['scripts'] });

  assert.equal(projectScriptDestination(script('build'), completeProject), 'catalog');
  assert.equal(projectScriptDestination(script('lint'), completeProject), 'catalog');
  assert.equal(projectScriptDestination(script('test'), scriptsOnlyProject), 'catalog');
  assert.equal(projectScriptDestination(script('maintenance', 'rails-task'), completeProject), 'catalog');
});
