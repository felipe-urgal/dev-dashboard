import type {
  ProjectChangeImpact,
  ProjectChangeImpactAction,
  ProjectChangeImpactCategory,
} from '@dev-dashboard/contracts';

import { runGit } from './git-service/run.js';

const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;

const NODE_LOCKFILE_PATTERN =
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|npm-shrinkwrap\.json)$/;
const GEMFILE_LOCK_PATTERN = /(^|\/)Gemfile\.lock$/;
const MIGRATION_PATTERN = /(^|\/)db\/migrate(_[A-Za-z0-9_]+)?\/.+\.rb$/;
const ENV_EXAMPLE_PATTERN = /(^|\/)\.env\.(example|sample)$/;
const SERVER_CONFIG_PATTERN =
  /(^|\/)(Dockerfile(\.[A-Za-z0-9_-]+)?|(docker-)?compose(\.[A-Za-z0-9_-]+)?\.ya?ml|Procfile(\.[A-Za-z0-9_-]+)?|config\/(puma|unicorn|sidekiq|webpacker)\.(rb|yml))$|(^|\/)config\/webpack\//;
const TEST_FILE_PATTERN =
  /(^|\/)(spec|test|__tests__)\/.+\.(rb|ts|tsx|js|jsx|mjs|cjs)$|\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$|(^|\/)[^/]+_(test|spec)\.rb$/;

interface ImpactRule {
  category: ProjectChangeImpactCategory;
  pattern: RegExp;
}

/**
 * Ordem = prioridade de apresentação. Cada regra é avaliada de forma
 * independente das outras; uma mudança pode disparar mais de uma categoria
 * (ex.: `docker-compose.yml` só entra em `server`, mas um commit que também
 * mexe em `db/migrate/` soma `database`).
 */
const RULES: readonly ImpactRule[] = [
  { category: 'dependencies', pattern: NODE_LOCKFILE_PATTERN },
  { category: 'dependencies', pattern: GEMFILE_LOCK_PATTERN },
  { category: 'database', pattern: MIGRATION_PATTERN },
  { category: 'environment', pattern: ENV_EXAMPLE_PATTERN },
  { category: 'server', pattern: SERVER_CONFIG_PATTERN },
  { category: 'tests', pattern: TEST_FILE_PATTERN },
];

const ACTION_BY_CATEGORY: Record<
  ProjectChangeImpactCategory,
  { label: string; description: string; routeName: string; priority: number }
> = {
  dependencies: {
    label: 'Revisar dependências',
    description:
      'Um lockfile mudou; revise e instale as dependências antes de continuar.',
    routeName: 'project-dependencies',
    priority: 1,
  },
  database: {
    label: 'Abrir Banco de dados',
    description:
      'Há migrations novas; abra Banco de dados para revisar e aplicá-las.',
    routeName: 'project-database',
    priority: 2,
  },
  environment: {
    label: 'Revisar variáveis de ambiente',
    description:
      'O arquivo de exemplo de variáveis mudou; revise os nomes esperados.',
    routeName: 'project-environment',
    priority: 3,
  },
  server: {
    label: 'Revisar configuração do servidor',
    description:
      'A configuração de servidor/worker mudou; reinicie manualmente quando desejar.',
    routeName: 'project-server',
    priority: 4,
  },
  tests: {
    label: 'Executar testes',
    description:
      'Arquivos de teste mudaram; execute os testes relacionados quando desejar.',
    routeName: 'project-tests',
    priority: 5,
  },
};

function normalizeChangedPath(value: string): string | null {
  const normalized = value.trim().replaceAll('\\', '/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized.split('/').includes('..')
  ) {
    return null;
  }
  return normalized;
}

/**
 * Classificador puro: recebe caminhos já relativos ao projeto e devolve as
 * recomendações correspondentes, sem ler conteúdo de arquivo nem tocar o
 * disco. Testável isoladamente do Git.
 */
export function classifyProjectChangeImpact(
  changedPaths: readonly string[],
): ProjectChangeImpactAction[] {
  const matchedByCategory = new Map<ProjectChangeImpactCategory, Set<string>>();

  for (const rawPath of changedPaths) {
    const normalized = normalizeChangedPath(rawPath);
    if (!normalized) continue;
    for (const rule of RULES) {
      if (!rule.pattern.test(normalized)) continue;
      const matched = matchedByCategory.get(rule.category) ?? new Set<string>();
      matched.add(normalized);
      matchedByCategory.set(rule.category, matched);
    }
  }

  return [...matchedByCategory.entries()]
    .sort(
      ([a], [b]) =>
        ACTION_BY_CATEGORY[a].priority - ACTION_BY_CATEGORY[b].priority,
    )
    .map(([category, matchedPaths]) => {
      const template = ACTION_BY_CATEGORY[category];
      return {
        category,
        label: template.label,
        description: template.description,
        routeName: template.routeName,
        matchedPaths: [...matchedPaths].sort(),
      };
    });
}

/**
 * Compara dois SHAs já conhecidos pela mutação Git que os capturou (troca de
 * branch, pull, sincronização) e devolve a lista de recomendações. Nunca lê
 * conteúdo de arquivo — só `git diff --name-only`. SHA inválido, ausente ou
 * commits iguais produzem um resultado vazio e seguro em vez de lançar erro,
 * porque o impacto é sempre informativo, nunca bloqueante.
 */
export async function computeProjectChangeImpact(
  projectPath: string,
  previousSha: string,
  currentSha: string,
): Promise<ProjectChangeImpact> {
  const empty: ProjectChangeImpact = {
    previousSha,
    currentSha,
    changedPaths: [],
    actions: [],
  };

  if (!SHA_PATTERN.test(previousSha) || !SHA_PATTERN.test(currentSha))
    return empty;
  if (previousSha === currentSha) return empty;

  let output: string;
  try {
    output = await runGit(projectPath, [
      'diff',
      '--name-only',
      '-z',
      previousSha,
      currentSha,
    ]);
  } catch {
    return empty;
  }

  const changedPaths = output
    .split('\0')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return {
    previousSha,
    currentSha,
    changedPaths,
    actions: classifyProjectChangeImpact(changedPaths),
  };
}
