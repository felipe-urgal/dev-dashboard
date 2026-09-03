import path from 'node:path';

import {
  NODE_SERVER_SCRIPT_CANDIDATES,
  type ProjectCapability,
  type ProjectType,
} from '@dev-dashboard/contracts';

import {
  hasAnyPath,
  pathExists,
  type PackageManifest,
} from './project-files.js';

function hasGem(gemfile: string | null, gemName: string): boolean {
  if (!gemfile) {
    return false;
  }

  const expression = new RegExp(`^\\s*gem\\s+["']${gemName}["']`, 'm');
  return expression.test(gemfile);
}

function hasPackageDependency(
  manifest: PackageManifest | null,
  dependencyName: string,
): boolean {
  return Boolean(
    manifest?.dependencies?.[dependencyName] ??
      manifest?.devDependencies?.[dependencyName],
  );
}

export async function detectProjectCapabilities(
  projectPath: string,
  type: ProjectType,
  gemfile: string | null,
  manifest: PackageManifest | null,
): Promise<ProjectCapability[]> {
  const capabilities = new Set<ProjectCapability>();

  if (await pathExists(path.join(projectPath, '.git'))) {
    capabilities.add('git');
  }

  if (type === 'rails') {
    capabilities.add('server');
    capabilities.add('bundler');

    if (await pathExists(path.join(projectPath, 'Rakefile'))) {
      capabilities.add('rake');
    }

    if (await pathExists(path.join(projectPath, 'config/database.yml'))) {
      capabilities.add('database');
    }

    if (await hasAnyPath(projectPath, ['spec', 'test'])) {
      capabilities.add('tests');
    }

    if (
      hasGem(gemfile, 'sidekiq') ||
      (await hasAnyPath(projectPath, [
        'config/sidekiq.yml',
        'config/sidekiq.yaml',
      ]))
    ) {
      capabilities.add('sidekiq');
    }
  }

  if (manifest) {
    capabilities.add('scripts');
    const scripts = manifest.scripts ?? {};

    if (
      type === 'node' &&
      NODE_SERVER_SCRIPT_CANDIDATES.some((scriptName) => scriptName in scripts)
    ) {
      capabilities.add('server');
    }

    if (
      'test' in scripts ||
      (await hasAnyPath(projectPath, ['__tests__', 'test', 'tests']))
    ) {
      capabilities.add('tests');
    }
  }

  if (
    hasPackageDependency(manifest, 'webpack') ||
    (await hasAnyPath(projectPath, [
      'config/webpack',
      'webpack.config.js',
      'webpack.config.cjs',
      'webpack.config.mjs',
      'webpack.config.ts',
    ]))
  ) {
    capabilities.add('webpack');
  }

  return [...capabilities].sort();
}
