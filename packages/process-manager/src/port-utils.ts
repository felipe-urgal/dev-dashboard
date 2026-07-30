import { createConnection, createServer } from 'node:net';

import { networkInterfaces } from 'node:os';

import { ProcessManagerError } from './errors.js';

export function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < 1_024 || port > 65_535) {
    throw new ProcessManagerError(
      'INVALID_PORT',
      'A porta deve estar entre 1024 e 65535.',
    );
  }
}

export const SERVER_BIND_HOST = '0.0.0.0';

function isIpv4Family(family: string | number): boolean {
  return family === 'IPv4' || family === 4;
}

export function listServerUrls(port: number): string[] {
  const urls = new Set<string>([
    `http://localhost:${port}`,
  ]);

  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (
        !isIpv4Family(address.family) ||
        address.internal ||
        address.address === '0.0.0.0'
      ) {
        continue;
      }

      urls.add(`http://${address.address}:${port}`);
    }
  }

  return [...urls];
}

export async function canConnect(
  host: string,
  port: number,
  timeoutMs = 250,
): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = createConnection({ host, port });
    let settled = false;

    const finish = (connected: boolean): void => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      resolve(connected);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

export async function canListen(
  host: string,
  port: number,
): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const server = createServer();

    server.unref();

    server.once('error', () => {
      resolve(false);
    });

    server.listen(
      {
        host,
        port,
      },
      () => {
        server.close(() => {
          resolve(true);
        });
      },
    );
  });
}

export async function findAvailablePort(
  host: string,
  initialPort = 3000,
  finalPort = 3999,
): Promise<number> {
  for (let port = initialPort; port <= finalPort; port += 1) {
    if (await canListen(host, port)) {
      return port;
    }
  }

  throw new Error(
    `Nenhuma porta livre encontrada entre ${initialPort} e ${finalPort}.`,
  );
}
