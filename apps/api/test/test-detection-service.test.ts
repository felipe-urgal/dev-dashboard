import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';

import {
  TestDetectionService,
  TestFileError,
} from '../src/services/test-detection-service.js';

async function makeProject(
  type: Project['type'],
  files: Record<string, string> = {},
): Promise<Project> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dashboard-tests-'));
  for (const [relative, contents] of Object.entries(files)) {
    const filePath = path.join(directory, relative);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }
  return {
    id: path.basename(directory),
    name: 'demo',
    path: directory,
    type,
    source: 'standalone',
    favorite: false,
    enabled: true,
    capabilities: [],
  };
}

test('detects vitest through package.json script', async () => {
  const project = await makeProject('node', {
    'package.json': JSON.stringify({
      name: 'demo',
      scripts: { test: 'vitest run' },
      devDependencies: { vitest: '^1.0.0' },
    }),
  });
  try {
    const overview = await new TestDetectionService().getOverview(project);
    assert.equal(overview.supported, true);
    assert.equal(overview.commands[0]?.runner, 'vitest');
    assert.equal(overview.commands[0]?.origin, 'package-script');
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('returns unsupported for a project without runners', async () => {
  const project = await makeProject('unknown');
  try {
    const overview = await new TestDetectionService().getOverview(project);
    assert.equal(overview.supported, false);
    assert.deepEqual(overview.commands, []);
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('detects rspec from Gemfile', async () => {
  const project = await makeProject('rails', {
    Gemfile: "source 'https://rubygems.org'\ngem 'rails'\ngem 'rspec-rails'\n",
    'spec/spec_helper.rb': '',
  });
  try {
    const overview = await new TestDetectionService().getOverview(project);
    assert.equal(overview.supported, true);
    const rspec = overview.commands.find(
      (command) => command.runner === 'rspec',
    );
    assert.ok(rspec);
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('does not suggest pytest when there is no python signal', async () => {
  const project = await makeProject('node', {
    'pyproject.toml': '[build-system]\nrequires = ["setuptools"]\n',
    'tests/example.test.js': '',
  });
  try {
    const overview = await new TestDetectionService().getOverview(project);
    const pytest = overview.commands.find(
      (command) => command.runner === 'pytest',
    );
    assert.equal(pytest, undefined);
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('suggests pytest when pyproject declares it', async () => {
  const project = await makeProject('unknown', {
    'pyproject.toml': '[tool.pytest.ini_options]\naddopts = "-q"\n',
    'conftest.py': '',
  });
  try {
    const overview = await new TestDetectionService().getOverview(project);
    assert.equal(
      overview.commands.some((command) => command.runner === 'pytest'),
      true,
    );
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('falls back to bundle exec rails test when bin/rails is missing', async () => {
  const project = await makeProject('rails', {
    Gemfile: "gem 'rails'\n",
    'test/models/example_test.rb': '',
  });
  try {
    const overview = await new TestDetectionService().getOverview(project);
    const railsTest = overview.commands.find(
      (command) => command.runner === 'rails-test',
    );
    assert.ok(railsTest);
    assert.equal(railsTest?.label, 'bundle exec rails test');
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('invalidate refreshes the cached detection', async () => {
  const project = await makeProject('node', {
    'package.json': JSON.stringify({ name: 'demo' }),
  });
  try {
    const service = new TestDetectionService();
    const before = await service.getOverview(project);
    assert.equal(before.supported, false);
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      path.join(project.path, 'package.json'),
      JSON.stringify({ name: 'demo', scripts: { test: 'vitest run' } }),
    );
    const cachedStill = await service.getOverview(project);
    assert.equal(cachedStill.supported, false);
    service.invalidate(project.id);
    const fresh = await service.getOverview(project);
    assert.equal(fresh.supported, true);
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('resolveCommand returns null for unknown ids', async () => {
  const project = await makeProject('node', {
    'package.json': JSON.stringify({
      name: 'demo',
      scripts: { test: 'vitest run' },
      devDependencies: { vitest: '^1.0.0' },
    }),
  });
  try {
    const service = new TestDetectionService();
    await service.getOverview(project);
    const resolved = await service.resolveCommand(project, 'does-not-exist');
    assert.equal(resolved, null);
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('overview marca supportsFileTarget de acordo com o runner', async () => {
  const project = await makeProject('node', {
    'package.json': JSON.stringify({
      name: 'demo',
      scripts: { test: 'vitest run' },
      devDependencies: { vitest: '^1.0.0' },
    }),
  });
  try {
    const overview = await new TestDetectionService().getOverview(project);
    assert.equal(overview.commands[0]?.supportsFileTarget, true);
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('listTestFiles encontra arquivos de teste do Vitest ignorando node_modules', async () => {
  const project = await makeProject('node', {
    'package.json': JSON.stringify({
      name: 'demo',
      scripts: { test: 'vitest run' },
      devDependencies: { vitest: '^1.0.0' },
    }),
    'src/app.test.ts': '',
    'src/nested/util.spec.ts': '',
    'node_modules/pacote/pacote.test.ts': '',
  });
  try {
    const service = new TestDetectionService();
    const overview = await service.getOverview(project);
    const commandId = overview.commands[0]!.id;
    const files = await service.listTestFiles(project, commandId);
    const paths = files!.map((file) => file.path).sort();
    assert.deepEqual(paths, ['src/app.test.ts', 'src/nested/util.spec.ts']);
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('listTestFiles retorna null para comando desconhecido', async () => {
  const project = await makeProject('node', {
    'package.json': JSON.stringify({
      name: 'demo',
      scripts: { test: 'vitest run' },
    }),
  });
  try {
    const service = new TestDetectionService();
    await service.getOverview(project);
    const files = await service.listTestFiles(project, 'does-not-exist');
    assert.equal(files, null);
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('resolveFileCommand compõe o comando com "--" para invocação via script npm', async () => {
  const project = await makeProject('node', {
    'package.json': JSON.stringify({
      name: 'demo',
      scripts: { test: 'vitest run' },
      devDependencies: { vitest: '^1.0.0' },
    }),
    'src/app.test.ts': '',
  });
  try {
    const service = new TestDetectionService();
    const overview = await service.getOverview(project);
    const commandId = overview.commands[0]!.id;
    const resolved = await service.resolveFileCommand(
      project,
      commandId,
      'src/app.test.ts',
    );
    assert.deepEqual(resolved, {
      command: 'npm',
      args: ['run', 'test', '--', 'src/app.test.ts'],
    });
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('resolveFileCommand rejeita caminho fora do projeto', async () => {
  const project = await makeProject('node', {
    'package.json': JSON.stringify({
      name: 'demo',
      scripts: { test: 'vitest run' },
      devDependencies: { vitest: '^1.0.0' },
    }),
  });
  try {
    const service = new TestDetectionService();
    const overview = await service.getOverview(project);
    const commandId = overview.commands[0]!.id;
    await assert.rejects(
      () =>
        service.resolveFileCommand(project, commandId, '../outside.test.ts'),
      (error: unknown) =>
        error instanceof TestFileError && error.code === 'TEST_FILE_NOT_FOUND',
    );
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('resolveFileCommand rejeita arquivo que não corresponde ao padrão do runner', async () => {
  const project = await makeProject('node', {
    'package.json': JSON.stringify({
      name: 'demo',
      scripts: { test: 'vitest run' },
      devDependencies: { vitest: '^1.0.0' },
    }),
    'src/app.ts': '',
  });
  try {
    const service = new TestDetectionService();
    const overview = await service.getOverview(project);
    const commandId = overview.commands[0]!.id;
    await assert.rejects(
      () => service.resolveFileCommand(project, commandId, 'src/app.ts'),
      (error: unknown) =>
        error instanceof TestFileError && error.code === 'TEST_FILE_NOT_FOUND',
    );
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('resolveFileCommand compõe o comando do rails-test com o arquivo por último', async () => {
  const project = await makeProject('rails', {
    Gemfile: 'gem "rails"\n',
    'test/models/user_test.rb': '',
  });
  try {
    const service = new TestDetectionService();
    const overview = await service.getOverview(project);
    const railsTest = overview.commands.find(
      (command) => command.runner === 'rails-test',
    );
    assert.ok(railsTest, 'esperava reconhecer o comando rails-test');
    const resolved = await service.resolveFileCommand(
      project,
      railsTest!.id,
      'test/models/user_test.rb',
    );
    assert.deepEqual(resolved, {
      command: 'bundle',
      args: ['exec', 'rails', 'test', 'test/models/user_test.rb'],
    });
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('resolveFileCommand rejeita runner sem suporte a arquivo específico', async () => {
  const project = await makeProject('rails', {
    Gemfile: 'gem "sinatra"\n',
    'test/models/user_test.rb': '',
  });
  try {
    const service = new TestDetectionService();
    const overview = await service.getOverview(project);
    const minitest = overview.commands.find(
      (command) => command.runner === 'minitest',
    );
    assert.ok(minitest, 'esperava reconhecer o comando minitest');
    assert.equal(minitest!.supportsFileTarget, false);
    await assert.rejects(
      () =>
        service.resolveFileCommand(
          project,
          minitest!.id,
          'test/models/user_test.rb',
        ),
      (error: unknown) =>
        error instanceof TestFileError &&
        error.code === 'TEST_FILE_TARGET_UNSUPPORTED',
    );
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('overview marca supportsCaseTarget só para rspec', async () => {
  const project = await makeProject('rails', {
    Gemfile: "source 'https://rubygems.org'\ngem 'rails'\ngem 'rspec-rails'\n",
    'spec/spec_helper.rb': '',
  });
  try {
    const overview = await new TestDetectionService().getOverview(project);
    const rspec = overview.commands.find(
      (command) => command.runner === 'rspec',
    );
    assert.ok(rspec);
    assert.equal(rspec.supportsCaseTarget, true);
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('resolveFileCommand com linha compõe "arquivo:linha" para rspec', async () => {
  const project = await makeProject('rails', {
    Gemfile: "source 'https://rubygems.org'\ngem 'rails'\ngem 'rspec-rails'\n",
    'spec/models/user_spec.rb': '',
  });
  try {
    const service = new TestDetectionService();
    const overview = await service.getOverview(project);
    const rspec = overview.commands.find(
      (command) => command.runner === 'rspec',
    );
    assert.ok(rspec);
    const resolved = await service.resolveFileCommand(
      project,
      rspec.id,
      'spec/models/user_spec.rb',
      42,
    );
    assert.deepEqual(resolved!.args.at(-1), 'spec/models/user_spec.rb:42');
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('resolveFileCommand rejeita linha para runner sem suporte a caso específico', async () => {
  const project = await makeProject('node', {
    'package.json': JSON.stringify({
      name: 'demo',
      scripts: { test: 'vitest run' },
      devDependencies: { vitest: '^1.0.0' },
    }),
    'src/app.test.ts': '',
  });
  try {
    const service = new TestDetectionService();
    const overview = await service.getOverview(project);
    const commandId = overview.commands[0]!.id;
    assert.equal(overview.commands[0]!.supportsCaseTarget, false);
    await assert.rejects(
      () =>
        service.resolveFileCommand(project, commandId, 'src/app.test.ts', 10),
      (error: unknown) =>
        error instanceof TestFileError &&
        error.code === 'TEST_CASE_TARGET_UNSUPPORTED',
    );
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('overview marca supportsNamePatternTarget para vitest/jest/node-test, não rspec', async () => {
  const nodeProject = await makeProject('node', {
    'package.json': JSON.stringify({
      name: 'demo',
      scripts: { test: 'vitest run' },
      devDependencies: { vitest: '^1.0.0' },
    }),
    'src/app.test.ts': '',
  });
  const railsProject = await makeProject('rails', {
    Gemfile: "source 'https://rubygems.org'\ngem 'rails'\ngem 'rspec-rails'\n",
    'spec/spec_helper.rb': '',
  });
  try {
    const service = new TestDetectionService();
    const nodeOverview = await service.getOverview(nodeProject);
    assert.equal(nodeOverview.commands[0]!.supportsNamePatternTarget, true);

    const railsOverview = await service.getOverview(railsProject);
    const rspec = railsOverview.commands.find(
      (command) => command.runner === 'rspec',
    );
    assert.ok(rspec);
    assert.equal(rspec.supportsNamePatternTarget, false);
  } finally {
    await rm(nodeProject.path, { recursive: true, force: true });
    await rm(railsProject.path, { recursive: true, force: true });
  }
});

test('resolveFileCommand com namePattern acrescenta -t para vitest', async () => {
  const project = await makeProject('node', {
    'package.json': JSON.stringify({
      name: 'demo',
      scripts: { test: 'vitest run' },
      devDependencies: { vitest: '^1.0.0' },
    }),
    'src/app.test.ts': '',
  });
  try {
    const service = new TestDetectionService();
    const overview = await service.getOverview(project);
    const commandId = overview.commands[0]!.id;
    const resolved = await service.resolveFileCommand(
      project,
      commandId,
      'src/app.test.ts',
      undefined,
      'soma valores',
    );
    assert.deepEqual(resolved!.args.slice(-3), [
      'src/app.test.ts',
      '-t',
      'soma valores',
    ]);
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('resolveFileCommand com namePattern acrescenta --test-name-pattern para node-test', async () => {
  const project = await makeProject('node', {
    'package.json': JSON.stringify({
      name: 'demo',
      scripts: { test: 'node --test' },
    }),
    'src/app.test.ts': '',
  });
  try {
    const service = new TestDetectionService();
    const overview = await service.getOverview(project);
    const commandId = overview.commands[0]!.id;
    assert.equal(overview.commands[0]!.runner, 'node-test');
    const resolved = await service.resolveFileCommand(
      project,
      commandId,
      'src/app.test.ts',
      undefined,
      'soma valores',
    );
    assert.deepEqual(resolved!.args.slice(-3), [
      'src/app.test.ts',
      '--test-name-pattern',
      'soma valores',
    ]);
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});

test('resolveFileCommand rejeita namePattern para runner sem suporte', async () => {
  const project = await makeProject('rails', {
    Gemfile: "source 'https://rubygems.org'\ngem 'rails'\ngem 'rspec-rails'\n",
    'spec/models/user_spec.rb': '',
  });
  try {
    const service = new TestDetectionService();
    const overview = await service.getOverview(project);
    const rspec = overview.commands.find(
      (command) => command.runner === 'rspec',
    );
    assert.ok(rspec);
    await assert.rejects(
      () =>
        service.resolveFileCommand(
          project,
          rspec.id,
          'spec/models/user_spec.rb',
          undefined,
          'soma valores',
        ),
      (error: unknown) =>
        error instanceof TestFileError &&
        error.code === 'TEST_NAME_PATTERN_UNSUPPORTED',
    );
  } finally {
    await rm(project.path, { recursive: true, force: true });
  }
});
