import { homedir } from 'node:os';

import path from 'node:path';

export function resolveStateDirectory(): string {
  const configuredDirectory =
    process.env.DEV_DASHBOARD_STATE_DIR?.trim();

  if (configuredDirectory) {
    return path.resolve(configuredDirectory);
  }

  const xdgStateHome = process.env.XDG_STATE_HOME?.trim();

  if (xdgStateHome) {
    return path.join(path.resolve(xdgStateHome), 'dev-dashboard');
  }

  return path.join(homedir(), '.local', 'state', 'dev-dashboard');
}
