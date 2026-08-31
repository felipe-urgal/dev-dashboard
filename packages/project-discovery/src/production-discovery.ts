import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Project, ProjectCapability } from '@dev-dashboard/contracts';

import { detectProductionContract } from './production-contract.js';

const PRODUCTION_MANIFEST_PATH = '.dev-dashboard/production.json';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function hasProductionManifest(projectPath: string): Promise<boolean> {
  try {
    await access(path.join(projectPath, PRODUCTION_MANIFEST_PATH));
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ENOENT';
  }
}

async function readPackageScripts(
  projectPath: string,
): Promise<Record<string, string> | undefined> {
  try {
    const contents = await readFile(
      path.join(projectPath, 'package.json'),
      'utf8',
    );
    const parsed: unknown = JSON.parse(contents);
    if (!isRecord(parsed) || !isRecord(parsed.scripts)) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(parsed.scripts).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return undefined;
  }
}

export async function enrichProjectProduction(
  project: Project,
): Promise<Project> {
  if (!(await hasProductionManifest(project.path))) {
    return project;
  }

  const scripts = await readPackageScripts(project.path);
  const detection = await detectProductionContract(project.path, scripts);

  if (detection.contract) {
    const capabilities = new Set<ProjectCapability>(project.capabilities);
    capabilities.add('production');

    return {
      ...project,
      capabilities: [...capabilities].sort(),
      production: detection.contract,
    };
  }

  if (detection.warning) {
    return {
      ...project,
      productionWarning: detection.warning,
    };
  }

  return project;
}
