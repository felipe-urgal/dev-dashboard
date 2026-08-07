import path from 'node:path';

/**
 * Checagem central de contenção de caminho (prevenção de path traversal):
 * usada sempre depois de `realpath()`/`path.resolve()` já ter canonicalizado
 * `target`, para confirmar que ele continua dentro de `root` mesmo após
 * symlinks serem seguidos. Baseada em `path.relative` para lidar
 * corretamente com separadores redundantes e o caso `target === root`.
 */
export function isPathWithinRoot(root: string, target: string): boolean {
  const relativePath = path.relative(root, target);
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== '..' &&
      !path.isAbsolute(relativePath))
  );
}

const IGNORED_PROJECT_PATHS = [
  '.git',
  'node_modules',
  'vendor/bundle',
  'coverage',
  'dist',
  'build',
  'tmp/log',
] as const;

export function isIgnoredProjectPath(relativePath: string): boolean {
  return IGNORED_PROJECT_PATHS.some(
    (ignored) =>
      relativePath === ignored || relativePath.startsWith(`${ignored}/`),
  );
}

export function isSensitiveProjectPath(relativePath: string): boolean {
  const normalized = relativePath.toLowerCase();
  const name = path.posix.basename(normalized);
  return (
    normalized === 'config/master.key' ||
    name === 'id_rsa' ||
    name === 'id_ed25519' ||
    name.startsWith('.env') ||
    name.endsWith('.pem') ||
    name.endsWith('.key')
  );
}
