import type {
  ProjectCapability,
  ProjectType,
} from '@dev-dashboard/contracts';

export const projectTypeLabels: Record<ProjectType, string> = {
  rails: 'Rails',
  node: 'Node',
  unknown: 'Desconhecido',
};

export const capabilityLabels: Record<
  ProjectCapability,
  string
> = {
  server: 'Servidor',
  git: 'Git',
  tests: 'Testes',
  database: 'Banco',
  scripts: 'Scripts',
  webpack: 'Webpack',
  sidekiq: 'Sidekiq',
  rake: 'Rake',
  bundler: 'Bundler',
};

export function capabilityLabel(
  capability: ProjectCapability,
): string {
  return capabilityLabels[capability];
}

export function projectInitials(name: string): string {
  return name
    .replace(/^[._-]+/, '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
