import path from 'node:path';

import type { Project, ProjectDiagnosticCheck } from '@dev-dashboard/contracts';

import type { DoctorCommandRunner } from './check-types.js';
import { createDiagnosticCheck } from './check-types.js';
import { pathExists, readLimitedText } from './file-utils.js';

export async function checkRubyRuntime(
  project: Project,
  commandRunner: DoctorCommandRunner,
): Promise<ProjectDiagnosticCheck> {
  const requiredVersion = (
    await readLimitedText(path.join(project.path, '.ruby-version'))
  )?.trim();

  try {
    const result = await commandRunner('ruby', ['--version']);
    const availableVersion =
      result.stdout
        .trim()
        .replace(/^ruby\s+/, '')
        .split(/\s+/)[0] ?? '';
    return createDiagnosticCheck({
      id: 'ruby-runtime',
      category: 'runtime',
      label: 'Runtime Ruby',
      status: 'passed',
      summary: requiredVersion
        ? `Ruby ${availableVersion || 'disponível'} está acessível; o projeto declara ${requiredVersion}.`
        : `Ruby ${availableVersion || 'está disponível'} para a API.`,
    });
  } catch {
    return createDiagnosticCheck({
      id: 'ruby-runtime',
      category: 'runtime',
      label: 'Runtime Ruby',
      status: 'warning',
      summary: requiredVersion
        ? `Ruby não está disponível para a API; o projeto declara ${requiredVersion}.`
        : 'Ruby não está disponível para a API.',
      recommendation:
        'Disponibilize Ruby no ambiente que executa o Dev Dashboard ou use o fluxo em container do projeto.',
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }
}

export async function checkBundlerDependencies(
  project: Project,
  commandRunner: DoctorCommandRunner,
): Promise<ProjectDiagnosticCheck> {
  const gemfileLockExists = await pathExists(
    path.join(project.path, 'Gemfile.lock'),
  );
  if (!gemfileLockExists) {
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

  try {
    await commandRunner('bundle', ['check'], { cwd: project.path });
    return createDiagnosticCheck({
      id: 'bundler-dependencies',
      category: 'dependencies',
      label: 'Dependências Bundler',
      status: 'passed',
      summary: 'Bundler confirmou que as dependências estão instaladas.',
    });
  } catch {
    return createDiagnosticCheck({
      id: 'bundler-dependencies',
      category: 'dependencies',
      label: 'Dependências Bundler',
      status: 'warning',
      summary: 'Bundler não confirmou as dependências do projeto.',
      recommendation:
        'Execute a instalação das gems pela área de dependências e revise o resultado.',
      action: { label: 'Abrir dependências', target: 'dependencies' },
    });
  }
}
