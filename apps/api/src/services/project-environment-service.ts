import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  Project,
  ProjectEnvironmentBaselineStatus,
  ProjectEnvironmentContract,
  ProjectEnvironmentContractScope,
  ProjectEnvironmentContractSection,
  ProjectEnvironmentContractVariable,
  ProjectEnvironmentFile,
  ProjectEnvironmentOverview,
  ProjectEnvironmentVariable,
  ProjectEnvironmentVariableValue,
} from '@dev-dashboard/contracts';
import { isSensitiveEnvironmentProfileVariableName } from '@dev-dashboard/core';

export const PROJECT_ENVIRONMENT_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.test',
  '.env.production',
  '.env.example',
  '.env.sample',
  '.env.production.example',
  '.env.docker.example',
  '.env.docker.sample',
];

interface ParsedEnvironmentVariable {
  name: string;
  value: string;
  sensitive: boolean;
}

interface EnvironmentContractScopeConfig {
  scope: ProjectEnvironmentContractScope;
  baselineFiles: string[];
  sourceFiles: string[];
}

const CONTRACT_SCOPES: EnvironmentContractScopeConfig[] = [
  {
    scope: 'default',
    baselineFiles: ['.env.example', '.env.sample'],
    sourceFiles: ['.env.local', '.env.development', '.env'],
  },
  {
    scope: 'test',
    baselineFiles: [],
    sourceFiles: ['.env.test'],
  },
  {
    scope: 'production',
    baselineFiles: ['.env.production.example'],
    sourceFiles: ['.env.production'],
  },
  {
    scope: 'docker',
    baselineFiles: ['.env.docker.example', '.env.docker.sample'],
    sourceFiles: [],
  },
];

async function readDotenvFile(
  projectPath: string,
  file: string,
): Promise<string | null> {
  const target = path.resolve(projectPath, file);
  const root = path.resolve(projectPath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return null;
  try {
    return await readFile(target, 'utf8');
  } catch {
    return null;
  }
}

function parseDotenv(contents: string): ParsedEnvironmentVariable[] {
  const variables: ParsedEnvironmentVariable[] = [];
  const seen = new Set<string>();
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/,
    );
    if (!match) continue;
    const name = match[1] ?? '';
    if (seen.has(name)) continue;
    seen.add(name);

    let rawValue = match[2] ?? '';
    if (
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
    ) {
      rawValue = rawValue.slice(1, -1);
    }

    variables.push({
      name,
      value: rawValue,
      sensitive: isSensitiveEnvironmentProfileVariableName(name),
    });
  }
  return variables;
}

function maskSensitiveValue(
  variable: ParsedEnvironmentVariable,
): ProjectEnvironmentVariable {
  if (variable.sensitive) return { name: variable.name, sensitive: true };
  return variable;
}

function buildVariableIndex(
  files: Map<string, ParsedEnvironmentVariable[]>,
  selectedFiles: string[],
) {
  const index = new Map<string, { sensitive: boolean; files: string[] }>();

  for (const file of selectedFiles) {
    for (const variable of files.get(file) ?? []) {
      const current = index.get(variable.name);
      if (current) {
        current.sensitive ||= variable.sensitive;
        current.files.push(file);
      } else {
        index.set(variable.name, {
          sensitive: variable.sensitive,
          files: [file],
        });
      }
    }
  }

  return index;
}

function getBaselineStatus(
  candidateCount: number,
): ProjectEnvironmentBaselineStatus {
  if (candidateCount === 1) return 'resolved';
  if (candidateCount > 1) return 'ambiguous';
  return 'missing';
}

function buildContractSection(
  files: Map<string, ParsedEnvironmentVariable[]>,
  config: EnvironmentContractScopeConfig,
): ProjectEnvironmentContractSection | null {
  const baselineCandidates = config.baselineFiles.filter((file) =>
    files.has(file),
  );
  const sourceFiles = config.sourceFiles.filter((file) => files.has(file));

  if (baselineCandidates.length === 0 && sourceFiles.length === 0) return null;

  const baselineStatus = getBaselineStatus(baselineCandidates.length);
  const baseline =
    baselineStatus === 'resolved' ? (baselineCandidates[0] ?? null) : null;
  const candidateVariables = buildVariableIndex(files, baselineCandidates);
  const baselineVariables = baseline
    ? buildVariableIndex(files, [baseline])
    : new Map<string, { sensitive: boolean; files: string[] }>();
  const sourceVariables = buildVariableIndex(files, sourceFiles);
  const names = new Set<string>([
    ...candidateVariables.keys(),
    ...sourceVariables.keys(),
  ]);
  const variables: ProjectEnvironmentContractVariable[] = [];

  for (const name of [...names].sort((left, right) =>
    left.localeCompare(right),
  )) {
    const candidate = candidateVariables.get(name);
    const expected = baselineVariables.get(name);
    const actual = sourceVariables.get(name);
    const sensitive = Boolean(
      candidate?.sensitive ||
      actual?.sensitive ||
      isSensitiveEnvironmentProfileVariableName(name),
    );

    if (baselineStatus !== 'resolved') {
      variables.push({
        name,
        sensitive,
        status: 'unknown',
        baseline: null,
        sources: actual?.files ?? [],
        required: null,
        suggestedAction:
          baselineStatus === 'ambiguous' ? 'choose-baseline' : 'document',
      });
      continue;
    }

    if (expected && !actual) {
      variables.push({
        name,
        sensitive,
        status: 'missing',
        baseline,
        sources: [],
        required: true,
        suggestedAction: 'configure',
      });
      continue;
    }

    if (!expected && actual) {
      variables.push({
        name,
        sensitive,
        status: 'undocumented',
        baseline,
        sources: actual.files,
        required: null,
        suggestedAction: 'document',
      });
      continue;
    }

    const sources = actual?.files ?? [];
    variables.push({
      name,
      sensitive,
      status: sources.length > 1 ? 'duplicate' : 'present',
      baseline,
      sources,
      required: true,
      suggestedAction: sources.length > 1 ? 'review-source' : 'none',
    });
  }

  return {
    scope: config.scope,
    baselineStatus,
    baseline,
    baselineCandidates,
    sourceFiles,
    variables,
  };
}

/**
 * Lista, somente leitura, as variáveis declaradas nos arquivos .env
 * reconhecidos de um projeto. O resumo nunca inclui o valor de uma variável
 * cujo nome pareça um segredo; esse valor só pode ser consultado separadamente
 * e de forma explícita pelo usuário.
 */
export class ProjectEnvironmentService {
  private async readRecognizedFiles(
    project: Project,
  ): Promise<Map<string, ParsedEnvironmentVariable[]>> {
    const files = new Map<string, ParsedEnvironmentVariable[]>();
    for (const file of PROJECT_ENVIRONMENT_FILES) {
      const contents = await readDotenvFile(project.path, file);
      if (contents === null) continue;
      files.set(file, parseDotenv(contents));
    }
    return files;
  }

  public async getOverview(
    project: Project,
  ): Promise<ProjectEnvironmentOverview> {
    const parsedFiles = await this.readRecognizedFiles(project);
    const files: ProjectEnvironmentFile[] = [];

    for (const file of PROJECT_ENVIRONMENT_FILES) {
      const parsed = parsedFiles.get(file);
      if (!parsed || parsed.length === 0) continue;
      files.push({ file, variables: parsed.map(maskSensitiveValue) });
    }

    return { files };
  }

  public async getContract(
    project: Project,
  ): Promise<ProjectEnvironmentContract> {
    const files = await this.readRecognizedFiles(project);
    const sections = CONTRACT_SCOPES.map((config) =>
      buildContractSection(files, config),
    ).filter(
      (section): section is ProjectEnvironmentContractSection =>
        section !== null,
    );

    return { sections };
  }

  public async getVariableValue(
    project: Project,
    file: string,
    name: string,
  ): Promise<ProjectEnvironmentVariableValue | null> {
    if (!PROJECT_ENVIRONMENT_FILES.includes(file)) return null;

    const contents = await readDotenvFile(project.path, file);
    if (contents === null) return null;

    const variable = parseDotenv(contents).find((entry) => entry.name === name);
    if (!variable) return null;

    return {
      file,
      name: variable.name,
      value: variable.value,
      sensitive: variable.sensitive,
    };
  }
}
