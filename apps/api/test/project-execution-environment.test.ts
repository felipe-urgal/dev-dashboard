import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { isolateProjectExecutionEnvironment } from '../src/security/project-execution-environment.js';
import { DetachableExecutionService } from '../src/services/detachable-execution-service.js';

function railsProject(): Project {
  return {
    id: 'rails-project',
    name: 'Rails project',
    path: '/tmp/rails-project',
    type: 'rails',
    source: 'standalone',
    enabled: true,
    capabilities: ['tests', 'bundler'],
  };
}

test('Rails não herda contexto Ruby/Bundler da API e fixa o Gemfile do projeto', (t) => {
  const keys = [
    'BUNDLE_GEMFILE',
    'BUNDLE_BIN_PATH',
    'BUNDLE_WITHOUT',
    'BUNDLER_VERSION',
    'GEM_HOME',
    'GEM_PATH',
    'RBENV_VERSION',
    'RUBYLIB',
    'RUBYOPT',
    'PROJECT_EXECUTION_KEEP',
  ];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.BUNDLE_GEMFILE = '/tmp/outro-projeto/Gemfile';
  process.env.BUNDLE_BIN_PATH = '/tmp/outro-projeto/bin/bundle';
  process.env.BUNDLE_WITHOUT = 'development';
  process.env.BUNDLER_VERSION = '9.9.9';
  process.env.GEM_HOME = '/tmp/outro-projeto/gems';
  process.env.GEM_PATH = '/tmp/outro-projeto/gems';
  process.env.RBENV_VERSION = '2.7.0';
  process.env.RUBYLIB = '/tmp/outro-projeto/lib';
  process.env.RUBYOPT = '-r/tmp/outro-projeto/boot.rb';
  process.env.PROJECT_EXECUTION_KEEP = 'preservado';

  const project = railsProject();
  const environment = isolateProjectExecutionEnvironment(project);

  assert.equal(
    environment.BUNDLE_GEMFILE,
    path.join(project.path, 'Gemfile'),
  );
  assert.equal(environment.BUNDLE_BIN_PATH, undefined);
  assert.equal(environment.BUNDLE_WITHOUT, undefined);
  assert.equal(environment.BUNDLER_VERSION, undefined);
  assert.equal(environment.GEM_HOME, undefined);
  assert.equal(environment.GEM_PATH, undefined);
  assert.equal(environment.RBENV_VERSION, undefined);
  assert.equal(environment.RUBYLIB, undefined);
  assert.equal(environment.RUBYOPT, undefined);

  let spawnedEnvironment: NodeJS.ProcessEnv | undefined;
  const fakePty = {
    onData: () => ({ dispose() {} }),
    onExit: () => ({ dispose() {} }),
    kill() {},
  } as never;
  const detachable = new DetachableExecutionService({
    spawnPty: (_file, _args, options) => {
      spawnedEnvironment = options.env;
      return fakePty;
    },
  });

  detachable.start('rails-project:test', {
    file: 'bin/rspec',
    args: [],
    cwd: project.path,
    env: environment,
  });

  assert.equal(
    spawnedEnvironment?.BUNDLE_GEMFILE,
    path.join(project.path, 'Gemfile'),
  );
  assert.equal(spawnedEnvironment?.BUNDLE_BIN_PATH, undefined);
  assert.equal(spawnedEnvironment?.GEM_HOME, undefined);
  assert.equal(spawnedEnvironment?.RUBYOPT, undefined);
  assert.equal(spawnedEnvironment?.PROJECT_EXECUTION_KEEP, 'preservado');
  assert.equal(spawnedEnvironment?.TERM, 'xterm-256color');
});

test('override explícito do projeto é preservado, exceto BUNDLE_GEMFILE', () => {
  const project = railsProject();
  const environment = isolateProjectExecutionEnvironment(project, {
    GEM_HOME: '/tmp/rails-project/.gems',
    BUNDLE_WITHOUT: 'production',
    BUNDLE_GEMFILE: '/tmp/nao-usar/Gemfile',
  });

  assert.equal(environment.GEM_HOME, '/tmp/rails-project/.gems');
  assert.equal(environment.BUNDLE_WITHOUT, 'production');
  assert.equal(
    environment.BUNDLE_GEMFILE,
    path.join(project.path, 'Gemfile'),
  );
});
