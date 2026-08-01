import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Project } from '@dev-dashboard/contracts';

import { pathExists } from './fs-helpers.js';
import type { DetectedTestCommand } from './types.js';

export async function detectRailsCommands(
  project: Project,
): Promise<DetectedTestCommand[]> {
  const commands: DetectedTestCommand[] = [];
  const gemfilePath = path.join(project.path, 'Gemfile');
  let gemfile = '';

  try {
    gemfile = await readFile(gemfilePath, 'utf8');
  } catch {
    // sem Gemfile — não é Rails
    return commands;
  }

  const hasRspec = /gem\s+["']rspec/i.test(gemfile);
  const hasRails = /gem\s+["']rails/i.test(gemfile);
  const binRailsExists = await pathExists(
    path.join(project.path, 'bin', 'rails'),
  );
  const binRspecExists = await pathExists(
    path.join(project.path, 'bin', 'rspec'),
  );
  const hasSpecDir = await pathExists(
    path.join(project.path, 'spec'),
  );
  const hasTestDir = await pathExists(
    path.join(project.path, 'test'),
  );

  if (hasRspec || binRspecExists || hasSpecDir) {
    commands.push({
      id: 'rails-rspec',
      runner: 'rspec',
      label: binRspecExists ? 'bin/rspec' : 'bundle exec rspec',
      description: 'Executa a suíte completa do RSpec.',
      origin: binRspecExists ? 'binary' : hasSpecDir ? 'directory' : 'gemfile',
      originDetail: binRspecExists
        ? 'bin/rspec'
        : hasSpecDir
          ? 'spec/'
          : 'Gemfile',
      priority: 10,
      resolved: binRspecExists
        ? { command: path.join(project.path, 'bin', 'rspec'), args: [] }
        : { command: 'bundle', args: ['exec', 'rspec'] },
    });
  }

  if (hasRails && hasTestDir) {
    commands.push(
      binRailsExists
        ? {
            id: 'rails-test',
            runner: 'rails-test',
            label: 'bin/rails test',
            description: 'Executa a task de teste do Rails.',
            origin: 'binary',
            originDetail: 'bin/rails',
            priority: 20,
            resolved: {
              command: path.join(project.path, 'bin', 'rails'),
              args: ['test'],
            },
          }
        : {
            id: 'rails-test',
            runner: 'rails-test',
            label: 'bundle exec rails test',
            description: 'Executa a task de teste do Rails via bundle.',
            origin: 'gemfile',
            originDetail: 'Gemfile',
            priority: 20,
            resolved: {
              command: 'bundle',
              args: ['exec', 'rails', 'test'],
            },
          },
    );
  } else if (hasTestDir && !hasRails) {
    commands.push({
      id: 'ruby-minitest',
      runner: 'minitest',
      label: 'bundle exec rake test',
      description: 'Executa a task de teste do Rake para Minitest.',
      origin: 'directory',
      originDetail: 'test/',
      priority: 30,
      resolved: {
        command: 'bundle',
        args: ['exec', 'rake', 'test'],
      },
    });
  }

  return commands;
}
