import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface PackageManifest {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function hasAnyPath(
  basePath: string,
  relativePaths: readonly string[],
): Promise<boolean> {
  for (const relativePath of relativePaths) {
    if (await pathExists(path.join(basePath, relativePath))) {
      return true;
    }
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );

  return Object.fromEntries(entries);
}

export async function readPackageManifest(
  projectPath: string,
): Promise<PackageManifest | null> {
  try {
    const contents = await readFile(
      path.join(projectPath, 'package.json'),
      'utf8',
    );
    const parsed: unknown = JSON.parse(contents);

    if (!isRecord(parsed)) {
      return null;
    }

    const scripts = toStringRecord(parsed.scripts);
    const dependencies = toStringRecord(parsed.dependencies);
    const devDependencies = toStringRecord(parsed.devDependencies);

    return {
      ...(scripts ? { scripts } : {}),
      ...(dependencies ? { dependencies } : {}),
      ...(devDependencies ? { devDependencies } : {}),
    };
  } catch {
    return null;
  }
}

export async function readGemfile(projectPath: string): Promise<string | null> {
  try {
    return await readFile(path.join(projectPath, 'Gemfile'), 'utf8');
  } catch {
    return null;
  }
}
