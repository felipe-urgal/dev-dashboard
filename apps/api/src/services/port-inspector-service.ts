import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import type {
  DeclaredProjectPort,
  LocalPortEntry,
  LocalPortExpectation,
  LocalPortExternalProcess,
  LocalPortInspection,
  ManagedProcess,
  ObservedPort,
  ReservedPort,
} from '@dev-dashboard/contracts';

import { allocatePort, reconcilePorts } from './port-registry-service.js';

const COMMAND_TIMEOUT_MS = 1_500;
const MAX_OUTPUT_BYTES = 256 * 1_024;
const DEFAULT_MAX_ENTRIES = 100;

const ACTIVE_STATUSES = new Set(['starting', 'running', 'stopping']);

interface ParsedSocket {
  address: string;
  port: number;
  scope: 'loopback' | 'all-interfaces';
  pid?: number;
  processName?: string;
}

interface PendingEntry {
  entry: LocalPortEntry;
  externalPid?: number;
  externalName?: string;
}

interface ObservedSocket {
  socket: ParsedSocket;
  managed: ManagedProcess | undefined;
}

export interface ExpectedLocalPort extends LocalPortExpectation {
  port: number;
}

export interface InspectLocalPortsInput {
  managedProcesses?: readonly ManagedProcess[];
  expectedPorts?: readonly ExpectedLocalPort[];
  projectNames?: Readonly<Record<string, string>>;
  /** Reservas globais/importadas que devem participar da reconciliação. */
  reservedPorts?: readonly ReservedPort[];
  /** Declarações adicionais vindas de Compose/Profile/configuração importada. */
  declaredPorts?: readonly DeclaredProjectPort[];
}

export interface PortInspectorServiceOptions {
  platform?: NodeJS.Platform;
  now?: () => Date;
  runSs?: () => Promise<string>;
  readTextFile?: (filePath: string) => Promise<string>;
  getUid?: () => number | undefined;
  maxEntries?: number;
}

function runSsCommand(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'ss',
      ['-H', '-ltnp'],
      {
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT_BYTES,
        timeout: COMMAND_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(stdout);
      },
    );
  });
}

function sanitizeProcessName(value: string): string {
  const sanitized = value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 64);

  return sanitized || 'processo';
}

function normalizeAddress(
  value: string,
): Pick<ParsedSocket, 'address' | 'scope'> | null {
  const address = value
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split('%', 1)[0]
    ?.toLowerCase();

  if (!address) return null;

  if (address === '*' || address === '0.0.0.0') {
    return {
      address: '0.0.0.0',
      scope: 'all-interfaces',
    };
  }

  if (address === '::') {
    return {
      address: '::',
      scope: 'all-interfaces',
    };
  }

  if (
    address === 'localhost' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1' ||
    /^127(?:\.\d{1,3}){3}$/.test(address)
  ) {
    return {
      address: address === 'localhost' ? '127.0.0.1' : address,
      scope: 'loopback',
    };
  }

  return null;
}

function parseEndpoint(
  value: string,
): Pick<ParsedSocket, 'address' | 'port' | 'scope'> | null {
  const separator = value.lastIndexOf(':');
  if (separator <= 0) return null;

  const port = Number(value.slice(separator + 1));
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return null;
  }

  const normalized = normalizeAddress(value.slice(0, separator));
  if (!normalized) return null;

  return {
    ...normalized,
    port,
  };
}

function parseSocketLine(line: string): ParsedSocket | null {
  const columns = line.trim().split(/\s+/);
  const endpoint = parseEndpoint(columns[3] ?? '');
  if (!endpoint) return null;

  const processMatch = line.match(/\("([^"]{1,64})",pid=(\d+)/);
  const parsedPid = processMatch?.[2] ? Number(processMatch[2]) : undefined;
  const pid =
    parsedPid !== undefined && Number.isInteger(parsedPid) && parsedPid > 0
      ? parsedPid
      : undefined;

  return {
    ...endpoint,
    ...(pid !== undefined ? { pid } : {}),
    ...(processMatch?.[1]
      ? { processName: sanitizeProcessName(processMatch[1]) }
      : {}),
  };
}

function parseSockets(contents: string): ParsedSocket[] {
  const seen = new Set<string>();
  const sockets: ParsedSocket[] = [];

  for (const line of contents.split(/\r?\n/)) {
    const socket = parseSocketLine(line);
    if (!socket) continue;

    const key = [socket.address, socket.port, socket.pid ?? ''].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    sockets.push(socket);
  }

  return sockets;
}

function chooseManagedProcess(
  socket: ParsedSocket,
  managedProcesses: readonly ManagedProcess[],
): ManagedProcess | undefined {
  const candidates = managedProcesses.filter(
    (managed) =>
      managed.port === socket.port && ACTIVE_STATUSES.has(managed.status),
  );

  if (socket.pid !== undefined) {
    return candidates.find((managed) => managed.pid === socket.pid);
  }

  return candidates.length === 1 ? candidates[0] : undefined;
}

function groupExpectations(
  expectedPorts: readonly ExpectedLocalPort[],
): Map<number, LocalPortExpectation[]> {
  const grouped = new Map<number, LocalPortExpectation[]>();

  for (const expected of expectedPorts) {
    if (
      !Number.isInteger(expected.port) ||
      expected.port < 1_024 ||
      expected.port > 65_535
    ) {
      continue;
    }

    const current = grouped.get(expected.port) ?? [];
    if (
      current.some((candidate) => candidate.projectId === expected.projectId)
    ) {
      continue;
    }

    current.push({
      projectId: expected.projectId,
      projectName: expected.projectName,
      service: 'server',
    });
    current.sort((left, right) =>
      left.projectName.localeCompare(right.projectName),
    );
    grouped.set(expected.port, current);
  }

  return grouped;
}

function declaredPorts(
  expectedPorts: readonly ExpectedLocalPort[],
): DeclaredProjectPort[] {
  return expectedPorts
    .filter(
      (expected) =>
        Number.isInteger(expected.port) &&
        expected.port >= 1_024 &&
        expected.port <= 65_535,
    )
    .map((expected) => ({
      projectId: expected.projectId,
      port: expected.port,
      role: expected.service,
      source: 'config',
      confidence: 'certain',
    }));
}

function observedPorts(
  observedSockets: readonly ObservedSocket[],
): ObservedPort[] {
  return observedSockets.map(({ socket, managed }) => ({
    port: socket.port,
    owner: managed
      ? {
          kind: 'project' as const,
          projectId: managed.projectId,
          processId: managed.id,
        }
      : { kind: 'unknown' as const },
    address: socket.address,
    protocol: 'tcp',
  }));
}

function isConflictState(
  state: ReturnType<typeof reconcilePorts>['entries'][number]['state'] | undefined,
): boolean {
  return (
    state === 'conflict' ||
    state === 'reserved-by-other' ||
    state === 'duplicate-declaration'
  );
}

export class PortInspectorService {
  private readonly platform: NodeJS.Platform;
  private readonly now: () => Date;
  private readonly runSs: () => Promise<string>;
  private readonly readTextFile: (filePath: string) => Promise<string>;
  private readonly getUid: () => number | undefined;
  private readonly maxEntries: number;

  public constructor(options: PortInspectorServiceOptions = {}) {
    this.platform = options.platform ?? process.platform;
    this.now = options.now ?? (() => new Date());
    this.runSs = options.runSs ?? runSsCommand;
    this.readTextFile =
      options.readTextFile ?? ((filePath) => readFile(filePath, 'utf8'));
    this.getUid =
      options.getUid ??
      (() =>
        typeof process.getuid === 'function' ? process.getuid() : undefined);
    this.maxEntries = Math.max(
      1,
      Math.min(DEFAULT_MAX_ENTRIES, options.maxEntries ?? DEFAULT_MAX_ENTRIES),
    );
  }

  private async externalProcess(
    pid: number,
    fallbackName = 'processo',
  ): Promise<LocalPortExternalProcess | undefined> {
    const currentUid = this.getUid();
    if (currentUid === undefined) return undefined;

    let status: string;
    try {
      status = await this.readTextFile(`/proc/${pid}/status`);
    } catch {
      return undefined;
    }

    const uidMatch = status.match(/^Uid:\s+(\d+)/m);
    if (!uidMatch?.[1] || Number(uidMatch[1]) !== currentUid) {
      return undefined;
    }

    let name = fallbackName;
    try {
      name = await this.readTextFile(`/proc/${pid}/comm`);
    } catch {
      // O nome limitado do `ss` só é usado depois da
      // confirmação de que o PID pertence ao usuário atual.
    }

    return {
      pid,
      name: sanitizeProcessName(name),
    };
  }

  public async inspect(
    input: InspectLocalPortsInput = {},
  ): Promise<LocalPortInspection> {
    const inspectedAt = this.now().toISOString();

    if (this.platform !== 'linux') {
      return {
        status: 'unsupported',
        platform: 'unsupported',
        inspectedAt,
        entries: [],
        truncated: false,
        warning:
          'A primeira versão do inspetor de portas está disponível somente no Linux.',
      };
    }

    let output: string;
    try {
      output = await this.runSs();
    } catch {
      return {
        status: 'unavailable',
        platform: 'linux',
        inspectedAt,
        entries: [],
        truncated: false,
        warning:
          'Não foi possível consultar as portas locais. Verifique se o utilitário ss está disponível.',
      };
    }

    const sockets = parseSockets(output);
    const managedProcesses = input.managedProcesses ?? [];
    const expectedPorts = input.expectedPorts ?? [];
    const projectNames = input.projectNames ?? {};
    const expectations = groupExpectations(expectedPorts);
    const declarations = [
      ...declaredPorts(expectedPorts),
      ...(input.declaredPorts ?? []),
    ];
    const reservations = input.reservedPorts ?? [];
    const observedSockets: ObservedSocket[] = sockets.map((socket) => ({
      socket,
      managed: chooseManagedProcess(socket, managedProcesses),
    }));
    const observations = observedPorts(observedSockets);
    const reconciliation = reconcilePorts({
      reserved: reservations,
      declared: declarations,
      observed: observations,
    });
    const reconciliationByPort = new Map(
      reconciliation.entries.map((entry) => [entry.port, entry]),
    );
    const occupiedPorts = new Set(sockets.map((socket) => socket.port));
    const pending: PendingEntry[] = [];

    for (const { socket, managed } of observedSockets) {
      const expected = expectations.get(socket.port) ?? [];
      const reconciled = reconciliationByPort.get(socket.port);
      const conflict = isConflictState(reconciled?.state);
      const expectedOwner = expected.length === 1 ? expected[0] : undefined;
      const allocation =
        conflict && expectedOwner
          ? allocatePort(
              {
                reserved: reservations,
                declared: declarations,
                observed: observations,
              },
              {
                preferredPort: socket.port,
                projectId: expectedOwner.projectId,
                role: expectedOwner.service,
              },
            )
          : null;

      const entry: LocalPortEntry = {
        port: socket.port,
        address: socket.address,
        scope: socket.scope,
        state: 'occupied',
        conflict,
        expected: [...expected],
        ...(managed
          ? {
              managedProcess: {
                id: managed.id,
                projectId: managed.projectId,
                projectName:
                  projectNames[managed.projectId] ?? managed.projectId,
                kind: managed.kind,
                status: managed.status,
              },
            }
          : {}),
        ...(allocation ? { suggestedPort: allocation.port } : {}),
      };

      pending.push({
        entry,
        ...(!managed && socket.pid !== undefined
          ? { externalPid: socket.pid }
          : {}),
        ...(!managed && socket.processName
          ? { externalName: socket.processName }
          : {}),
      });
    }

    for (const [port, expected] of expectations) {
      if (occupiedPorts.has(port)) continue;

      const reconciled = reconciliationByPort.get(port);
      const conflict = isConflictState(reconciled?.state);
      const expectedOwner = expected.length === 1 ? expected[0] : undefined;
      const allocation =
        conflict && expectedOwner
          ? allocatePort(
              {
                reserved: reservations,
                declared: declarations,
                observed: observations,
              },
              {
                preferredPort: port,
                projectId: expectedOwner.projectId,
                role: expectedOwner.service,
              },
            )
          : null;

      pending.push({
        entry: {
          port,
          address: '127.0.0.1',
          scope: 'loopback',
          state: 'available',
          conflict,
          expected: [...expected],
          ...(allocation ? { suggestedPort: allocation.port } : {}),
        },
      });
    }

    pending.sort((left, right) => {
      const conflictDifference =
        Number(right.entry.conflict) - Number(left.entry.conflict);
      if (conflictDifference !== 0) {
        return conflictDifference;
      }

      const expectedDifference =
        Number(right.entry.expected.length > 0) -
        Number(left.entry.expected.length > 0);
      if (expectedDifference !== 0) {
        return expectedDifference;
      }

      const portDifference = left.entry.port - right.entry.port;
      if (portDifference !== 0) return portDifference;
      return left.entry.address.localeCompare(right.entry.address);
    });

    const truncated = pending.length > this.maxEntries;
    const selected = pending.slice(0, this.maxEntries);
    const entries = await Promise.all(
      selected.map(async (candidate) => {
        if (candidate.externalPid === undefined) {
          return candidate.entry;
        }

        const externalProcess = await this.externalProcess(
          candidate.externalPid,
          candidate.externalName,
        );

        return externalProcess
          ? {
              ...candidate.entry,
              externalProcess,
            }
          : candidate.entry;
      }),
    );

    return {
      status: 'ready',
      platform: 'linux',
      inspectedAt,
      entries,
      truncated,
    };
  }
}
