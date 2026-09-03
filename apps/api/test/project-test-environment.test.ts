import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import { buildProjectTestEnvironment } from '../src/security/project-test-environment.js';

function project(type: Project['type']): Project {
  return {
    id: `${type}-project`,
    name: `${type} project`,
    path: `/tmp/${type}-project`,
    type,
    source: 'standalone',
    enabled: true,
    capabilities: type === 'rails' ? ['tests', 'bundler'] : ['tests', 'npm'],
  };
}

test('Rails usa ambiente de teste determinístico sem herdar CI ou banco da API', (t) => {
  const keys = [
    'CI',
    'DATABASE_URL',
    'RAILS_ENV',
    'RACK_ENV',
    'BUNDLE_GEMFILE',
    'GEM_HOME',
    'RUBYOPT',
  ];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));

  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.CI = 'true';
  process.env.DATABASE_URL = 'postgres://dashboard';
  process.env.RAILS_ENV = 'production';
  process.env.RACK_ENV = 'production';
  process.env.BUNDLE_GEMFILE = '/tmp/outro-projeto/Gemfile';
  process.env.GEM_HOME = '/tmp/outro-projeto/gems';
  process.env.RUBYOPT = '-r/tmp/outro-projeto/boot.rb';

  const rails = project('rails');
  const environment = buildProjectTestEnvironment(rails);

  assert.equal(environment.RAILS_ENV, 'test');
  assert.equal(environment.RACK_ENV, 'test');
  assert.equal(environment.CI, undefined);
  assert.equal(environment.DATABASE_URL, undefined);
  assert.equal(environment.BUNDLE_GEMFILE, path.join(rails.path, 'Gemfile'));
  assert.equal(environment.GEM_HOME, undefined);
  assert.equal(environment.RUBYOPT, undefined);
});

test('Rails preserva CI explícito do projeto e promove CHECK_DATABASE_URL', () => {
  const rails = project('rails');
  const environment = buildProjectTestEnvironment(rails, {
    CI: 'true',
    CHECK_DATABASE_URL: '  postgres://check  ',
    RAILS_ENV: 'production',
    RACK_ENV: 'production',
  });

  assert.equal(environment.CI, 'true');
  assert.equal(environment.DATABASE_URL, 'postgres://check');
  assert.equal(environment.RAILS_ENV, 'test');
  assert.equal(environment.RACK_ENV, 'test');
});

test('Rails trata CHECK_DATABASE_URL vazio como banco não configurado', () => {
  const environment = buildProjectTestEnvironment(project('rails'), {
    CHECK_DATABASE_URL: '   ',
  });

  assert.equal(environment.DATABASE_URL, undefined);
});

test('Node mantém a política atual da aba Testes', () => {
  const environment = buildProjectTestEnvironment(project('node'));

  assert.equal(environment.DATABASE_URL, '');
  assert.equal(environment.RAILS_ENV, undefined);
  assert.equal(environment.RACK_ENV, undefined);
  assert.equal(environment.CI, undefined);
  assert.equal(environment.VERCEL_TOKEN, '');
  assert.equal(environment.VERCEL_TEAM_ID, '');
});
