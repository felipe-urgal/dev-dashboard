import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Project } from '@dev-dashboard/contracts';
import { ScriptDetectionService } from '../src/services/script-detection-service.js';

async function fixture(scripts: Record<string, string>): Promise<Project> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dashboard-scripts-'));
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ scripts }),
  );
  return {
    id: path.basename(directory),
    name: 'demo',
    path: directory,
    type: 'node',
    source: 'standalone',
    favorite: false,
    capabilities: ['scripts'],
  };
}

test('cataloga scripts Node sem executar seu conteúdo', async () => {
  const project = await fixture({
    test: 'touch NAO_EXECUTAR',
    'db:drop': 'rm -rf /',
  });
  try {
    const catalog = await new ScriptDetectionService().getCatalog(project);
    assert.deepEqual(
      catalog.items.map((item) => item.name),
      ['db:drop', 'test'],
    );
    assert.equal(catalog.items[0]?.enabled, false);
    assert.equal(
      await import('node:fs/promises').then(({ access }) =>
        access(path.join(project.path, 'NAO_EXECUTAR')).then(
          () => true,
          () => false,
        ),
      ),
      false,
    );
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('aplica filtros e paginação em ordem reproduzível', async () => {
  const project = await fixture({
    lint: 'eslint .',
    test: 'vitest',
    build: 'vite build',
  });
  try {
    const catalog = await new ScriptDetectionService().getCatalog(project, {
      risk: 'read-only',
      page: 2,
      pageSize: 1,
    });
    assert.equal(catalog.total, 2);
    assert.equal(catalog.totalPages, 2);
    assert.equal(catalog.items[0]?.name, 'test');
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('localiza uma ação além da primeira página do catálogo', async () => {
  const scripts = Object.fromEntries(
    Array.from({ length: 101 }, (_, index) => [
      `script-${String(index).padStart(3, '0')}`,
      'echo seguro',
    ]),
  );
  const project = await fixture(scripts);
  try {
    const action = await new ScriptDetectionService().findAction(
      project,
      'package-script:script-100',
    );
    assert.equal(action?.name, 'script-100');
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('inclui apenas executáveis conhecidos de bin', async () => {
  const project = await fixture({});
  try {
    await mkdir(path.join(project.path, 'bin'));
    await writeFile(path.join(project.path, 'bin', 'setup'), '#!/bin/sh');
    await writeFile(
      path.join(project.path, 'bin', 'comando-livre'),
      '#!/bin/sh',
    );
    const catalog = await new ScriptDetectionService().getCatalog(project);
    assert.equal(
      catalog.items.some((item) => item.name === 'bin/setup'),
      true,
    );
    assert.equal(
      catalog.items.some((item) => item.name.includes('comando-livre')),
      false,
    );
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('detecta tasks Rake e variáveis de forma estática sem executar o projeto', async () => {
  const project = await fixture({});
  const rails = path.join(project.path, 'bin', 'rails');
  try {
    project.type = 'rails';
    await mkdir(path.dirname(rails));
    await writeFile(rails, '#!/bin/sh\ntouch NAO_EXECUTAR_RAILS\n');
    await mkdir(path.join(project.path, 'lib', 'tasks'), { recursive: true });
    await writeFile(
      path.join(project.path, 'lib', 'tasks', 'imports.rake'),
      `
namespace :cultural_spaces do
  desc 'Importa espaços culturais de um CSV'
  task import: :environment do
    file_path = ENV['FILE']
    raise 'Use bin/rails cultural_spaces:import FILE=tmp/espacos.csv' if file_path.blank?
    limit = ENV.fetch('LIMIT', 100)
    note = ENV["NOTE"]
  end

  task dynamic: :environment do
    name = 'SECRET'
    puts ENV[name]
  end

  task process_environment: :environment do
    puts ENV['PATH']
  end
end
`,
    );

    const catalog = await new ScriptDetectionService().getCatalog(project);
    const task = catalog.items.find(
      (item) => item.id === 'rails-task:cultural_spaces:import',
    );
    assert.equal(task?.description, 'Importa espaços culturais de um CSV');
    assert.equal(task?.risk, 'mutable');
    assert.equal(
      task?.command,
      'bin/rails cultural_spaces:import FILE=… LIMIT=… NOTE=…',
    );
    assert.deepEqual(task?.variables, [
      { name: 'FILE', required: true, placeholder: 'tmp/espacos.csv' },
      { name: 'LIMIT', required: false, defaultValue: '100' },
      { name: 'NOTE', required: false },
    ]);
    assert.equal(
      catalog.items.some(
        (item) => item.id === 'rails-task:cultural_spaces:dynamic',
      ),
      false,
    );
    assert.equal(
      catalog.items.some(
        (item) => item.id === 'rails-task:cultural_spaces:process_environment',
      ),
      false,
    );
    assert.equal(
      await import('node:fs/promises').then(({ access }) =>
        access(path.join(project.path, 'NAO_EXECUTAR_RAILS')).then(
          () => true,
          () => false,
        ),
      ),
      false,
    );
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});
