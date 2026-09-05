import path from 'node:path';

import type { Project, ProjectDiagnosticCheck } from '@dev-dashboard/contracts';

import type { DoctorCommandRunner } from './check-types.js';
import { createDiagnosticCheck } from './check-types.js';
import { readLimitedText } from './file-utils.js';
import { readToolVersion } from './tool-versions.js';
import { evaluateVersionConstraint } from './version-constraint.js';

interface VersionDeclaration {
  source: string;
  value: string;
}

function parseGemfileRubyVersion(content: string): string | undefined {
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*ruby\s+['"]([^'"]+)['"]/);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return undefined;
}

function parseBundledWith(content: string): string | undefined {
  const match = content.match(
    /(?:^|\n)BUNDLED WITH\s*\n\s+([^\s]+)\s*(?:\n|$)/,
  );
  return match?.[1]?.trim() || undefined;
}

function versionFromRubyOutput(output: string): string {
  return (
    output
      .trim()
      .replace(/^ruby\s+/, '')
      .split(/\s+/)[0] ?? ''
  );
}

function versionFromBundlerOutput(output: string): string {
  return output.match(/\d+(?:\.\d+){1,3}/)?.[0] ?? '';
}

async function rubyDeclarations(
  project: Project,
): Promise<VersionDeclaration[]> {
  const declarations: VersionDeclaration[] = [];
  const rubyVersion = (
    await readLimitedText(path.join(project.path, '.ruby-version'))
  )?.trim();
  if (rubyVersion)
    declarations.push({ source: '.ruby-version', value: rubyVersion });

  const toolVersion = await readToolVersion(project, ['ruby']);
  if (toolVersion) {
    declarations.push({
      source: `${toolVersion.source}#${toolVersion.tool}`,
      value: toolVersion.value,
    });
  }

  const gemfile = await readLimitedText(path.join(project.path, 'Gemfile'));
  const gemfileVersion = gemfile ? parseGemfileRubyVersion(gemfile) : undefined;
  if (gemfileVersion) {
    declarations.push({ source: 'Gemfile#ruby', value: gemfileVersion });
  }

  return declarations;
}

export async function checkRubyRuntime(
  project: Project,
  commandRunner: DoctorCommandRunner,
): Promise<ProjectDiagnosticCheck> {
  const declarations = await rubyDeclarations(project);

  let availableVersion: string;
  try {
    const result = await commandRunner('ruby', ['--version']);
    availableVersion = versionFromRubyOutput(
      `${result.stdout}\n${result.stderr}`,
    );
  } catch {
    return createDiagnosticCheck({
      id: 'ruby-runtime',
      category: 'runtime',
      label: 'Runtime Ruby',
      status: 'warning',
      summary:
        declarations.length > 0
          ? `Ruby não está disponível para a API; o projeto declara ${declarations
              .map(
                (declaration) => `${declaration.source}=${declaration.value}`,
              )
              .join(', ')}.`
          : 'Ruby não está disponível para a API.',
      recommendation:
        'Disponibilize Ruby no ambiente que executa o Dev Dashboard ou use o fluxo em container do projeto.',
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }

  if (declarations.length === 0) {
    return createDiagnosticCheck({
      id: 'ruby-runtime',
      category: 'runtime',
      label: 'Runtime Ruby',
      status: 'passed',
      summary: `Ruby ${availableVersion || 'está disponível'} para a API; o projeto não declara uma versão obrigatória.`,
    });
  }

  const results = declarations.map((declaration) => ({
    declaration,
    compatibility: evaluateVersionConstraint(
      availableVersion,
      declaration.value,
    ),
  }));
  const incompatible = results.filter(
    (item) => item.compatibility === 'incompatible',
  );
  if (incompatible.length > 0) {
    return createDiagnosticCheck({
      id: 'ruby-runtime',
      category: 'runtime',
      label: 'Runtime Ruby',
      status: 'failed',
      summary: `Ruby ${availableVersion || 'detectado'} não atende ${incompatible
        .map(({ declaration }) => `${declaration.source}=${declaration.value}`)
        .join(', ')}.`,
      recommendation:
        'Use uma versão Ruby compatível com todas as declarações versionadas do projeto ou alinhe as fontes conflitantes.',
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }

  const unknown = results.filter((item) => item.compatibility === 'unknown');
  if (unknown.length > 0) {
    return createDiagnosticCheck({
      id: 'ruby-runtime',
      category: 'runtime',
      label: 'Runtime Ruby',
      status: 'warning',
      summary: `Ruby ${availableVersion || 'detectado'} está disponível, mas não foi possível avaliar com segurança ${unknown
        .map(({ declaration }) => `${declaration.source}=${declaration.value}`)
        .join(', ')}.`,
      recommendation:
        'Use uma versão/constraint numérica explícita para permitir validação determinística.',
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }

  return createDiagnosticCheck({
    id: 'ruby-runtime',
    category: 'runtime',
    label: 'Runtime Ruby',
    status: 'passed',
    summary: `Ruby ${availableVersion || 'disponível'} atende ${declarations
      .map((declaration) => `${declaration.source}=${declaration.value}`)
      .join(', ')}.`,
  });
}

export async function checkBundlerDependencies(
  project: Project,
  commandRunner: DoctorCommandRunner,
): Promise<ProjectDiagnosticCheck> {
  const lockContent = await readLimitedText(
    path.join(project.path, 'Gemfile.lock'),
  );
  if (lockContent === null) {
    return createDiagnosticCheck({
      id: 'bundler-dependencies',
      category: 'dependencies',
      label: 'Dependências Bundler',
      status: 'warning',
      summary: 'Gemfile.lock não foi encontrado.',
      recommendation:
        'Instale as gems e versione o Gemfile.lock quando aplicável.',
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }

  const declarations: VersionDeclaration[] = [];
  const bundledWith = parseBundledWith(lockContent);
  if (bundledWith) {
    declarations.push({
      source: 'Gemfile.lock#BUNDLED WITH',
      value: bundledWith,
    });
  }
  const toolVersion = await readToolVersion(project, ['bundler']);
  if (toolVersion) {
    declarations.push({
      source: `${toolVersion.source}#${toolVersion.tool}`,
      value: toolVersion.value,
    });
  }

  let bundlerVersion = '';
  try {
    const result = await commandRunner('bundle', ['--version'], {
      cwd: project.path,
    });
    bundlerVersion = versionFromBundlerOutput(
      `${result.stdout}\n${result.stderr}`,
    );
  } catch {
    return createDiagnosticCheck({
      id: 'bundler-dependencies',
      category: 'dependencies',
      label: 'Dependências Bundler',
      status: 'warning',
      summary:
        declarations.length > 0
          ? `Bundler não está disponível para a API; o projeto declara ${declarations
              .map(
                (declaration) => `${declaration.source}=${declaration.value}`,
              )
              .join(', ')}.`
          : 'Bundler não está disponível para a API.',
      recommendation:
        'Disponibilize Bundler no ambiente da API. O Doctor não instala gems ou ferramentas automaticamente.',
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }

  const results = declarations.map((declaration) => ({
    declaration,
    compatibility: evaluateVersionConstraint(bundlerVersion, declaration.value),
  }));
  const incompatible = results.filter(
    (item) => item.compatibility === 'incompatible',
  );
  if (incompatible.length > 0) {
    return createDiagnosticCheck({
      id: 'bundler-dependencies',
      category: 'dependencies',
      label: 'Dependências Bundler',
      status: 'failed',
      summary: `Bundler ${bundlerVersion || 'detectado'} não atende ${incompatible
        .map(({ declaration }) => `${declaration.source}=${declaration.value}`)
        .join(', ')}.`,
      recommendation:
        'Use a versão de Bundler declarada pelo lock/toolchain antes de validar as dependências.',
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }

  const unknown = results.filter((item) => item.compatibility === 'unknown');
  if (unknown.length > 0) {
    return createDiagnosticCheck({
      id: 'bundler-dependencies',
      category: 'dependencies',
      label: 'Dependências Bundler',
      status: 'warning',
      summary: `Bundler ${bundlerVersion || 'detectado'} está disponível, mas não foi possível avaliar com segurança ${unknown
        .map(({ declaration }) => `${declaration.source}=${declaration.value}`)
        .join(', ')}.`,
      recommendation:
        'Use uma versão numérica explícita para permitir validação determinística do Bundler.',
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }

  try {
    await commandRunner('bundle', ['check'], { cwd: project.path });
    return createDiagnosticCheck({
      id: 'bundler-dependencies',
      category: 'dependencies',
      label: 'Dependências Bundler',
      status: 'passed',
      summary:
        declarations.length > 0
          ? `Bundler ${bundlerVersion || 'disponível'} atende ${declarations
              .map(
                (declaration) => `${declaration.source}=${declaration.value}`,
              )
              .join(', ')} e confirmou as dependências instaladas.`
          : `Bundler ${bundlerVersion || 'disponível'} confirmou que as dependências estão instaladas.`,
    });
  } catch {
    return createDiagnosticCheck({
      id: 'bundler-dependencies',
      category: 'dependencies',
      label: 'Dependências Bundler',
      status: 'warning',
      summary: `Bundler ${bundlerVersion || 'está disponível'}, mas não confirmou as dependências do projeto.`,
      recommendation:
        'Execute a instalação das gems pela área de dependências e revise o resultado.',
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }
}
