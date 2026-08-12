import path from 'node:path';

import type { Project, ProjectDiagnosticCheck } from '@dev-dashboard/contracts';

import {
  formatVariableNames,
  parseEnvironmentVariableNames,
  pathExists,
  readLimitedText,
  readableDirectoryExists,
} from './file-utils.js';
import { createDiagnosticCheck } from './check-types.js';

export async function checkProjectDirectory(
  project: Project,
): Promise<ProjectDiagnosticCheck> {
  const readable = await readableDirectoryExists(project.path);
  return createDiagnosticCheck({
    id: 'project-directory',
    category: 'project',
    label: 'Diretório do projeto',
    status: readable ? 'passed' : 'failed',
    summary: readable
      ? 'O diretório existe e pode ser lido pela API.'
      : 'O diretório não existe ou não pode ser lido pela API.',
    ...(!readable
      ? {
          recommendation:
            'Revise o workspace configurado e as permissões do diretório.',
        }
      : {}),
  });
}

export async function checkExpectedManifest(
  project: Project,
): Promise<ProjectDiagnosticCheck> {
  if (project.type === 'unknown') {
    return createDiagnosticCheck({
      id: 'project-manifest',
      category: 'project',
      label: 'Estrutura esperada',
      status: 'skipped',
      summary: 'O tipo do projeto ainda não foi reconhecido.',
      recommendation:
        'Confirme se o projeto possui package.json ou Gemfile na raiz.',
    });
  }

  const expectedFile = project.type === 'rails' ? 'Gemfile' : 'package.json';
  const exists = await pathExists(path.join(project.path, expectedFile));
  return createDiagnosticCheck({
    id: 'project-manifest',
    category: 'project',
    label: 'Estrutura esperada',
    status: exists ? 'passed' : 'failed',
    summary: exists
      ? `${expectedFile} foi encontrado na raiz do projeto.`
      : `${expectedFile} não foi encontrado na raiz do projeto.`,
    ...(!exists
      ? {
          recommendation:
            'Revise a raiz selecionada ou a estrutura do projeto.',
        }
      : {}),
  });
}

export async function checkEnvironmentVariables(
  project: Project,
): Promise<ProjectDiagnosticCheck> {
  const referenceCandidates = ['.env.example', '.env.sample'] as const;
  let referenceFile: (typeof referenceCandidates)[number] | undefined;
  let exampleContent: string | null = null;
  for (const candidate of referenceCandidates) {
    const content = await readLimitedText(path.join(project.path, candidate));
    if (content === null) continue;
    referenceFile = candidate;
    exampleContent = content;
    break;
  }
  if (exampleContent === null || !referenceFile) {
    return createDiagnosticCheck({
      id: 'environment-variables',
      category: 'configuration',
      label: 'Variáveis de ambiente',
      status: 'skipped',
      summary:
        '.env.example e .env.sample não foram encontrados; não há referência segura para comparar nomes.',
    });
  }

  const expectedNames = parseEnvironmentVariableNames(exampleContent);
  if (expectedNames.size === 0) {
    return createDiagnosticCheck({
      id: 'environment-variables',
      category: 'configuration',
      label: 'Variáveis de ambiente',
      status: 'passed',
      summary: `${referenceFile} não declara nomes de variáveis.`,
    });
  }

  const localContent = await readLimitedText(path.join(project.path, '.env'));
  const localNames =
    localContent === null
      ? new Set<string>()
      : parseEnvironmentVariableNames(localContent);
  const missingNames = [...expectedNames]
    .filter((name) => !localNames.has(name))
    .sort();

  if (missingNames.length === 0) {
    return createDiagnosticCheck({
      id: 'environment-variables',
      category: 'configuration',
      label: 'Variáveis de ambiente',
      status: 'passed',
      summary: `Os ${expectedNames.size} nomes declarados em ${referenceFile} também existem em .env. Nenhum valor foi devolvido pelo relatório.`,
    });
  }

  return createDiagnosticCheck({
    id: 'environment-variables',
    category: 'configuration',
    label: 'Variáveis de ambiente',
    status: 'warning',
    summary: `${missingNames.length} nome(s) esperado(s) não foram encontrados em .env: ${formatVariableNames(missingNames)}.`,
    recommendation:
      'Adicione apenas os valores necessários ao ambiente local. O diagnóstico nunca retorna esses valores.',
    action: { label: 'Abrir variáveis de ambiente', target: 'environment' },
  });
}
