import path from 'node:path';

import type { Project, ProjectDiagnosticCheck } from '@dev-dashboard/contracts';

import type { DoctorCommandRunner } from './check-types.js';
import { createDiagnosticCheck } from './check-types.js';
import { directoryExists, pathExists, readLimitedText } from './file-utils.js';

interface NodeManifestInfo {
  exists: boolean;
  valid: boolean;
  enginesNode?: string;
}

interface PackageManagerDetection {
  manager?: string;
  lockfiles: string[];
}

async function readNodeManifest(project: Project): Promise<NodeManifestInfo> {
  const content = await readLimitedText(
    path.join(project.path, 'package.json'),
  );
  if (content === null) return { exists: false, valid: false };

  try {
    const parsed = JSON.parse(content) as { engines?: { node?: unknown } };
    const enginesNode =
      typeof parsed.engines?.node === 'string'
        ? parsed.engines.node.trim()
        : '';
    return {
      exists: true,
      valid: true,
      ...(enginesNode ? { enginesNode } : {}),
    };
  } catch {
    return { exists: true, valid: false };
  }
}

async function detectPackageManager(
  project: Project,
): Promise<PackageManagerDetection> {
  const candidates = [
    { file: 'pnpm-lock.yaml', manager: 'pnpm' },
    { file: 'yarn.lock', manager: 'yarn' },
    { file: 'bun.lock', manager: 'bun' },
    { file: 'bun.lockb', manager: 'bun' },
    { file: 'package-lock.json', manager: 'npm' },
    { file: 'npm-shrinkwrap.json', manager: 'npm' },
  ] as const;
  const lockfiles: string[] = [];
  const managers = new Set<string>();

  await Promise.all(
    candidates.map(async ({ file, manager }) => {
      if (await pathExists(path.join(project.path, file))) {
        lockfiles.push(file);
        managers.add(manager);
      }
    }),
  );

  const manager = managers.size === 1 ? [...managers][0] : undefined;
  return {
    lockfiles: lockfiles.sort(),
    ...(manager ? { manager } : {}),
  };
}

export async function checkNodeRuntime(
  project: Project,
): Promise<ProjectDiagnosticCheck> {
  const manifest = await readNodeManifest(project);
  if (manifest.exists && !manifest.valid) {
    return createDiagnosticCheck({
      id: 'node-runtime',
      category: 'runtime',
      label: 'Runtime Node',
      status: 'warning',
      summary: 'package.json existe, mas não contém JSON válido.',
      recommendation:
        'Corrija o package.json antes de instalar dependências ou iniciar o projeto.',
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }

  const declarations = new Set<string>();
  for (const fileName of ['.node-version', '.nvmrc']) {
    const value = (
      await readLimitedText(path.join(project.path, fileName))
    )?.trim();
    if (value) declarations.add(value);
  }
  if (manifest.enginesNode) declarations.add(manifest.enginesNode);

  const declared = [...declarations];
  if (declared.length > 1) {
    return createDiagnosticCheck({
      id: 'node-runtime',
      category: 'runtime',
      label: 'Runtime Node',
      status: 'warning',
      summary: `A API usa ${process.version}, mas o projeto possui declarações diferentes: ${declared.join(', ')}.`,
      recommendation:
        'Unifique .node-version, .nvmrc e engines.node para evitar ambientes diferentes.',
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }

  return createDiagnosticCheck({
    id: 'node-runtime',
    category: 'runtime',
    label: 'Runtime Node',
    status: 'passed',
    summary: declared[0]
      ? `Node ${process.version} está disponível; o projeto declara ${declared[0]}.`
      : `Node ${process.version} está disponível para a API.`,
  });
}

export async function checkNodePackageManager(
  project: Project,
  commandRunner: DoctorCommandRunner,
): Promise<ProjectDiagnosticCheck> {
  const packageJsonExists = await pathExists(
    path.join(project.path, 'package.json'),
  );
  if (!packageJsonExists) {
    return createDiagnosticCheck({
      id: 'node-package-manager',
      category: 'dependencies',
      label: 'Gerenciador Node',
      status: project.type === 'rails' ? 'skipped' : 'warning',
      summary:
        'package.json não foi encontrado; a parte Node não será verificada.',
    });
  }

  const detection = await detectPackageManager(project);
  if (detection.lockfiles.length === 0) {
    return createDiagnosticCheck({
      id: 'node-package-manager',
      category: 'dependencies',
      label: 'Gerenciador Node',
      status: 'warning',
      summary: 'Nenhum lockfile Node foi encontrado.',
      recommendation:
        'Gere e versione um único lockfile para tornar as instalações reproduzíveis.',
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }

  if (!detection.manager || detection.lockfiles.length > 1) {
    return createDiagnosticCheck({
      id: 'node-package-manager',
      category: 'dependencies',
      label: 'Gerenciador Node',
      status: 'warning',
      summary: `Há mais de um lockfile detectado: ${detection.lockfiles.join(', ')}.`,
      recommendation:
        'Mantenha apenas o lockfile do gerenciador adotado pelo projeto.',
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }

  try {
    const result = await commandRunner(detection.manager, ['--version']);
    const version = result.stdout.trim().split(/\s+/)[0] ?? '';
    return createDiagnosticCheck({
      id: 'node-package-manager',
      category: 'dependencies',
      label: 'Gerenciador Node',
      status: 'passed',
      summary: `${detection.manager}${version ? ` ${version}` : ''} está disponível e corresponde a ${detection.lockfiles[0]}.`,
    });
  } catch {
    return createDiagnosticCheck({
      id: 'node-package-manager',
      category: 'dependencies',
      label: 'Gerenciador Node',
      status: 'warning',
      summary: `${detection.manager} foi indicado por ${detection.lockfiles[0]}, mas não está disponível para a API.`,
      recommendation: `Instale ${detection.manager} no ambiente que executa o Dev Dashboard.`,
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }
}

export async function checkNodeDependencies(
  project: Project,
): Promise<ProjectDiagnosticCheck> {
  const packageJsonExists = await pathExists(
    path.join(project.path, 'package.json'),
  );
  if (!packageJsonExists) {
    return createDiagnosticCheck({
      id: 'node-dependencies',
      category: 'dependencies',
      label: 'Dependências Node',
      status: 'skipped',
      summary: 'package.json não foi encontrado.',
    });
  }

  const installed = await directoryExists(
    path.join(project.path, 'node_modules'),
  );
  return createDiagnosticCheck({
    id: 'node-dependencies',
    category: 'dependencies',
    label: 'Dependências Node',
    status: installed ? 'passed' : 'warning',
    summary: installed
      ? 'O diretório node_modules está presente.'
      : 'O diretório node_modules não foi encontrado.',
    ...(!installed
      ? {
          recommendation:
            'Instale as dependências usando o gerenciador detectado.',
          action: {
            label: 'Abrir dependências',
            target: 'dependencies' as const,
          },
        }
      : {}),
  });
}
