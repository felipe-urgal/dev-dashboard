import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  Project,
  ProjectEnvironmentFile,
  ProjectEnvironmentOverview,
} from '@dev-dashboard/contracts';
import { isSensitiveEnvironmentProfileVariableName } from '@dev-dashboard/core';

// Mesma lista já usada por DatabaseDetectionService para detectar DATABASE_URL —
// mantém um único catálogo fechado de nomes de arquivo .env reconhecidos.
const DOTENV_FILES = ['.env', '.env.local', '.env.development', '.env.test', '.env.production'];

async function readDotenvFile(projectPath: string, file: string): Promise<string | null> {
  const target = path.resolve(projectPath, file);
  const root = path.resolve(projectPath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return null;
  try {
    return await readFile(target, 'utf8');
  } catch {
    return null;
  }
}

function parseDotenv(contents: string): ProjectEnvironmentFile['variables'] {
  const variables: ProjectEnvironmentFile['variables'] = [];
  const seen = new Set<string>();
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const name = match[1] ?? '';
    if (seen.has(name)) continue;
    seen.add(name);

    let rawValue = match[2] ?? '';
    if ((rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
      rawValue = rawValue.slice(1, -1);
    }

    const sensitive = isSensitiveEnvironmentProfileVariableName(name);
    variables.push(sensitive ? { name, sensitive } : { name, value: rawValue, sensitive });
  }
  return variables;
}

/**
 * Lista, somente leitura, as variáveis declaradas nos arquivos .env
 * reconhecidos de um projeto. Nunca lê arquivo fora da lista fechada nem
 * fora do diretório do projeto, e nunca inclui o valor de uma variável cujo
 * nome pareça um segredo (mesma heurística de EnvironmentProfileRepository).
 */
export class ProjectEnvironmentService {
  public async getOverview(project: Project): Promise<ProjectEnvironmentOverview> {
    const files: ProjectEnvironmentFile[] = [];
    for (const file of DOTENV_FILES) {
      const contents = await readDotenvFile(project.path, file);
      if (contents === null) continue;
      const variables = parseDotenv(contents);
      if (variables.length > 0) files.push({ file, variables });
    }
    return { files };
  }
}
