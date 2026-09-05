import path from 'node:path';

import type { Project, ProjectDiagnosticCheck } from '@dev-dashboard/contracts';

import type { DoctorCommandRunner } from './check-types.js';
import { createDiagnosticCheck } from './check-types.js';
import { directoryExists, pathExists, readLimitedText } from './file-utils.js';
import { evaluateVersionConstraint } from './version-constraint.js';

interface NodeManifestInfo {
  exists: boolean;
  valid: boolean;
  enginesNode?: string;
  packageManager?: string;
}

interface PackageManagerDetection {
  manager?: string;
  lockfiles: string[];
}

interface VersionDeclaration {
  source: string;
  value: string;
}

interface PackageManagerDeclaration {
  manager: string;
  version?: string;
}

const SUPPORTED_PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn', 'bun']);

async function readNodeManifest(project: Project): Promise<NodeManifestInfo> {
  const content = await readLimitedText(path.join(project.path, 'package.json'));
  if (content === null) return { exists: false, valid: false };

  try {
    const parsed = JSON.parse(content) as {
      engines?: { node?: unknown };
      packageManager?: unknown;
    };
    const enginesNode =
      typeof parsed.engines?.node === 'string' ? parsed.engines.node.trim() : '';
    const packageManager =
      typeof parsed.packageManager === 'string'
        ? parsed.packageManager.trim()
        : '';
    return {
      exists: true,
      valid: true,
      ...(enginesNode ? { enginesNode } : {}),
      ...(packageManager ? { packageManager } : {}),
    };
  } catch {
    return { exists: true, valid: false };
  }
}

function parsePackageManagerDeclaration(
  value: string,
): PackageManagerDeclaration | null {
  const match = value.trim().match(/^([a-zA-Z0-9._-]+)(?:@([^+\s]+)(?:\+\S+)?)?$/);
  if (!match) return null;
  return {
    manager: match[1]!.toLowerCase(),
    ...(match[2] ? { version: match[2] } : {}),
  };
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

  const declarations: VersionDeclaration[] = [];
  for (const fileName of ['.node-version', '.nvmrc']) {
    const value = (
      await readLimitedText(path.join(project.path, fileName))
    )?.trim();
    if (value) declarations.push({ source: fileName, value });
  }
  if (manifest.enginesNode) {
    declarations.push({ source: 'package.json#engines.node', value: manifest.enginesNode });
  }

  if (declarations.length === 0) {
    return createDiagnosticCheck({
      id: 'node-runtime',
      category: 'runtime',
      label: 'Runtime Node',
      status: 'passed',
      summary: `Node ${process.version} está disponível; o projeto não declara uma versão obrigatória.`,
    });
  }

  const results = declarations.map((declaration) => ({
    declaration,
    result: evaluateVersionConstraint(process.version, declaration.value),
  }));
  const incompatible = results.filter((item) => item.result === 'incompatible');
  if (incompatible.length > 0) {
    return createDiagnosticCheck({
      id: 'node-runtime',
      category: 'runtime',
      label: 'Runtime Node',
      status: 'failed',
      summary: `Node ${process.version} não atende ${incompatible
        .map(({ declaration }) => `${declaration.source}=${declaration.value}`)
        .join(', ')}.`,
      recommendation:
        'Use uma versão de Node compatível com todas as declarações do projeto ou alinhe as fontes versionadas.',
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }

  const unknown = results.filter((item) => item.result === 'unknown');
  if (unknown.length > 0) {
    return createDiagnosticCheck({
      id: 'node-runtime',
      category: 'runtime',
      label: 'Runtime Node',
      status: 'warning',
      summary: `Node ${process.version} está disponível, mas não foi possível avaliar com segurança ${unknown
        .map(({ declaration }) => `${declaration.source}=${declaration.value}`)
        .join(', ')}.`,
      recommendation:
        'Use uma constraint numérica explícita para permitir validação determinística do runtime.',
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }

  return createDiagnosticCheck({
    id: 'node-runtime',
    category: 'runtime',
    label: 'Runtime Node',
    status: 'passed',
    summary: `Node ${process.version} atende ${declarations
      .map((declaration) => `${declaration.source}=${declaration.value}`)
      .join(', ')}.`,
  });
}

export async function checkNodePackageManager(
  project: Project,
  commandRunner: DoctorCommandRunner,
): Promise<ProjectDiagnosticCheck> {
  const manifest = await readNodeManifest(project);
  if (!manifest.exists) {
    return createDiagnosticCheck({
      id: 'node-package-manager',
      category: 'dependencies',
      label: 'Gerenciador Node',
      status: project.type === 'rails' ? 'skipped' : 'warning',
      summary: 'package.json não foi encontrado; a parte Node não será verificada.',
    });
  }
  if (!manifest.valid) {
    return createDiagnosticCheck({
      id: 'node-package-manager',
      category: 'dependencies',
      label: 'Gerenciador Node',
      status: 'warning',
      summary: 'package.json existe, mas não contém JSON válido.',
    });
  }

  const detection = await detectPackageManager(project);
  const declared = manifest.packageManager
    ? parsePackageManagerDeclaration(manifest.packageManager)
    : null;

  if (manifest.packageManager && !declared) {
    return createDiagnosticCheck({
      id: 'node-package-manager',
      category: 'dependencies',
      label: 'Gerenciador Node',
      status: 'warning',
      summary: `package.json#packageManager não pôde ser interpretado: ${manifest.packageManager}.`,
      recommendation:
        'Declare packageManager no formato gerenciador@versão para tornar a toolchain reproduzível.',
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }

  const manager = declared?.manager ?? detection.manager;
  if (!manager) {
    return createDiagnosticCheck({
      id: 'node-package-manager',
      category: 'dependencies',
      label: 'Gerenciador Node',
      status: 'warning',
      summary:
        detection.lockfiles.length > 0
          ? `Há lockfiles conflitantes: ${detection.lockfiles.join(', ')}.`
          : 'Nenhum packageManager ou lockfile Node foi encontrado.',
      recommendation:
        'Declare packageManager e mantenha somente o lockfile do gerenciador adotado pelo projeto.',
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }

  if (!SUPPORTED_PACKAGE_MANAGERS.has(manager)) {
    return createDiagnosticCheck({
      id: 'node-package-manager',
      category: 'dependencies',
      label: 'Gerenciador Node',
      status: 'warning',
      summary: `${manager} foi declarado em package.json#packageManager, mas ainda não possui detector suportado.`,
      recommendation:
        'Use npm, pnpm, yarn ou bun, ou adicione um provider explícito antes de validar esse gerenciador.',
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }

  const lockfileConflict =
    detection.lockfiles.length > 1 ||
    (detection.manager !== undefined && detection.manager !== manager);

  let result;
  try {
    result = await commandRunner(manager, ['--version']);
  } catch {
    return createDiagnosticCheck({
      id: 'node-package-manager',
      category: 'dependencies',
      label: 'Gerenciador Node',
      status: 'warning',
      summary: `${manager} foi indicado por ${declared ? 'package.json#packageManager' : detection.lockfiles[0]}, mas não está disponível para a API.`,
      recommendation: `Disponibilize ${manager} no ambiente que executa o Dev Dashboard; o Doctor não instala ferramentas automaticamente.`,
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }

  const version = result.stdout.trim().split(/\s+/)[0] ?? '';
  if (declared?.version && version) {
    const compatibility = evaluateVersionConstraint(version, declared.version);
    if (compatibility === 'incompatible') {
      return createDiagnosticCheck({
        id: 'node-package-manager',
        category: 'dependencies',
        label: 'Gerenciador Node',
        status: 'failed',
        summary: `${manager} ${version} não atende package.json#packageManager=${manifest.packageManager}.`,
        recommendation: `Use ${manager} ${declared.version} ou alinhe a declaração versionada do projeto.`,
        action: { label: 'Abrir dependências', target: 'dependencies' },
      });
    }
    if (compatibility === 'unknown') {
      return createDiagnosticCheck({
        id: 'node-package-manager',
        category: 'dependencies',
        label: 'Gerenciador Node',
        status: 'warning',
        summary: `${manager} ${version} está disponível, mas a versão declarada em package.json#packageManager não pôde ser comparada com segurança.`,
        recommendation:
          'Use uma versão numérica explícita em packageManager para permitir validação determinística.',
        action: { label: 'Abrir dependências', target: 'dependencies' },
      });
    }
  }

  if (lockfileConflict) {
    return createDiagnosticCheck({
      id: 'node-package-manager',
      category: 'dependencies',
      label: 'Gerenciador Node',
      status: 'warning',
      summary: `${manager}${version ? ` ${version}` : ''} está disponível, mas os lockfiles não correspondem de forma única à declaração: ${detection.lockfiles.join(', ')}.`,
      recommendation:
        'Mantenha apenas o lockfile correspondente a package.json#packageManager.',
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }

  return createDiagnosticCheck({
    id: 'node-package-manager',
    category: 'dependencies',
    label: 'Gerenciador Node',
    status: 'passed',
    summary: declared
      ? `${manager}${version ? ` ${version}` : ''} atende package.json#packageManager=${manifest.packageManager}${detection.lockfiles[0] ? ` e corresponde a ${detection.lockfiles[0]}` : ''}.`
      : `${manager}${version ? ` ${version}` : ''} está disponível e corresponde a ${detection.lockfiles[0]}.`,
  });
}

export async function checkNodeDependencies(
  project: Project,
): Promise<ProjectDiagnosticCheck> {
  const packageJsonExists = await pathExists(path.join(project.path, 'package.json'));
  if (!packageJsonExists) {
    return createDiagnosticCheck({
      id: 'node-dependencies',
      category: 'dependencies',
      label: 'Dependências Node',
      status: 'skipped',
      summary: 'package.json não foi encontrado.',
    });
  }

  const installed = await directoryExists(path.join(project.path, 'node_modules'));
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
          recommendation: 'Instale as dependências usando o gerenciador detectado.',
          action: {
            label: 'Abrir dependências',
            target: 'dependencies' as const,
          },
        }
      : {}),
  });
}
