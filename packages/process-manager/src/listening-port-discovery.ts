import { readFile, readdir, readlink } from 'node:fs/promises';

const TCP_LISTEN_STATE = '0A';

function isValidManagedPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1_024 && port <= 65_535;
}

export function parseListeningPortsFromProcNet(
  contents: string,
  socketInodes: ReadonlySet<string>,
): number[] {
  const ports = new Set<number>();

  for (const line of contents.split('\n').slice(1)) {
    const columns = line.trim().split(/\s+/);

    if (
      columns.length < 10 ||
      columns[3] !== TCP_LISTEN_STATE ||
      !socketInodes.has(columns[9] ?? '')
    ) {
      continue;
    }

    const localAddress = columns[1] ?? '';
    const separatorIndex = localAddress.lastIndexOf(':');

    if (separatorIndex < 0) {
      continue;
    }

    const port = Number.parseInt(localAddress.slice(separatorIndex + 1), 16);

    if (isValidManagedPort(port)) {
      ports.add(port);
    }
  }

  return [...ports].sort((left, right) => left - right);
}

async function collectProcessTreePids(rootPid: number): Promise<number[]> {
  const pending = [rootPid];
  const visited = new Set<number>();

  while (pending.length > 0) {
    const pid = pending.shift();

    if (pid === undefined || visited.has(pid)) {
      continue;
    }

    visited.add(pid);

    try {
      const children = await readFile(
        `/proc/${pid}/task/${pid}/children`,
        'utf8',
      );

      for (const rawChildPid of children.trim().split(/\s+/)) {
        if (!rawChildPid) continue;

        const childPid = Number(rawChildPid);
        if (Number.isSafeInteger(childPid) && childPid > 0) {
          pending.push(childPid);
        }
      }
    } catch {
      // O processo pode ter terminado entre a leitura do status e esta busca.
    }
  }

  return [...visited];
}

async function collectSocketInodes(pids: number[]): Promise<Set<string>> {
  const socketInodes = new Set<string>();

  for (const pid of pids) {
    let descriptors: string[];

    try {
      descriptors = await readdir(`/proc/${pid}/fd`);
    } catch {
      continue;
    }

    for (const descriptor of descriptors) {
      try {
        const target = await readlink(`/proc/${pid}/fd/${descriptor}`);
        const match = /^socket:\[(\d+)\]$/.exec(target);

        if (match?.[1]) {
          socketInodes.add(match[1]);
        }
      } catch {
        // Descritores podem desaparecer enquanto o processo inicializa.
      }
    }
  }

  return socketInodes;
}

async function readProcNetworkTable(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Descobre, de forma best-effort, portas TCP em LISTEN pertencentes ao processo
 * gerenciado ou a algum descendente dele. Isso cobre scripts npm que iniciam um
 * servidor filho e ignoram as variáveis PORT/HOST injetadas pelo dashboard.
 *
 * Em plataformas sem /proc o comportamento anterior é preservado: a detecção
 * retorna vazia e o status continua usando a porta que já estava registrada.
 */
export async function detectListeningPortsForProcessTree(
  rootPid: number,
): Promise<number[]> {
  if (process.platform !== 'linux') {
    return [];
  }

  const processTreePids = await collectProcessTreePids(rootPid);
  const socketInodes = await collectSocketInodes(processTreePids);

  if (socketInodes.size === 0) {
    return [];
  }

  const [ipv4Table, ipv6Table] = await Promise.all([
    readProcNetworkTable('/proc/net/tcp'),
    readProcNetworkTable('/proc/net/tcp6'),
  ]);

  return [
    ...new Set([
      ...parseListeningPortsFromProcNet(ipv4Table, socketInodes),
      ...parseListeningPortsFromProcNet(ipv6Table, socketInodes),
    ]),
  ].sort((left, right) => left - right);
}
