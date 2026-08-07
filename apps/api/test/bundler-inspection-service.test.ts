import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { Project } from '@dev-dashboard/contracts';
import { BundlerInspectionService } from '../src/services/bundler-inspection-service.js';

async function fixture(
  files: Record<string, string>,
  type: Project['type'] = 'rails',
): Promise<Project> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'bundler-inspection-'));
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  return {
    id: 'projeto',
    name: 'Projeto',
    path: root,
    type,
    source: 'standalone',
    favorite: false,
    enabled: true,
    capabilities: [],
  };
}

const OUTDATED_OUTPUT = `Fetching gem metadata from https://rubygems.org/........
Resolving dependencies...

Outdated gems included in the bundle:
  * puma (newest 6.4.2, installed 6.4.0, requested ~> 6.4)
  * rails (newest 7.1.3.2, installed 7.1.3.2)
`;

test('reporta bundle check satisfeito e nenhuma gem desatualizada', async () => {
  const project = await fixture({ Gemfile: 'gem "rails"\n' });
  const calls: string[][] = [];
  const service = new BundlerInspectionService(async (command, args) => {
    calls.push(args);
    if (args[0] === 'check')
      return { stdout: "The Gemfile's dependencies are satisfied\n" };
    return { stdout: 'Bundle up to date!\n' };
  });

  const overview = await service.getOverview(project);
  assert.equal(overview.supported, true);
  assert.equal(overview.check?.satisfied, true);
  assert.deepEqual(overview.outdated, []);
  assert.deepEqual(calls, [['check'], ['outdated']]);
});

test('analisa gems desatualizadas com e sem versão requisitada', async () => {
  const project = await fixture({ Gemfile: 'gem "rails"\n' });
  const service = new BundlerInspectionService(async (_command, args) => {
    if (args[0] === 'check')
      return { stdout: "The Gemfile's dependencies are satisfied\n" };
    return { stdout: OUTDATED_OUTPUT };
  });

  const overview = await service.getOverview(project);
  assert.deepEqual(overview.outdated, [
    { name: 'puma', installed: '6.4.0', newest: '6.4.2', requested: '~> 6.4' },
    { name: 'rails', installed: '7.1.3.2', newest: '7.1.3.2' },
  ]);
});

test('bundle check insatisfeito é reportado com a mensagem capturada', async () => {
  const project = await fixture({ Gemfile: 'gem "rails"\n' });
  const service = new BundlerInspectionService(async (_command, args) => {
    if (args[0] === 'check') {
      throw Object.assign(new Error('exit 1'), {
        stdout: 'The following gems are missing\n * rails (7.1.3)\n',
        stderr: '',
      });
    }
    return { stdout: 'Bundle up to date!\n' };
  });

  const overview = await service.getOverview(project);
  assert.equal(overview.check?.satisfied, false);
  assert.match(overview.check?.message ?? '', /missing/);
});

test('bundle outdated com exit code != 0 ainda é parseado normalmente', async () => {
  const project = await fixture({ Gemfile: 'gem "rails"\n' });
  const service = new BundlerInspectionService(async (_command, args) => {
    if (args[0] === 'check')
      return { stdout: "The Gemfile's dependencies are satisfied\n" };
    throw Object.assign(new Error('exit 1'), {
      stdout: OUTDATED_OUTPUT,
      stderr: '',
    });
  });

  const overview = await service.getOverview(project);
  assert.equal(overview.outdated.length, 2);
});

test('projeto sem Gemfile não é suportado', async () => {
  const project = await fixture({ 'package.json': '{}' }, 'node');
  const service = new BundlerInspectionService(async () =>
    assert.fail('não deveria executar comandos'),
  );

  assert.deepEqual(await service.getOverview(project), {
    supported: false,
    outdated: [],
  });
});

test('projeto Rails sem Gemfile fica sem suporte', async () => {
  const project = await fixture({});
  const service = new BundlerInspectionService(async () =>
    assert.fail('não deveria executar comandos'),
  );

  assert.deepEqual(await service.getOverview(project), {
    supported: false,
    outdated: [],
  });
});

test('mascara segredos na mensagem de bundle check', async () => {
  const project = await fixture({ Gemfile: 'gem "rails"\n' });
  const service = new BundlerInspectionService(async (_command, args) => {
    if (args[0] === 'check') {
      throw Object.assign(new Error('exit 1'), {
        stdout: '',
        stderr: 'Could not fetch from https://user:senha@gems.example.com/\n',
      });
    }
    return { stdout: '' };
  });

  const overview = await service.getOverview(project);
  assert.equal(overview.check?.satisfied, false);
  assert.doesNotMatch(overview.check?.message ?? '', /senha/);
});
