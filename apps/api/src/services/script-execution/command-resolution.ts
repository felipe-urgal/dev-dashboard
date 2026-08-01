import { access } from 'node:fs/promises';
import path from 'node:path';

import type { Project, ProjectScript } from '@dev-dashboard/contracts';

import { ScriptExecutionError } from './errors.js';

export type NodeManager = 'npm' | 'pnpm' | 'yarn';

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export async function resolveNodeManager(projectPath: string): Promise<NodeManager> {
  const lockfiles: ReadonlyArray<[NodeManager, string]> = [
    ['npm', 'package-lock.json'],
    ['pnpm', 'pnpm-lock.yaml'],
    ['yarn', 'yarn.lock'],
  ];
  const candidates = (
    await Promise.all(
      lockfiles.map(async ([manager, lockfile]) =>
        (await exists(path.join(projectPath, lockfile))) ? manager : undefined,
      ),
    )
  ).filter((manager): manager is NodeManager => manager !== undefined);

  if (candidates.length > 1) {
    throw new ScriptExecutionError(
      'SCRIPT_MANAGER_AMBIGUOUS',
      'Mais de um lockfile foi encontrado; remova a ambiguidade antes de executar.',
    );
  }
  if (candidates.length === 0) {
    throw new ScriptExecutionError(
      'SCRIPT_MANAGER_NOT_FOUND',
      'Nenhum lockfile npm, pnpm ou Yarn foi encontrado.',
    );
  }
  return candidates[0]!;
}

export async function resolveCommand(
  project: Project,
  action: ProjectScript,
): Promise<{ command: string; args: string[] }> {
  const separator = action.id.indexOf(':');
  const origin = action.id.slice(0, separator);
  const name = action.id.slice(separator + 1);

  if (separator < 1 || !name || origin !== action.origin) {
    throw new ScriptExecutionError(
      'SCRIPT_NOT_FOUND',
      'A ação catalogada é inválida.',
    );
  }
  if (origin === 'package-script') {
    return { command: await resolveNodeManager(project.path), args: ['run', name] };
  }
  if (origin === 'rails-task') {
    return { command: path.join(project.path, 'bin', 'rails'), args: [name] };
  }
  if (
    origin === 'bin' &&
    ['rails', 'rake', 'rspec', 'rubocop', 'setup'].includes(name)
  ) {
    return { command: path.join(project.path, 'bin', name), args: [] };
  }
  throw new ScriptExecutionError(
    'SCRIPT_NOT_FOUND',
    'A ação não pertence à allowlist de execução.',
  );
}
