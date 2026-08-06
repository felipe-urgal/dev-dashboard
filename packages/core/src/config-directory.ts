import { homedir } from 'node:os';
import path from 'node:path';

/**
 * Diretório de configuração local, respeitando DEV_DASHBOARD_CONFIG_DIR e
 * XDG_CONFIG_HOME antes de cair no padrão `~/.config/dev-dashboard`.
 */
export function resolveConfigDirectory(): string {
  const configuredDirectory = process.env.DEV_DASHBOARD_CONFIG_DIR?.trim();

  if (configuredDirectory) {
    return path.resolve(configuredDirectory);
  }

  const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();

  if (xdgConfigHome) {
    return path.join(path.resolve(xdgConfigHome), 'dev-dashboard');
  }

  return path.join(homedir(), '.config', 'dev-dashboard');
}
