import { realpath } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_API_PORT = 4343;
export const API_HOST = '127.0.0.1';

export interface ServerConfig {
  host: typeof API_HOST;
  port: number;
  localOrigin: string;
  staticDashboardEnabled: boolean;
  frontendDirectory?: string;
  browserBootstrapToken?: string;
}

export function parseApiPort(value: string | undefined): number {
  if (value === undefined || value === '') return DEFAULT_API_PORT;
  if (!/^\d+$/.test(value))
    throw new Error(`DEV_DASHBOARD_API_PORT inválida: ${value}`);
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`DEV_DASHBOARD_API_PORT inválida: ${value}`);
  }
  return port;
}

export async function resolveWebDist(
  value: string | undefined,
  cwd = process.cwd(),
): Promise<string | undefined> {
  if (!value) return undefined;
  const absolute = path.resolve(cwd, value);
  try {
    return await realpath(absolute);
  } catch {
    return absolute;
  }
}

export async function readServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): Promise<ServerConfig> {
  const port = parseApiPort(environment.DEV_DASHBOARD_API_PORT);
  const staticDashboardEnabled =
    environment.DEV_DASHBOARD_LOCAL_DISTRIBUTION === '1';
  if (environment.DEV_DASHBOARD_LOCAL_DISTRIBUTION && !staticDashboardEnabled) {
    throw new Error(
      'DEV_DASHBOARD_LOCAL_DISTRIBUTION deve ser 1 quando informada.',
    );
  }
  const frontendDirectory = await resolveWebDist(
    environment.DEV_DASHBOARD_WEB_DIST,
    cwd,
  );
  const browserBootstrapToken = environment.DEV_DASHBOARD_BROWSER_BOOTSTRAP;
  if (staticDashboardEnabled && !frontendDirectory) {
    throw new Error(
      'DEV_DASHBOARD_WEB_DIST é obrigatória no modo de distribuição local.',
    );
  }
  if (staticDashboardEnabled && !browserBootstrapToken) {
    throw new Error(
      'DEV_DASHBOARD_BROWSER_BOOTSTRAP é obrigatória no modo de distribuição local.',
    );
  }
  if (browserBootstrapToken && !/^[a-f0-9]{64}$/.test(browserBootstrapToken)) {
    throw new Error(
      'DEV_DASHBOARD_BROWSER_BOOTSTRAP deve conter 64 caracteres hexadecimais.',
    );
  }
  return {
    host: API_HOST,
    port,
    localOrigin: `http://${API_HOST}:${port}`,
    staticDashboardEnabled,
    ...(frontendDirectory ? { frontendDirectory } : {}),
    ...(browserBootstrapToken ? { browserBootstrapToken } : {}),
  };
}
