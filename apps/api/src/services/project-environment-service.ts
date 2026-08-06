import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  Project,
  ProjectEnvironmentFile,
  ProjectEnvironmentOverview,
  ProjectEnvironmentVariable,
  ProjectEnvironmentVariableValue,
} from '@dev-dashboard/contracts';
import { isSensitiveEnvironmentProfileVariableName } from '@dev-dashboard/core';

// Mesma lista já usada por DatabaseDetectionService para detectar DATABASE_URL —
// mantém um único catálogo fechado de nomes de arquivo .env reconhecidos.
const DOTENV_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.test',
  '.env.production',
];

interface ParsedEnvironmentVariable {
  name: string;
  value: string;
  sensitive: boolean;
}

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

/**
 * Lista, somente leitura, as variáveis declaradas nos arquivos .env
 * reconhecidos de um projeto. O resumo nunca inclui o valor de uma variável
 * cujo nome pareça um segredo; esse valor só pode ser consultado separadamente
 * e de forma explícita pelo usuário.
 */
export class ProjectEnvironmentService {
  public async getOverview(
    project: Project,
  ): Promise<ProjectEnvironmentOverview> {
    const files: ProjectEnvironmentFile[] = [];
    for (const file of DOTENV_FILES) {
      const contents = await readDotenvFile(project.path, file);
      if (contents === null) continue;
      const variables = parseDotenv(contents).map(maskSensitiveValue);
      if (variables.length > 0) files.push({ file, variables });
    }
    return { files };
  }

  public async getVariableValue(
    project: Project,
    file: string,
    name: string,
  ): Promise<ProjectEnvironmentVariableValue | null> {
    if (!DOTENV_FILES.includes(file)) return null;

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
