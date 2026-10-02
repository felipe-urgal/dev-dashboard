import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

export type NodePackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
export type NodePackageManagerDetectionState =
  | 'detected'
  | 'missing'
  | 'conflict'
  | 'unsupported';

export interface NodePackageManagerDetection {
  state: NodePackageManagerDetectionState;
  manager?: NodePackageManager;
  declaredManager?: string;
  declaredVersion?: string;
  source?: string;
  lockfile?: string;
  lockfiles: string[];
  diagnostic?: string;
}

const SUPPORTED_MANAGERS = new Set<NodePackageManager>([
  'npm',
  'pnpm',
  'yarn',
  'bun',
]);

const LOCKFILES: ReadonlyArray<{
  file: string;
  manager: NodePackageManager;
}> = [
  { file: 'package-lock.json', manager: 'npm' },
  { file: 'npm-shrinkwrap.json', manager: 'npm' },
  { file: 'pnpm-lock.yaml', manager: 'pnpm' },
  { file: 'yarn.lock', manager: 'yarn' },
  { file: 'bun.lock', manager: 'bun' },
  { file: 'bun.lockb', manager: 'bun' },
];

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function declaredPackageManager(
  projectPath: string,
): Promise<{ manager: string; version?: string } | undefined> {
  try {
    const manifest = JSON.parse(
      await readFile(path.join(projectPath, 'package.json'), 'utf8'),
    ) as { packageManager?: unknown };
    if (typeof manifest.packageManager !== 'string') return undefined;
    const value = manifest.packageManager.trim();
    const match = /^([a-zA-Z0-9._-]+)(?:@([^+\s]+)(?:\+\S+)?)?$/u.exec(
      value,
    );
    if (!match?.[1]) return undefined;
    return {
      manager: match[1].toLowerCase(),
      ...(match[2] ? { version: match[2] } : {}),
    };
  } catch {
    return undefined;
  }
}

export async function detectNodePackageManager(
  projectPath: string,
): Promise<NodePackageManagerDetection> {
  const [declared, presentLockfiles] = await Promise.all([
    declaredPackageManager(projectPath),
    Promise.all(
      LOCKFILES.map(async (candidate) =>
        (await exists(path.join(projectPath, candidate.file)))
          ? candidate
          : undefined,
      ),
    ).then((items) => items.filter((item) => item !== undefined)),
  ]);

  const lockfiles = presentLockfiles.map((item) => item.file).sort();
  const lockManagers = new Set(presentLockfiles.map((item) => item.manager));

  if (
    declared &&
    !SUPPORTED_MANAGERS.has(declared.manager as NodePackageManager)
  ) {
    return {
      state: 'unsupported',
      declaredManager: declared.manager,
      ...(declared.version ? { declaredVersion: declared.version } : {}),
      lockfiles,
      diagnostic: `package.json declara o gerenciador não suportado "${declared.manager}".`,
    };
  }

  if (lockfiles.length > 1 || lockManagers.size > 1) {
    return {
      state: 'conflict',
      ...(declared ? { declaredManager: declared.manager } : {}),
      ...(declared?.version ? { declaredVersion: declared.version } : {}),
      lockfiles,
      diagnostic: `Há lockfiles concorrentes: ${lockfiles.join(', ')}.`,
    };
  }

  const declaredManager = declared?.manager as NodePackageManager | undefined;
  const lock = presentLockfiles[0];
  if (declaredManager && lock && declaredManager !== lock.manager) {
    return {
      state: 'conflict',
      declaredManager,
      ...(declared?.version ? { declaredVersion: declared.version } : {}),
      lockfiles,
      diagnostic: `package.json declara ${declaredManager}, mas ${lock.file} pertence a ${lock.manager}.`,
    };
  }

  const manager = declaredManager ?? lock?.manager;
  if (!manager) {
    return {
      state: 'missing',
      lockfiles,
      diagnostic:
        'Nenhum packageManager suportado ou lockfile Node foi encontrado.',
    };
  }

  return {
    state: 'detected',
    manager,
    ...(declared ? { declaredManager: declared.manager } : {}),
    ...(declared?.version ? { declaredVersion: declared.version } : {}),
    source: declared ? 'package.json#packageManager' : lock!.file,
    ...(lock ? { lockfile: lock.file } : {}),
    lockfiles,
  };
}
