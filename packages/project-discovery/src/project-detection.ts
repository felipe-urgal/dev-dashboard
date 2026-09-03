import { createHash } from 'node:crypto';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import type {
  Project,
  ProjectSource,
  ProjectType,
} from '@dev-dashboard/contracts';

import { detectProjectCapabilities } from './project-capabilities.js';
import {
  pathExists,
  readGemfile,
  readPackageManifest,
} from './project-files.js';
import { loadProjectTypeRules } from './project-type-rules.js';

export interface DetectProjectOptions {
  workspaceId?: string;
  source?: ProjectSource;
  includeUnknown?: boolean;
}

function detectProjectType(
  gemfile: string | null,
  hasPackageJson: boolean,
): ProjectType {
  const rules = loadProjectTypeRules();
  const isRails =
    gemfile !== null &&
    new RegExp(rules.rails.gemNamePattern, 'm').test(gemfile);

  if (isRails) {
    return 'rails';
  }

  if (hasPackageJson) {
    return 'node';
  }

  return 'unknown';
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'project';
}

function createProjectId(name: string, projectPath: string): string {
  const hash = createHash('sha256')
    .update(projectPath)
    .digest('hex')
    .slice(0, 8);

  return `${slugify(name)}-${hash}`;
}

export async function detectProject(
  projectPath: string,
  options: DetectProjectOptions = {},
): Promise<Project | null> {
  const resolvedPath = await realpath(projectPath);
  const projectStats = await stat(resolvedPath);

  if (!projectStats.isDirectory()) {
    return null;
  }

  const name = path.basename(resolvedPath);
  const hasPackageJson = await pathExists(
    path.join(resolvedPath, 'package.json'),
  );

  const [gemfile, manifest] = await Promise.all([
    readGemfile(resolvedPath),
    hasPackageJson ? readPackageManifest(resolvedPath) : Promise.resolve(null),
  ]);

  const type = detectProjectType(gemfile, hasPackageJson);

  if (type === 'unknown' && options.includeUnknown !== true) {
    return null;
  }

  const source =
    options.source ?? (options.workspaceId ? 'workspace' : 'standalone');

  const project: Project = {
    id: createProjectId(name, resolvedPath),
    name,
    path: resolvedPath,
    type,
    source,
    enabled: true,
    capabilities: await detectProjectCapabilities(
      resolvedPath,
      type,
      gemfile,
      manifest,
    ),
  };

  if (options.workspaceId) {
    return {
      ...project,
      workspaceId: options.workspaceId,
    };
  }

  return project;
}
