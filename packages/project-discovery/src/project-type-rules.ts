import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ProjectTypeRules {
  rails: { requiredFile: string; gemNamePattern: string };
  node: { requiredFile: string };
}

/**
 * Espelha shared/project-type-rules.json — usado só se o arquivo não puder
 * ser lido (ex. layout de instalação inesperado); no monorepo normal o
 * arquivo compartilhado é sempre a fonte real.
 */
const DEFAULT_RULES: ProjectTypeRules = {
  rails: {
    requiredFile: 'Gemfile',
    gemNamePattern: '^\\s*gem\\s+["\']rails["\']',
  },
  node: { requiredFile: 'package.json' },
};

let cachedRules: ProjectTypeRules | null = null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sharedRulesPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(moduleDir, '../../../shared/project-type-rules.json');
}

/** Exportado só para teste unitário direto das regras de fallback por campo. */
export function parseRules(raw: unknown): ProjectTypeRules {
  if (!isPlainObject(raw)) return DEFAULT_RULES;
  const rails = isPlainObject(raw.rails) ? raw.rails : {};
  const node = isPlainObject(raw.node) ? raw.node : {};

  return {
    rails: {
      requiredFile:
        typeof rails.requiredFile === 'string'
          ? rails.requiredFile
          : DEFAULT_RULES.rails.requiredFile,
      gemNamePattern:
        typeof rails.gemNamePattern === 'string'
          ? rails.gemNamePattern
          : DEFAULT_RULES.rails.gemNamePattern,
    },
    node: {
      requiredFile:
        typeof node.requiredFile === 'string'
          ? node.requiredFile
          : DEFAULT_RULES.node.requiredFile,
    },
  };
}

/** Carrega (e cacheia) shared/project-type-rules.json; nunca lança erro. */
export function loadProjectTypeRules(): ProjectTypeRules {
  if (cachedRules) return cachedRules;
  try {
    const raw = readFileSync(sharedRulesPath(), 'utf8');
    cachedRules = parseRules(JSON.parse(raw));
  } catch {
    cachedRules = DEFAULT_RULES;
  }
  return cachedRules;
}

/** Só para testes — força a próxima chamada a `loadProjectTypeRules` a reler o arquivo. */
export function resetProjectTypeRulesCache(): void {
  cachedRules = null;
}
